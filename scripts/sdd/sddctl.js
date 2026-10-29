#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const PROJECT_ROOT = process.cwd();
const PROJECT_ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
let secretForRedaction = '';

export const RUNNER_RPCS = new Set([
  'sdd_health', 'sdd_register_spec_version', 'sdd_create_batch', 'sdd_validate_batch',
  'sdd_claim_batch', 'sdd_heartbeat', 'sdd_start_next_spec', 'sdd_record_task',
  'sdd_record_gate', 'sdd_save_checkpoint', 'sdd_open_failure', 'sdd_begin_correction',
  'sdd_open_fix_window', 'sdd_close_fix_window', 'sdd_finish_correction',
  'sdd_complete_spec', 'sdd_pause_batch', 'sdd_recover_interrupted', 'sdd_status', 'sdd_events',
]);

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function canonicalContentHash(files) {
  const canonical = [...files]
    .sort((a, b) => a.path.localeCompare(b.path, 'en'))
    .map(({ path: filePath, content }) => `${filePath.replaceAll('\\', '/') }\0${content.replace(/\r\n?/g, '\n')}`)
    .join('\0');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function parseDependencies(specText) {
  const match = specText.match(/^\s*(?:\*\*)?dependencies(?:\*\*)?\s*:\s*(.*)$/mi);
  if (!match) return [];
  const raw = match[1].trim().replace(/^`|`$/g, '');
  const values = raw.startsWith('[') && raw.endsWith(']')
    ? raw.slice(1, -1).split(',')
    : raw.split(',');
  return [...new Set(values.map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean))];
}

export function parseSpecVersion(specText) {
  const match = specText.match(/^\s*(?:\*\*)?version(?:\*\*)?\s*:\s*`?(\d+)`?\s*$/mi);
  const version = Number(match?.[1] || 1);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('A vers\u00e3o da SPEC precisa ser um inteiro positivo.');
  return version;
}

export function stableIdempotencyKey(namespace, value) {
  const bytes = createHash('sha256')
    .update(`flowzenit-sdd/${namespace}\0${JSON.stringify(value)}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function prepareApprovalSql({ batchId, manifestHash, approvedBy, idempotencyKey = randomUUID() }) {
  const confirmation = `APROVAR ${batchId} ${manifestHash}`;
  return [
    '-- Execute only through the privileged Supabase SQL/MCP channel, after the user approves this exact manifest.',
    `SELECT public.sdd_approve_batch(${sqlLiteral(batchId)}, ${sqlLiteral(manifestHash)}, ${sqlLiteral(approvedBy)}, ${sqlLiteral(confirmation)}, ${sqlLiteral(idempotencyKey)});`,
  ].join('\n');
}

export function parseSpecReference(reference) {
  const match = reference.match(/^([A-Z][A-Z0-9]+-[0-9]{2,})@(\d+)$/);
  if (!match) throw new Error(`SPEC inválida: ${reference}. Use ID@VERSÃO, por exemplo CORE-001@1.`);
  return { spec_id: match[1], version: Number(match[2]) };
}

export function parseEnvFile(text) {
  const parsed = {};
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

export function resolveSupabaseCredentials({ processEnv = {}, fileEnv = {} } = {}) {
  const firstValue = (...values) => values.find((value) => typeof value === 'string' && value.trim()) || '';
  return {
    url: firstValue(
      processEnv.SUPABASE_URL,
      fileEnv.SUPABASE_URL,
      processEnv.VITE_SUPABASE_URL,
      fileEnv.VITE_SUPABASE_URL,
    ),
    key: firstValue(processEnv.SUPABASE_SECRET_KEY, fileEnv.SUPABASE_SECRET_KEY),
  };
}

export function redactSecretValues(value, secrets = []) {
  let output = String(value);
  for (const secret of secrets.filter((item) => typeof item === 'string' && item.length > 0).sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(secret, '[REDACTED]');
  }
  return output;
}

async function createSupabaseClient() {
  let fileEnv = {};
  try {
    fileEnv = parseEnvFile(await readFile(PROJECT_ENV_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const { url, key } = resolveSupabaseCredentials({ processEnv: process.env, fileEnv });
  secretForRedaction = key;
  if (!key) throw new Error('Preencha SUPABASE_SECRET_KEY em .env.local.');
  if (!url) throw new Error('Preencha SUPABASE_URL ou VITE_SUPABASE_URL em .env.local.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function print(value) {
  const output = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  process.stdout.write(`${redactSecretValues(output, [secretForRedaction])}\n`);
}

function parseFlags(args) {
  const values = [];
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) {
      values.push(value);
      continue;
    }
    const key = value.slice(2);
    if (!key || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error(`Informe um valor para --${key}.`);
    }
    flags[key] = args[index + 1];
    index += 1;
  }
  return { values, flags };
}

function required(flags, key) {
  if (!flags[key]?.trim()) throw new Error(`Parâmetro obrigatório: --${key}.`);
  return flags[key].trim();
}

async function collectMarkdownFiles(directory) {
  const files = [];
  async function visit(current, relativeDirectory = '') {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.isSymbolicLink()) continue;
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push({ path: relativePath, content: await readFile(absolutePath, 'utf8') });
      }
    }
  }
  await visit(directory);
  return files;
}

async function registerSpec(client, directory, actor, suppliedIdempotencyKey) {
  const absolute = path.resolve(PROJECT_ROOT, directory);
  const specsRoot = path.resolve(PROJECT_ROOT, 'specs');
  const relativeToSpecs = path.relative(specsRoot, absolute);
  if (!relativeToSpecs || relativeToSpecs.startsWith('..') || path.isAbsolute(relativeToSpecs)) {
    throw new Error('O diretório da SPEC precisa estar dentro de specs/<ID>.');
  }
  const specId = path.basename(absolute);
  if (!/^[A-Z][A-Z0-9]+-[0-9]{2,}$/.test(specId)) throw new Error(`ID de SPEC inválido no diretório: ${specId}.`);
  const files = await collectMarkdownFiles(absolute);
  if (!files.some((file) => file.path.toLowerCase() === 'spec.md')
    || !files.some((file) => file.path.toLowerCase() === 'plan.md')
    || !files.some((file) => file.path.toLowerCase() === 'tasks.md')) {
    throw new Error('A SPEC precisa conter spec.md, plan.md e tasks.md antes do registro.');
  }
  const specText = files.find((file) => file.path.toLowerCase() === 'spec.md').content;
  const title = specText.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) throw new Error('Inclua um título de nível 1 em spec.md.');
  const version = parseSpecVersion(specText);
  const contentHash = canonicalContentHash(files);
  const docs = Object.fromEntries(files.map((file) => [file.path.replaceAll('\\', '/'), file.content.replace(/\r\n?/g, '\n')]));
  const sourcePaths = files.map((file) => path.posix.join('specs', specId, file.path.replaceAll('\\', '/')));
  const { data, error } = await client.rpc('sdd_register_spec_version', {
    p_spec_id: specId,
    p_title: title,
    p_version: version,
    p_content_hash: contentHash,
    p_source_paths: sourcePaths,
    p_dependencies: parseDependencies(specText),
    p_snapshot: { documents: docs },
    p_registered_by: actor,
    p_idempotency_key: suppliedIdempotencyKey
      || stableIdempotencyKey('register-spec-version', { specId, version, contentHash }),
  });
  if (error) throw error;
  return { spec_id: specId, version, spec_version_id: data, source_paths: sourcePaths };
}

async function getBatchStatus(client, batchId) {
  const { data, error } = await client.rpc('sdd_status', { p_batch_id: batchId });
  if (error) throw error;
  const batch = data?.batches?.find((item) => item.batch_id === batchId);
  if (!batch) throw new Error(`Lote não encontrado: ${batchId}.`);
  return batch;
}

async function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === 'help') {
    print(`FlowZenit SDD supervisor\n\nComandos:\n  health\n  status [LOTE]\n  events LOTE [EVENT_ID_INICIAL]\n  register specs/ID --by AUTOR [--key UUID]\n  create-batch NOME SPEC@VERSÃO... --by AUTOR [--key UUID]\n  validate LOTE\n  prepare-approval LOTE --by AUTOR\n  claim LOTE --owner ID [--key UUID]\n  heartbeat LOTE --lease UUID --owner ID\n  next LOTE --lease UUID --owner ID\n  record RPC --json JSON\n  recover LOTE\n  prepare-resume LOTE --by AUTOR --reason MOTIVO --owner ID\n  prepare-extension LOTE SPEC TENTATIVAS SEGUNDOS --by AUTOR --reason MOTIVO\n\nAprovação, extensão e retomada exigem a conexão administrativa do Supabase. O CLI apenas prepara o SQL; não executa essas autorizações.`);
    return;
  }
  if (!RUNNER_RPCS.has(command) && !['health', 'status', 'events', 'register', 'create-batch', 'validate', 'prepare-approval', 'claim', 'heartbeat', 'next', 'record', 'recover', 'prepare-resume', 'prepare-extension'].includes(command)) {
    throw new Error(`Comando desconhecido: ${command}. Use sddctl help.`);
  }

  if (command === 'prepare-resume' || command === 'prepare-extension' || command === 'prepare-approval') {
    const { values, flags } = parseFlags(args);
    const client = await createSupabaseClient();
    if (command === 'prepare-approval') {
      const batchId = values[0];
      const approvedBy = required(flags, 'by');
      if (!batchId) throw new Error('Informe o ID do lote.');
      const batch = await getBatchStatus(client, batchId);
      const { data, error } = await client.rpc('sdd_validate_batch', { p_batch_id: batchId });
      if (error) throw error;
      if (!data?.valid || batch.state !== 'READY_FOR_APPROVAL') throw new Error('O lote precisa estar válido e aguardando aprovação.');
      print(prepareApprovalSql({ batchId, manifestHash: batch.manifest_hash, approvedBy }));
      return;
    }
    if (command === 'prepare-resume') {
      const batchId = values[0];
      const approvedBy = required(flags, 'by');
      const reason = required(flags, 'reason');
      const ownerId = required(flags, 'owner');
      if (!batchId) throw new Error('Informe o ID do lote.');
      const batch = await getBatchStatus(client, batchId);
      if (batch.state !== 'PAUSED') throw new Error('Somente um lote PAUSED pode ser retomado.');
      const confirmation = `RETOMAR ${batchId} ${batch.manifest_hash}`;
      const sql = `-- Requer execução administrativa após autorização explícita do usuário.\nSELECT public.sdd_resume_batch(${sqlLiteral(batchId)}, ${sqlLiteral(approvedBy)}, ${sqlLiteral(reason)}, ${sqlLiteral(confirmation)}, ${sqlLiteral(ownerId)}, ${sqlLiteral(randomUUID())});`;
      print(sql);
      return;
    }
    const [batchId, specId, attemptsText, secondsText] = values;
    const approvedBy = required(flags, 'by');
    const reason = required(flags, 'reason');
    const attempts = Number(attemptsText);
    const seconds = Number(secondsText);
    if (!batchId || !specId || !Number.isInteger(attempts) || !Number.isInteger(seconds)
      || attempts < 0 || seconds < 0 || (attempts === 0 && seconds === 0)) {
      throw new Error('Use: prepare-extension LOTE SPEC TENTATIVAS SEGUNDOS --by AUTOR --reason MOTIVO.');
    }
    const confirmation = `ESTENDER ${batchId} ${specId} ${attempts} ${seconds}`;
    print(`-- Requer execução administrativa após autorização explícita do usuário.\nSELECT public.sdd_extend_limits(${sqlLiteral(batchId)}, ${sqlLiteral(specId)}, ${attempts}, ${seconds}, ${sqlLiteral(approvedBy)}, ${sqlLiteral(reason)}, ${sqlLiteral(confirmation)}, ${sqlLiteral(randomUUID())});`);
    return;
  }

  const client = await createSupabaseClient();
  if (command === 'health') {
    const { data, error } = await client.rpc('sdd_health');
    if (error) throw error;
    print(data);
    return;
  }
  if (command === 'status') {
    const { data, error } = await client.rpc('sdd_status', { p_batch_id: args[0] || null });
    if (error) throw error;
    print(data);
    return;
  }
  if (command === 'events') {
    const [batchId, after = '0'] = args;
    if (!batchId) throw new Error('Informe o ID do lote.');
    const { data, error } = await client.rpc('sdd_events', { p_batch_id: batchId, p_after_event_id: Number(after) });
    if (error) throw error;
    print(data);
    return;
  }
  if (command === 'register') {
    const { values, flags } = parseFlags(args);
    if (!values[0]) throw new Error('Informe specs/<ID>.');
    print(await registerSpec(client, values[0], required(flags, 'by'), flags.key));
    return;
  }
  if (command === 'create-batch') {
    const { values, flags } = parseFlags(args);
    const [name, ...references] = values;
    if (!name || references.length === 0) throw new Error('Informe o nome e ao menos uma referência SPEC@VERSÃO.');
    const items = references.map((reference, index) => ({ ...parseSpecReference(reference), position: index + 1 }));
    const createdBy = required(flags, 'by');
    const { data, error } = await client.rpc('sdd_create_batch', {
      p_name: name,
      p_items: items,
      p_created_by: createdBy,
      p_idempotency_key: flags.key || stableIdempotencyKey('create-batch', { name, items, createdBy }),
    });
    if (error) throw error;
    print(data);
    return;
  }
  if (command === 'validate') {
    if (!args[0]) throw new Error('Informe o ID do lote.');
    const { data, error } = await client.rpc('sdd_validate_batch', { p_batch_id: args[0] });
    if (error) throw error;
    print(data);
    return;
  }
  if (command === 'claim' || command === 'heartbeat' || command === 'next') {
    const { values, flags } = parseFlags(args);
    const batchId = values[0];
    if (!batchId) throw new Error('Informe o ID do lote.');
    let rpc;
    let params;
    if (command === 'claim') {
      rpc = 'sdd_claim_batch';
      const ownerId = required(flags, 'owner');
      params = {
        p_batch_id: batchId,
        p_owner_id: ownerId,
        p_idempotency_key: flags.key || stableIdempotencyKey('claim-batch', { batchId, ownerId }),
      };
    } else {
      const owner = required(flags, 'owner');
      const lease = required(flags, 'lease');
      rpc = command === 'heartbeat' ? 'sdd_heartbeat' : 'sdd_start_next_spec';
      params = { p_batch_id: batchId, p_owner_id: owner, p_lease_token: lease };
    }
    const { data, error } = await client.rpc(rpc, params);
    if (error) throw error;
    print(data);
    return;
  }
  if (command === 'record') {
    const { values, flags } = parseFlags(args);
    const rpc = values[0];
    if (!RUNNER_RPCS.has(rpc) || ['sdd_health','sdd_status','sdd_events','sdd_register_spec_version','sdd_create_batch','sdd_validate_batch','sdd_claim_batch','sdd_heartbeat','sdd_start_next_spec','sdd_recover_interrupted'].includes(rpc)) {
      throw new Error('RPC indisponível para record; aprovações e retomadas administrativas não podem ser acionadas pelo runner.');
    }
    let params;
    try { params = JSON.parse(required(flags, 'json')); } catch (error) {
      throw new Error(`JSON inválido: ${error.message}`);
    }
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('--json precisa ser um objeto.');
    if (!params.p_lease_token || !params.p_owner_id) throw new Error('Esta operação exige p_lease_token e p_owner_id ativos.');
    const { data, error } = await client.rpc(rpc, params);
    if (error) throw error;
    print(data);
    return;
  }
  if (command === 'recover') {
    if (!args[0]) throw new Error('Informe o ID do lote.');
    const { data, error } = await client.rpc('sdd_recover_interrupted', {
      p_batch_id: args[0], p_recovered_by: process.env.SDD_ACTOR || 'sddctl',
    });
    if (error) throw error;
    print(data);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    const message = error.message || 'falha não especificada';
    process.stderr.write(`sddctl: ${redactSecretValues(message, [secretForRedaction])}\n`);
    process.exitCode = 1;
  });
}


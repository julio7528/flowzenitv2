import { pathToFileURL } from 'node:url';
import { assertServerOnlyRuntime } from '../server/agent/runtime/server-only.js';
import {
  CONVERSATION_MAINTENANCE_LIMITS,
  CONVERSATION_MAINTENANCE_PROJECT_REF,
  runConversationMaintenance,
  validateConversationMaintenanceTarget,
} from '../server/agent/memory/retention.js';

assertServerOnlyRuntime();

const USAGE = [
  'Conversation retention maintenance (manual, development only)',
  'Usage: node scripts/conversation-maintenance.js',
  '  --project-ref ' + CONVERSATION_MAINTENANCE_PROJECT_REF,
  '  --confirm-project ' + CONVERSATION_MAINTENANCE_PROJECT_REF,
  '  [--batch-size 1-' + CONVERSATION_MAINTENANCE_LIMITS.maxBatchSize + ']',
  'Requires server-only SUPABASE_URL and CONVERSATION_DATABASE_URL environment variables.',
  'No scheduler is configured by this command.',
].join('\n');

function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return Object.freeze({ help: true });
  const values = new Map();
  const allowed = new Set(['--project-ref', '--confirm-project', '--batch-size']);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!allowed.has(key) || typeof value !== 'string' || value.startsWith('--') || values.has(key)) {
      throw new Error('Invalid maintenance arguments.');
    }
    values.set(key, value);
    index += 1;
  }

  const batchSizeText = values.get('--batch-size');
  let batchSize;
  if (batchSizeText !== undefined) {
    if (!/^(?:[1-9][0-9]*)$/.test(batchSizeText)) throw new Error('Invalid maintenance arguments.');
    batchSize = Number(batchSizeText);
    if (!Number.isSafeInteger(batchSize)
      || batchSize > CONVERSATION_MAINTENANCE_LIMITS.maxBatchSize) {
      throw new Error('Invalid maintenance arguments.');
    }
  }

  return Object.freeze({
    projectRef: values.get('--project-ref'),
    confirmProjectRef: values.get('--confirm-project'),
    batchSize,
    help: false,
  });
}

async function createPostgresPool(databaseUrl) {
  const { Pool } = await import('pg');
  return new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    statement_timeout: 5000,
    ssl: { rejectUnauthorized: true },
  });
}

export async function runConversationMaintenanceCli({
  args = process.argv.slice(2),
  env = process.env,
  write = (value) => process.stdout.write(value + '\n'),
  createPool = createPostgresPool,
} = {}) {
  let options;
  try {
    options = parseArgs(args);
  } catch {
    write(USAGE);
    return 64;
  }
  if (options.help) {
    write(USAGE);
    return 0;
  }

  const supabaseUrl = env.SUPABASE_URL;
  const databaseUrl = env.CONVERSATION_DATABASE_URL;
  try {
    validateConversationMaintenanceTarget({
      projectRef: options.projectRef,
      confirmProjectRef: options.confirmProjectRef,
      supabaseUrl,
      databaseUrl,
    });
    const result = await runConversationMaintenance({
      createPool,
      projectRef: options.projectRef,
      confirmProjectRef: options.confirmProjectRef,
      supabaseUrl,
      databaseUrl,
      batchSize: options.batchSize,
    });
    write(JSON.stringify(result));
    if (result.failed > 0) return 1;
    if (result.skippedUnresolvedTurn > 0
      || result.remainingExpired > 0
      || result.remainingExpiredCheckpointEnvelopes > 0
      || result.remainingUnboundCheckpoints > 0
      || result.remainingOrphanCheckpointWrites > 0) return 2;
    return 0;
  } catch {
    write('Conversation maintenance stopped safely; no content or connection details were recorded.');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runConversationMaintenanceCli().then((code) => {
    process.exitCode = code;
  }).catch(() => {
    process.stderr.write('Conversation maintenance stopped safely.\n');
    process.exitCode = 1;
  });
}

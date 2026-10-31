import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as viteBuild } from 'vite';
import viteConfig from '../../../vite.config.js';
import { memoryAccessGate } from '../../../server/agent/memory/access-gate.js';
import { createConversationMemoryConfig } from '../../../server/agent/memory/config.js';
import {
  createGuardedConversationRepository,
  createPostgresConversationRepository,
} from '../../../server/agent/memory/conversation-repository.js';
import { writeSafeMemoryEvent } from '../../../server/agent/memory/safe-logging.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SENTINEL = 'SPEC003-SYNTHETIC-BOUNDARY-ONLY';
const DISABLED = {
  error: {
    code: 'ACCESS_DISABLED',
    message: 'Conversation memory unavailable',
  },
};

test('DEC-001 blocks PostgreSQL, checkpoint, ledger, handler, and provider effects before invocation', async () => {
  const calls = { storage: 0, checkpoint: 0, ledger: 0, handler: 0, provider: 0 };
  const pool = {
    async query() {
      calls.storage += 1;
      throw new Error('synthetic storage stub must not run');
    },
    async connect() {
      calls.storage += 1;
      throw new Error('synthetic storage stub must not run');
    },
  };
  const config = createConversationMemoryConfig({
    pool,
    cursorHmacKey: new Uint8Array(32).fill(7),
  });
  const repository = createPostgresConversationRepository({ config });
  const guardedRepository = createGuardedConversationRepository({ repository });

  assert.equal(config.privateAccessAllowed, false);
  assert.equal(config.storageConfigured, true);
  assert.equal(memoryAccessGate.isOpen(), false);

  for (const [method, request] of [
    ['getConversationMetadata', { conversationId: '123e4567-e89b-42d3-a456-426614174000' }],
    ['getHistory', { conversationId: '123e4567-e89b-42d3-a456-426614174000' }],
    ['reserveTurn', {
      conversationId: '123e4567-e89b-42d3-a456-426614174000',
      turnId: '123e4567-e89b-42d3-a456-426614174001',
      correlationId: '123e4567-e89b-42d3-a456-426614174002',
      idempotencyKey: 'synthetic-request-001',
      payloadHash: 'a'.repeat(64),
    }],
    ['appendTurn', {
      conversationId: '123e4567-e89b-42d3-a456-426614174000',
      turnId: '123e4567-e89b-42d3-a456-426614174001',
      messages: [{ role: 'user', content: SENTINEL }],
    }],
  ]) {
    assert.deepEqual(await guardedRepository[method](request), DISABLED);
  }

  const result = await memoryAccessGate.run(() => {
    calls.checkpoint += 1;
    calls.ledger += 1;
    calls.handler += 1;
    calls.provider += 1;
    return { content: SENTINEL };
  });

  assert.deepEqual(result, DISABLED);
  assert.deepEqual(calls, {
    storage: 0,
    checkpoint: 0,
    ledger: 0,
    handler: 0,
    provider: 0,
  });
});

test('safe memory logging emits only bounded operational metadata', () => {
  const events = [];
  const correlationId = '123e4567-e89b-42d3-a456-426614174000';
  const logged = writeSafeMemoryEvent({ info: (event) => events.push(event) }, {
    eventType: 'message_append',
    outcome: 'success',
    correlationId,
    messageCount: 1,
    transcript: SENTINEL,
    prompt: SENTINEL,
    checkpoint: SENTINEL,
    providerInput: SENTINEL,
    error: new Error(SENTINEL),
  });

  assert.equal(logged, true);
  assert.deepEqual(events, [{ eventType: 'message_append', outcome: 'success', correlationId, messageCount: 1 }]);
  assert.equal(JSON.stringify(events).includes(SENTINEL), false);
});

test('server-only memory modules fail closed when imported in a browser-like runtime', () => {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'server/agent/memory/access-gate.js')).href;
  const script = `
    globalThis.window = {};
    try {
      await import(${JSON.stringify(moduleUrl)});
      process.exitCode = 2;
    } catch (error) {
      process.exitCode = error?.message === 'The agent runtime is server-only.' ? 0 : 3;
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, 'browser-like import must be rejected by the server-only guard');
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('Vite client output excludes server-only conversation memory modules and private env prefixes', async () => {
  assert.equal(viteConfig.envPrefix, 'VITE_');
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'flowzenit2-spec003-client-'));
  const includedModuleIds = [];

  try {
    await viteBuild({
      configFile: path.join(ROOT, 'vite.config.js'),
      root: ROOT,
      logLevel: 'silent',
      build: {
        outDir: outputDirectory,
        emptyOutDir: true,
        manifest: true,
        sourcemap: false,
        rollupOptions: {
          plugins: [{
            name: 'spec003-server-boundary-audit',
            generateBundle(_options, bundle) {
              for (const item of Object.values(bundle)) {
                if (item.type === 'chunk') includedModuleIds.push(...Object.keys(item.modules));
              }
            },
          }],
        },
      },
    });

    const normalizedModuleIds = includedModuleIds.map((id) => id.replaceAll('\\', '/'));
    assert.equal(normalizedModuleIds.length > 0, true, 'client bundle should contain modules');
    assert.equal(normalizedModuleIds.some((id) => id.includes('/server/agent/memory/')), false);
    assert.equal(normalizedModuleIds.some((id) => id.includes('/server/agent/')), false);

    const manifest = JSON.parse(await readFile(path.join(outputDirectory, '.vite', 'manifest.json'), 'utf8'));
    const manifestText = JSON.stringify(manifest).replaceAll('\\', '/');
    assert.doesNotMatch(manifestText, /server\/agent\/memory/);

    const javascript = [];
    async function visit(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(entryPath);
        else if (entry.isFile() && entry.name.endsWith('.js')) {
          javascript.push(await readFile(entryPath, 'utf8'));
        }
      }
    }
    await visit(outputDirectory);
    const bundleText = javascript.join('\n');
    assert.equal(bundleText.includes('createPostgresConversationRepository'), false);
    assert.equal(bundleText.includes('ConversationMemoryConfigurationError'), false);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

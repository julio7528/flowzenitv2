import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as viteBuild } from 'vite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const serverOnlyMutationPaths = Object.freeze([
  '/server/domain/write/',
  '/server/agent/tools/write-capabilities.js',
]);

test('React/Vite client graph excludes server-only mutation modules', async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'flowzenit-spec006-client-'));
  const includedModuleIds = [];

  try {
    await viteBuild({
      configFile: path.join(projectRoot, 'vite.config.js'),
      root: projectRoot,
      logLevel: 'silent',
      build: {
        outDir: outputDirectory,
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
          plugins: [{
            name: 'spec006-server-mutation-boundary',
            generateBundle(_options, bundle) {
              for (const item of Object.values(bundle)) {
                if (item.type === 'chunk') includedModuleIds.push(...Object.keys(item.modules));
              }
            },
          }],
        },
      },
    });

    const normalizedModuleIds = includedModuleIds.map((moduleId) => moduleId.replaceAll('\\', '/'));
    assert.ok(normalizedModuleIds.length > 0, 'the Vite build should contain client modules');

    for (const forbiddenPath of serverOnlyMutationPaths) {
      assert.equal(
        normalizedModuleIds.some((moduleId) => moduleId.includes(forbiddenPath)),
        false,
        `client module graph must not include ${forbiddenPath}`,
      );
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

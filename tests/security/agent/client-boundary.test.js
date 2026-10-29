import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const viteCliPath = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');

const forbiddenBundleMarkers = Object.freeze([
  'server/agent/',
  'api/agent/',
  '@langchain/deepseek',
  'DEEPSEEK_API_KEY',
  'HIERARCHY_CURSOR_SECRET',
]);

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function sanitizedBuildFailure(status) {
  return `Isolated Vite client build failed with exit code ${String(status)}.`;
}

test('Vite client assets and source maps exclude server agent modules and credential names', async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'flowzenit-agent-client-'));

  try {
    const build = spawnSync(process.execPath, [
      viteCliPath,
      'build',
      '--outDir', outputDirectory,
      '--emptyOutDir',
      '--sourcemap',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 90_000,
      windowsHide: true,
    });

    assert.equal(build.error, undefined, 'Vite process must start successfully.');
    assert.equal(build.status, 0, sanitizedBuildFailure(build.status));

    const files = await collectFiles(outputDirectory);
    assert.ok(files.some((filePath) => filePath.endsWith('.js')), 'client JavaScript assets must be emitted.');
    assert.ok(files.some((filePath) => filePath.endsWith('.js.map')), 'source maps must be emitted for the scan.');

    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');
      for (const marker of forbiddenBundleMarkers) {
        let sourceOwner = 'generated output';
        if (filePath.endsWith('.map')) {
          try {
            const map = JSON.parse(source);
            const sourceContents = Array.isArray(map.sourcesContent) ? map.sourcesContent : [];
            const sourceIndex = sourceContents.findIndex((content) => (
              typeof content === 'string' && content.includes(marker)
            ));
            if (sourceIndex >= 0) sourceOwner = `source map input ${String(map.sources?.[sourceIndex] ?? sourceIndex)}`;
          } catch {
            sourceOwner = 'generated source map';
          }
        }
        assert.equal(
          source.includes(marker),
          false,
          `client artifact ${path.basename(filePath)} must not contain forbidden marker ${marker}; found in ${sourceOwner}`,
        );
      }
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scannerPath = fileURLToPath(new URL('../../scripts/security/scan-client-assets.js', import.meta.url))

async function withTemporaryAssets(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flowzenit-assets-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function scan(directory, sentinel) {
  const env = { ...process.env }
  if (sentinel === undefined) delete env.SPEC001_SCAN_SENTINEL
  else env.SPEC001_SCAN_SENTINEL = sentinel

  return spawnSync(process.execPath, [scannerPath, directory], {
    encoding: 'utf8',
    env,
  })
}

test('scanner detects the synthetic sentinel in recursively scanned source maps without printing it', async () => {
  const sentinel = 'SPEC001_SYNTHETIC_ASSET_SENTINEL_7a93f0'

  await withTemporaryAssets(async (directory) => {
    const nestedAssets = path.join(directory, 'assets', 'maps')
    await mkdir(nestedAssets, { recursive: true })
    await writeFile(path.join(directory, 'index.html'), '<main>synthetic fixture</main>')
    await writeFile(path.join(nestedAssets, 'chunk.js.map'), JSON.stringify({ sourcesContent: [`source ${sentinel}`] }))

    const result = scan(directory, sentinel)
    assert.notEqual(result.status, 0, 'a sentinel match must fail the scan')
    assert.equal(result.error, undefined)
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false, 'scanner output must redact the sentinel')
  })
})

test('scanner passes clean nested assets and reports a concise scan summary', async () => {
  const sentinel = 'SPEC001_SYNTHETIC_ASSET_SENTINEL_412e6b'

  await withTemporaryAssets(async (directory) => {
    const nestedAssets = path.join(directory, 'assets', 'nested')
    await mkdir(nestedAssets, { recursive: true })
    await writeFile(path.join(directory, 'index.html'), '<main>synthetic fixture</main>')
    await writeFile(path.join(nestedAssets, 'chunk.js'), 'console.log("synthetic only")')
    await writeFile(path.join(nestedAssets, 'chunk.js.map'), JSON.stringify({ sources: ['chunk.js'] }))

    const result = scan(directory, sentinel)
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /scanned/i)
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false)
  })
})

test('scanner fails closed when the synthetic sentinel is not configured', async () => {
  await withTemporaryAssets(async (directory) => {
    await writeFile(path.join(directory, 'index.html'), '<main>synthetic fixture</main>')

    const result = scan(directory, undefined)
    assert.notEqual(result.status, 0)
    assert.equal(result.error, undefined)
    assert.match(`${result.stdout}${result.stderr}`, /SPEC001_SCAN_SENTINEL/)
  })
})

test('scanner fails closed for a missing or empty asset directory', async () => {
  const sentinel = 'SPEC001_SYNTHETIC_ASSET_SENTINEL_2d0611'

  await withTemporaryAssets(async (directory) => {
    const missing = path.join(directory, 'missing')
    const missingResult = scan(missing, sentinel)
    assert.notEqual(missingResult.status, 0)
    assert.equal(missingResult.error, undefined)

    const emptyResult = scan(directory, sentinel)
    assert.notEqual(emptyResult.status, 0, 'an empty directory must not produce a false clean pass')
    assert.equal(emptyResult.error, undefined)
    assert.equal(`${missingResult.stdout}${missingResult.stderr}${emptyResult.stdout}${emptyResult.stderr}`.includes(sentinel), false)
  })
})

#!/usr/bin/env node
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

async function collectFiles(root) {
  const files = []

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))

    for (const entry of entries) {
      const filePath = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('symbolic links are not scanned')
      if (entry.isDirectory()) await visit(filePath)
      else if (entry.isFile()) files.push(filePath)
    }
  }

  await visit(root)
  return files
}

async function main() {
  const sentinel = process.env.SPEC001_SCAN_SENTINEL
  if (!sentinel) {
    fail('Missing synthetic sentinel configuration: SPEC001_SCAN_SENTINEL is required.')
    return
  }

  const requestedDirectory = process.argv[2]
  if (!requestedDirectory || process.argv.length > 3) {
    fail('Usage: node scripts/security/scan-client-assets.js <assets-directory>')
    return
  }

  const root = path.resolve(process.cwd(), requestedDirectory)
  let rootInfo
  try {
    rootInfo = await lstat(root)
  } catch {
    fail('Client asset scan failed: the supplied directory is unavailable.')
    return
  }

  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    fail('Client asset scan failed: the supplied path is not a regular directory.')
    return
  }

  let files
  try {
    files = await collectFiles(root)
  } catch {
    fail('Client asset scan failed: an asset could not be enumerated safely.')
    return
  }

  if (files.length === 0) {
    fail('Client asset scan failed: the supplied directory contains no regular files.')
    return
  }

  const sentinelBytes = Buffer.from(sentinel, 'utf8')
  let scannedCount = 0
  let matchedFileCount = 0

  for (const filePath of files) {
    let contents
    try {
      contents = await readFile(filePath)
    } catch {
      fail('Client asset scan failed: an asset could not be read safely.')
      return
    }

    scannedCount += 1
    if (contents.includes(sentinelBytes)) matchedFileCount += 1
  }

  if (matchedFileCount > 0) {
    fail(`Client asset scan failed: the synthetic sentinel was found in ${matchedFileCount} file(s).`)
    return
  }

  process.stdout.write(`Client asset scan passed: ${scannedCount} file(s) scanned; no sentinel match.\n`)
}

main().catch(() => {
  fail('Client asset scan failed unexpectedly; no asset contents were emitted.')
})

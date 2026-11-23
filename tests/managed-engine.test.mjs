import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { crc32 } from 'node:zlib'
import { loginCommand, resolveEngine } from '../engine.mjs'
import { managedEngine } from '../managed-engine.mjs'
import { downloadArchive, extractArchive, officialRelease, releasePlatform } from '../release.mjs'

function zip(items) {
  const entries = [], directory = []
  let offset = 0, directoryLength = 0
  for (const [path, contents, mode = 0o100755] of items) {
    const name = Buffer.from(path), bytes = Buffer.from(contents)
    const file = Buffer.alloc(30), record = Buffer.alloc(46)
    file.writeUInt32LE(0x04034b50)
    file.writeUInt16LE(20, 4)
    for (const [start, header] of [[14, file], [16, record]]) {
      header.writeUInt32LE(crc32(bytes), start)
      header.writeUInt32LE(bytes.length, start + 4)
      header.writeUInt32LE(bytes.length, start + 8)
      header.writeUInt16LE(name.length, start + 12)
    }
    record.writeUInt32LE(0x02014b50)
    record.writeUInt16LE(0x314, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt32LE((mode << 16) >>> 0, 38)
    record.writeUInt32LE(offset, 42)
    entries.push(file, name, bytes)
    directory.push(record, name)
    offset += file.length + name.length + bytes.length
    directoryLength += record.length + name.length
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(items.length, 8)
  end.writeUInt16LE(items.length, 10)
  end.writeUInt32LE(directoryLength, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...entries, ...directory, end])
}

const run = { signal: new AbortController().signal, progress() {} }
async function scratch(t) {
  const path = await mkdtemp(join(tmpdir(), 'junie-engine-test-'))
  t.after(() => rm(path, { recursive: true, force: true, maxRetries: 3 }))
  return path
}

function fixtureService(platform, state) {
  return async function request(url) {
    const name = 'junie-release-' + state.version + '-' + platform.family + '-' + platform.architecture + '.zip'
    const source = 'https://github.com/JetBrains/junie-acp-release/releases/download/' + state.version + '/' + name
    const archive = zip([[platform.entry, state.version]])
    if (String(url).startsWith('https://api.github.com/')) {
      return Response.json({ draft: false, prerelease: false, tag_name: state.version, assets: [{
        name, state: 'uploaded', browser_download_url: source, size: archive.length,
        digest: 'sha256:' + createHash('sha256').update(archive).digest('hex'),
      }] })
    }
    assert.equal(String(url), source)
    if (state.fail) archive[0] ^= 0xff
    return new Response(archive)
  }
}

test('maps the six official layouts and normalizes the Windows vendor ZIP separators', async t => {
  assert.deepEqual(releasePlatform('darwin', 'arm64'), { family: 'macos', architecture: 'aarch64', entry: 'Applications/junie.app/Contents/MacOS/junie' })
  assert.deepEqual(releasePlatform('linux', 'x64'), { family: 'linux', architecture: 'amd64', entry: 'junie-app/bin/junie' })
  assert.deepEqual(releasePlatform('win32', 'arm64'), { family: 'windows', architecture: 'aarch64', entry: 'junie/junie.exe' })
  assert.equal(releasePlatform('linux', 'riscv64'), undefined)
  const root = await scratch(t)
  const archive = join(root, 'sample.zip')
  await writeFile(archive, zip([['junie\\junie.exe', 'fixture', 0]]))
  await extractArchive(archive, root, run.signal)
  assert.equal(await readFile(join(root, 'junie', 'junie.exe'), 'utf8'), 'fixture')
  for (const member of [['../outside', 'payload'], ['unsafe', '../outside', 0o120777], ['ambiguous:stream', 'payload']]) {
    await writeFile(archive, zip([member]))
    await assert.rejects(extractArchive(archive, root, run.signal), /unsafe|invalid relative path/i)
  }
})

test('requires official matching stable artifacts and constrains the download redirect', async t => {
  const platform = releasePlatform('linux', 'x64')
  const request = fixtureService(platform, { version: '4100.11' })
  const release = await officialRelease(platform, run.signal, request)
  assert.equal(release.version, '4100.11')
  const root = await scratch(t)
  await assert.rejects(downloadArchive(release, join(root, 'artifact.zip'), run.signal,
    async () => Response.redirect('https://outside.invalid/archive')), /outside GitHub/)
  await assert.rejects(officialRelease(platform, run.signal, async url => {
    const good = await (await request(url)).json()
    good.assets[0].digest = null
    return Response.json(good)
  }), /no verifiable/)
})

test('serializes installation, rejects failed upgrades, switches versions and removes only managed files', async t => {
  const root = await scratch(t)
  const nativeHome = join(root, 'native-login')
  await mkdir(nativeHome)
  await writeFile(join(nativeHome, 'preferences'), 'retained')
  let external
  const state = { version: '4100.10' }
  const platform = releasePlatform(process.platform === 'win32' ? 'win32' : 'linux', 'x64')
  const verify = async ({ file }) => '26.11.2 (' + await readFile(file, 'utf8') + ')'
  const manager = managedEngine(root, { platform, override: () => false, external: async () => external,
    request: fixtureService(platform, state), verify })
  assert.deepEqual(await manager.status(run.signal), { installed: false, version: '', source: 'managed' })
  assert.equal(await manager.supportsAutoUpdate(run.signal), false)
  const first = { version: '4100.10', expectedVersion: '' }
  const attempts = await Promise.allSettled([manager.upgrade(first, run), manager.upgrade(first, run)])
  assert.deepEqual(attempts.map(result => result.status), ['fulfilled', 'rejected'])
  assert.match(attempts[1].reason.message, /version changed/)
  const old = (await manager.resolve()).engine.file
  assert.match(old, /release-/)
  state.version = '4100.11'
  assert.deepEqual(await manager.checkUpdate(run), { currentVersion: '4100.10', latestVersion: '4100.11', updateAvailable: true })
  const second = { version: '4100.11', expectedVersion: '4100.10' }
  state.fail = true
  await assert.rejects(manager.upgrade(second, run), /size and SHA-256/)
  assert.equal((await manager.resolve()).engine.file, old)
  assert.equal((await readdir(join(root, 'engine'))).filter(name => name.startsWith('release-')).length, 1)
  state.fail = false
  assert.deepEqual(await manager.upgrade(second, run), { installedVersion: '4100.11' })
  assert.equal(await manager.supportsAutoUpdate(run.signal), true)
  state.version = '4100.10'
  assert.equal((await manager.checkUpdate(run)).updateAvailable, false)
  await assert.rejects(access(old), { code: 'ENOENT' })
  const externalFile = join(root, 'other-junie')
  await writeFile(externalFile, 'other executable')
  external = { file: externalFile }
  await manager.remove(run)
  assert.equal((await manager.status(run.signal)).installed, false)
  assert.deepEqual(await readdir(join(root, 'engine')), ['current.json'])
  assert.equal(await readFile(externalFile, 'utf8'), 'other executable')
  assert.equal(await readFile(join(nativeHome, 'preferences'), 'utf8'), 'retained')
})

test('external CLI or an explicit missing override cannot be updated or deleted by Studio', async t => {
  const root = await scratch(t)
  const source = join(root, 'external-cli')
  await writeFile(source, 'existing')
  let available = { file: source }
  const external = managedEngine(root, { external: async () => available, override: () => true,
    verify: async () => '26.11.2 (4100.11)', request: () => assert.fail('external engine must not access release downloads') })
  assert.equal((await external.status(run.signal)).source, 'external')
  assert.equal((await external.checkUpdate(run)).updateAvailable, false)
  assert.equal(await external.supportsAutoUpdate(run.signal), false)
  await assert.rejects(external.upgrade({ version: '4100.12', expectedVersion: '26.11.2 (4100.11)' }, run), /managed outside/)
  await assert.rejects(external.remove(run), /managed outside/)
  available = undefined
  assert.equal((await external.status(run.signal)).installed, false)
  assert.equal((await external.checkUpdate(run)).updateAvailable, false)
  assert.equal(await readFile(source, 'utf8'), 'existing')
  assert.deepEqual(await readdir(root), ['external-cli'])
})

test('on POSIX a marked official shim resolves the native binary without executing the updater', {
  skip: process.platform === 'win32',
}, async t => {
  const root = await scratch(t)
  const shim = join(root, 'junie')
  const selected = join(root, 'current', 'junie', 'bin', 'junie')
  await mkdir(join(root, 'current','junie','bin'), { recursive: true })
  await writeFile(selected, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  await writeFile(shim, '#!/bin/sh\n# JUNIE_MANAGED_SHIM\nexit 99\n', { mode: 0o755 })
  const environment = { EKKO_JUNIE_EXECUTABLE: shim, JUNIE_DATA: root }
  assert.deepEqual(await resolveEngine(environment), { file: selected })
  assert.equal(loginCommand("/tmp/junie's bin"), "'/tmp/junie'\\''s bin'")
  await rm(selected)
  assert.equal(await resolveEngine(environment), undefined)
})

test('falls back to GitHub public assets under API rate limits and requires the exact asset digest', async () => {
  const path = '/JetBrains/junie-acp-release/releases/download/4100.11/junie-release-4100.11-linux-amd64.zip'
  const digest = 'a'.repeat(64)
  let correct = true
  const request = async url => {
    if (url.startsWith('https://api.github.com/')) return new Response(null, { status:403 })
    if (url.endsWith('/releases/latest')) return Response.redirect('https://github.com/JetBrains/junie-acp-release/releases/tag/4100.11')
    return new Response('<li><a href="' + path + '">archive</a>' + (correct ? '<clipboard-copy value="sha256:' + digest + '"/>' : '') + '</li>'
      + '<li><clipboard-copy value="sha256:' + 'b'.repeat(64) + '"/></li>')
  }
  const platform = releasePlatform('linux','x64')
  assert.deepEqual(await officialRelease(platform,run.signal,request), { version:'4100.11',url:'https://github.com'+path,digest })
  correct = false
  await assert.rejects(officialRelease(platform,run.signal,request), /Could not verify/)
})

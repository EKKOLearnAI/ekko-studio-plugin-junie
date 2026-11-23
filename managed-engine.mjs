import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { engineEnvironment, engineVersion, executable, initializeAcp, openAcp, resolveEngine } from './engine.mjs'
import { downloadArchive, extractArchive, officialRelease, releasePlatform, stableVersion } from './release.mjs'

import { validateModel } from './sdk/harness/contracts.mjs'
import contract from './contracts/plugin.json' with { type: 'json' }

const removed = { directory: '', version: '' }
const externalMessage = 'This Junie CLI installation is managed outside Studio.'
const releaseName = /^release-[a-zA-Z0-9]+$/
const operations = new Map()
const removeTree = path => rm(path, { recursive: true, force: true, maxRetries: 3 })
const missing = { installed: false, version: '' }

async function inspect(file) {
  try { return await lstat(file) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}

async function probe(engine, signal, acpCheck, external) {
  const directory = await mkdtemp(join(tmpdir(), 'junie-engine-probe-'))
  const env = { ...engineEnvironment({ native: false }), JUNIE_HOME: directory }
  if (!external) env.JUNIE_DATA = directory
  else if (process.env.JUNIE_DATA) env.JUNIE_DATA = process.env.JUNIE_DATA
  try {
    const version = await engineVersion(engine, signal, env)
    if (!version || !acpCheck) return version
    const acp = openAcp(engine, directory, ({ id }) => { if (id !== undefined) acp.methodNotFound(id) }, { env })
    try { await initializeAcp(acp, AbortSignal.any([signal, AbortSignal.timeout(15_000)])) }
    finally { await acp.close() }
    return version
  } finally {
    await removeTree(directory)
  }
}

function newer(latest, current) {
  if (!current) return true
  const [line, build] = latest.split('.').map(Number)
  const [oldLine, oldBuild] = current.split('.').map(Number)
  return line > oldLine || (line === oldLine && build > oldBuild)
}

export function managedEngine(dataDir, {
  platform = releasePlatform(),
  external = resolveEngine,
  override = () => Boolean(process.env.EKKO_JUNIE_EXECUTABLE?.trim()),
  request = fetch,
  verify = probe,
} = {}) {
  const root = join(dataDir, 'engine')

  async function selected() {
    const directory = await inspect(root)
    if (!directory) return
    if (!directory.isDirectory()) throw new Error('The Junie managed engine directory is invalid.')
    const pointer = join(root, 'current.json')
    const file = await inspect(pointer)
    if (!file) return
    if (!file.isFile() || file.size > 4096) throw new Error('The Junie engine selection is invalid.')
    const state = validateModel(contract, 'engineSelection', JSON.parse(await readFile(pointer, 'utf8')))
    if (!state.directory && !state.version) return null
    if (!releaseName.test(state?.directory) || !stableVersion.test(state?.version)) {
      throw new Error('The Junie engine selection is invalid.')
    }
    return state
  }

  async function select(state) {
    const temp = join(root, '.current-' + randomUUID())
    try {
      await writeFile(temp, JSON.stringify(validateModel(contract, 'engineSelection', state)) + '\n', { mode: 0o600, flag: 'wx' })
      await rename(temp, join(root, 'current.json'))
    } finally {
      await rm(temp, { force: true })
    }
  }

  async function binary(directory) {
    if (!(await inspect(directory))?.isDirectory()) return
    const file = join(await realpath(directory), platform.entry)
    if (await executable(file) && await realpath(file) === file) return { file }
  }

  async function resolve() {
    if (override()) return { engine: await external(), source: 'external' }
    const state = await selected()
    if (state === null) return { source: platform ? 'managed' : 'not-installed' }
    if (state) {
      return { source: 'managed', state, engine: platform ? await binary(join(root, state.directory)) : undefined }
    }
    const engine = await external()
    return engine ? { engine, source: 'external' } : { source: platform ? 'managed' : 'not-installed' }
  }

  async function status(signal) {
    try {
      signal.throwIfAborted()
      const { engine, source, state } = await resolve()
      if (!engine) return { ...missing, source, ...(state || source === 'external'
        ? { error: 'Could not locate the selected Junie CLI.' } : {}) }
      const version = await verify(engine, signal, false, source === 'external')
      if (version && (!state || version.endsWith(' (' + state.version + ')'))) {
        return { installed: true, version: state?.version ?? version, source }
      }
      return { ...missing, source, error: 'Could not confirm the Junie CLI version.' }
    } catch {
      signal.throwIfAborted()
      return { ...missing, source: 'error', error: 'Could not read or start the Junie CLI.' }
    }
  }

  async function checkUpdate(run) {
    const current = await status(run.signal)
    if (current.source === 'error') throw new Error(current.error)
    if (current.source === 'external' || !platform) return {
      currentVersion: current.version, latestVersion: current.version, updateAvailable: false,
      message: current.source === 'external' ? externalMessage : 'JetBrains does not publish a managed Junie CLI for this platform.',
    }
    const release = await officialRelease(platform, run.signal, request)
    return { currentVersion: current.version, latestVersion: release.version, updateAvailable: newer(release.version, current.version) }
  }

  function serialize(work) {
    const prior = operations.get(root) ?? Promise.resolve()
    const next = prior.catch(() => {}).then(work)
    operations.set(root, next)
    return next.finally(() => { if (operations.get(root) === next) operations.delete(root) })
  }

  function upgrade(input, run) {
    return serialize(async () => {
      if (!platform) throw new Error('Studio cannot install Junie CLI on this platform.')
      const current = await status(run.signal)
      if (current.source === 'external') throw new Error(externalMessage)
      if (current.source === 'error') throw new Error(current.error)
      if (current.version !== input.expectedVersion) throw new Error('Junie CLI version changed. Check updates again.')
      const release = await officialRelease(platform, run.signal, request)
      if (release.version !== input.version || !newer(release.version, current.version)) {
        throw new Error('Choose the current stable Junie CLI release for this platform.')
      }
      const previous = await selected()
      await mkdir(root, { recursive: true, mode: 0o700 })
      const stage = await mkdtemp(join(root, 'release-'))
      const path = join(stage, '.download.zip')
      let committed = false
      try {
        run.progress({ message: 'Downloading the official Junie CLI', percent: 15 })
        await downloadArchive(release, path, run.signal, request)
        await extractArchive(path, stage, run.signal)
        await rm(path)
        run.progress({ message: 'Verifying the Junie version and ACP handshake', percent: 85 })
        const engine = await binary(stage)
        const version = engine && await verify(engine, run.signal, true)
        if (!version?.endsWith(' (' + release.version + ')')) {
          throw new Error('The Junie executable did not report the requested JetBrains build.')
        }
        run.signal.throwIfAborted()
        await select({ directory: stage.slice(root.length + 1), version: release.version })
        committed = true
        if (previous) await removeTree(join(root, previous.directory)).catch(() => {})
        return { installedVersion: release.version }
      } finally {
        if (!committed) await removeTree(stage)
      }
    })
  }

  function remove(run) {
    return serialize(async () => {
      const { source, state } = await resolve()
      if (source === 'external') throw new Error(externalMessage)
      if (!state) return
      run.signal.throwIfAborted()
      await select(removed)
      await removeTree(join(root, state.directory))
    })
  }

  async function supportsAutoUpdate(signal) {
    signal.throwIfAborted()
    const selection = await resolve()
    return selection.source === 'managed' && Boolean(selection.state && selection.engine)
  }

  return { resolve, status, checkUpdate, upgrade, remove, supportsAutoUpdate }
}

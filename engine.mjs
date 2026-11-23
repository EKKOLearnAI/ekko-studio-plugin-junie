import { execFile } from 'node:child_process'
import { access, open, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { Acp } from './acp.mjs'
import manifest from './plugin.json' with { type: 'json' }

const execute = promisify(execFile)
const windows = process.platform === 'win32'
const launcher = windows ? 'junie.exe' : 'junie'

export function engineEnvironment({ native = true, source = process.env } = {}) {
  const common = new Set([
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'USERPROFILE', 'SYSTEMROOT', 'SYSTEMDRIVE',
    'COMSPEC', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'TEMP', 'TMP', 'TMPDIR',
    'LANG', 'LC_ALL', 'LC_CTYPE', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
    'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY',
    'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
  ])
  const junie = new Set([
    'JUNIE_HOME', 'JUNIE_DATA', 'JUNIE_API_KEY', 'JUNIE_OPENAI_API_KEY', 'JUNIE_ANTHROPIC_API_KEY',
    'JUNIE_GOOGLE_API_KEY', 'JUNIE_GROK_API_KEY', 'JUNIE_META_API_KEY', 'JUNIE_OPENROUTER_API_KEY',
    'JUNIE_LITELLM_URL', 'JUNIE_LITELLM_API_KEY', 'JUNIE_MODEL', 'JUNIE_LLM_PROVIDER',
    'JUNIE_EFFORT', 'JUNIE_MODEL_LOCATIONS', 'JUNIE_MODEL_DEFAULT_LOCATIONS',
    'JUNIE_CONFIG_LOCATION', 'JUNIE_CONFIG_DEFAULT_LOCATIONS',
  ])
  return Object.fromEntries(Object.entries(source).filter(([key]) =>
    common.has(key.toUpperCase()) || (native && junie.has(key))))
}

export async function executable(file) {
  if (!isAbsolute(file) || (windows && !/\.exe$/i.test(file))) return false
  try {
    await access(file, constants.X_OK)
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

async function nativeLaunch(file, environment) {
  if (!await executable(file)) return
  if (windows) return { file }
  const handle = await open(file, 'r')
  let marker
  try {
    const prefix = Buffer.alloc(1024)
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0)
    marker = prefix.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
  if (!marker.startsWith('#!') || !marker.includes('JUNIE_MANAGED_SHIM')) return { file }

  // The installer shim applies pending Junie updates before handling CLI flags.
  const data = environment.JUNIE_DATA || join(homedir(), '.local', 'share', 'junie')
  const entries = ['Applications/junie.app/Contents/MacOS/junie', 'junie/bin/junie', 'junie']
  for (const entry of entries) {
    const current = join(data, 'current', entry)
    if (await executable(current)) return { file: current }
  }
}

export async function resolveEngine(environment = process.env) {
  const override = environment.EKKO_JUNIE_EXECUTABLE?.trim()
  if (override) return nativeLaunch(override, environment)
  const path = engineEnvironment({ source: environment })
  const search = Object.entries(path).find(([name]) => name.toUpperCase() === 'PATH')?.[1] ?? ''
  const candidates = search.split(delimiter).filter(isAbsolute).map(directory => join(directory, launcher))
  candidates.push(join(homedir(), '.local', 'bin', launcher))
  if (windows) {
    // The official Windows installer creates a .bat shim and a versioned native .exe.
    // Resolve the installer marker so ACP can launch the executable without a command shell.
    const data = join(homedir(), '.local', 'share', 'junie')
    const version = (await readFile(join(data, 'current'), 'utf8').catch(() => '')).trim()
    if (/^[0-9]+(?:\.[0-9]+){1,4}$/.test(version)) {
      candidates.push(join(data, 'versions', version, 'junie', launcher))
    }
  }
  for (const file of new Set(candidates)) {
    const engine = await nativeLaunch(file, environment)
    if (engine) return engine
  }
}

export function loginCommand(file) {
  if (!file) return ''
  return windows ? "& '" + file.replaceAll("'", "''") + "'" : "'" + file.replaceAll("'", "'\\''") + "'"
}

export async function engineVersion(engine, signal, env = engineEnvironment()) {
  signal.throwIfAborted()
  const { stdout } = await execute(engine.file, [...(engine.args ?? []), '--skip-update-check', '--version'], {
    env, signal, timeout: 8000, maxBuffer: 32768, windowsHide: true,
  })
  return stdout.match(/^Junie version:\s*([0-9][\w.+-]*(?: \([0-9][\w.+-]*\))?)\s*$/m)?.[1]
}

export function openAcp(engine, cwd, handle, setup = {}) {
  const args = [...(engine.args ?? []), '--acp=true', '--acp-logging=false', '--skip-update-check', ...(setup.args ?? [])]
  return new Acp(engine.file, args, { cwd, env: setup.env ?? engineEnvironment() }, handle)
}

export async function initializeAcp(acp, signal) {
  const hello = await acp.request('initialize', {
    protocolVersion: 1,
    clientInfo: { name: 'ekko-studio-junie', version: manifest.version },
    clientCapabilities: {},
  }, signal)
  if (hello?.protocolVersion !== 1 || hello.agentInfo?.name !== '@jetbrains/junie') {
    throw new Error('The executable must provide JetBrains Junie ACP v1.')
  }
  return hello.agentCapabilities ?? {}
}

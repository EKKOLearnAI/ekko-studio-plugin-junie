import { execFile } from 'node:child_process'
import { access, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const windows = process.platform === 'win32'
const launcher = windows ? 'junie.exe' : 'junie'

export function engineEnvironment() {
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
  return Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    common.has(key.toUpperCase()) || junie.has(key)))
}

async function executable(file) {
  if (!isAbsolute(file) || (windows && !/\.exe$/i.test(file))) return false
  try {
    await access(file, constants.X_OK)
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

export async function resolveEngine() {
  const override = process.env.EKKO_JUNIE_EXECUTABLE?.trim()
  if (override) return await executable(override) ? { file: override } : undefined
  const path = engineEnvironment()
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
  for (const file of candidates) {
    if (await executable(file)) return { file }
  }
}

export async function engineStatus(resolve, signal) {
  const engine = await resolve()
  signal.throwIfAborted()
  if (!engine) return { installed: false, version: '', source: 'not-installed' }
  try {
    const { stdout } = await execute(engine.file, [...(engine.args ?? []), '--version'], {
      env: engineEnvironment(), signal, timeout: 8000, maxBuffer: 32768, windowsHide: true,
    })
    const version = stdout.match(/^Junie version:\s*([0-9][\w.+-]*(?: \([0-9][\w.+-]*\))?)\s*$/m)?.[1]
    if (version) return { installed: true, version, source: 'external' }
  } catch {
    signal.throwIfAborted()
  }
  return { installed: false, version: '', source: 'external', error: 'Junie CLI could not report its version.' }
}

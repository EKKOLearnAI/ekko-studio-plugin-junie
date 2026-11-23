const scriptLauncher = /^(?:node(?:js)?|bun|deno|tsx|ts-node|python(?:[23](?:\.\d+)?)?|ruby|perl)(?:\.exe)?$/i
const packageLauncher = /^(?:npx|npm|pnpm|yarn|uvx)(?:\.(?:exe|cmd))?$/i
const scriptName = /^[a-z0-9][a-z0-9._-]{0,63}\.(?:[cm]?js|tsx?|py|rb|pl)$/i
const packageName = /^(?:@[a-z0-9][a-z0-9_-]{0,31}\/[a-z0-9][a-z0-9._-]{0,63}|[a-z0-9][a-z0-9_-]{0,59}-mcp)$/
const binaryName = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const sensitiveName = /(?:^|[._\-/])(?:auth(?:orization)?|bearer|cookie|credential[s]?|password|passwd|oauth|secret[s]?|token[s]?|api[-_]?key|access[-_]?key|private[-_]?key|ghp|github[-_]pat|sk[-_]live)(?:[._\-/]|$)|[a-z0-9]{24,}/i
const standaloneFlags = new Set(['-y', '--yes', '--stdio', '--quiet', '--no-install'])
const runtimeFlags = new Set(['--verbose', '--debug', '--read-only'])
const displayLimit = 20

const integerValue = (min, max) => value => {
  if (!/^\d{1,5}$/.test(value)) return undefined
  const number = Number(value)
  return number >= min && number <= max ? value : undefined
}
const among = (...choices) => value => choices.includes(value) ? value : undefined
const bindAddress = among('localhost', '127.0.0.1', '0.0.0.0', '::1', '::')
// Empty indicates a recognized argument whose value must remain concealed.
const pathValue = value => value && !/^[-\x00-\x20\x7f]|[\x00-\x1f\x7f]/.test(value) ? '' : undefined
const directoryOptions = new Set(['--cwd', '--dir', '--directory', '--root', '--workdir'])

function eligibleDirectory(value) {
  // Check shape and size only. A path prefix or spelling says nothing about
  // whether the caller consents to disclosing it.
  const path = value.replace(/^[a-z]:[\\/]/i, '/')
  return value.length <= 80 && value === value.trim() && !/[:?#@=`$%]/.test(path)
}

const workerCount = integerValue(1, 65535)
const optionValues = new Map([
  ['--port', integerValue(0, 65535)],
  ['--threads', workerCount],
  ['--workers', workerCount],
  ['--max-workers', workerCount],
  ['--jobs', workerCount],
  ['--concurrency', workerCount],
  ['--parallelism', workerCount],
  ['--host', bindAddress],
  ['--bind', bindAddress],
  ['--transport', among('stdio', 'http', 'sse', 'streamable-http', 'streamableHttp')],
  ['--log-level', among('trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent')],
  ['--config', pathValue],
  ['--config-dir', pathValue],
])

function fileName(value, pattern) {
  // Display a portable basename only. Opaque commands and inline shell code
  // do not have a safe representation, even when they end in a dot extension.
  if (typeof value !== 'string' || value.startsWith('-') || /[\x00-\x1f\x7f"'=`$;&|<>?#]|:\/\//.test(value)) return ''
  const name = value.split(/[\\/]/).at(-1)
  return pattern.test(name) && !sensitiveName.test(name) ? name : ''
}

function argumentPreview(command, args, shareDirectory) {
  const script = scriptLauncher.test(command)
  const pkg = packageLauncher.test(command)
  const preview = Array(Math.min(args.length, displayLimit)).fill('')
  const result = { args: preview }
  if (!script && !pkg) return result
  let targetSeen = false
  for (let index = 0; index < preview.length; index++) {
    const argument = args[index]
    if (typeof argument !== 'string') break
    if (standaloneFlags.has(argument) || (targetSeen && runtimeFlags.has(argument))) {
      preview[index] = argument
      continue
    }
    if (!targetSeen) {
      const target = script ? fileName(argument, scriptName)
        : packageName.test(argument) && !sensitiveName.test(argument) ? argument : ''
      if (!target) break
      preview[index] = target
      targetSeen = true
      continue
    }
    const equals = argument.indexOf('=')
    const inline = equals !== -1
    const option = inline ? argument.slice(0, equals) : argument
    const isDirectory = directoryOptions.has(option)
    const readValue = isDirectory ? pathValue : optionValues.get(option)
    // Once the argument boundary is ambiguous, later option-looking values
    // may themselves be credentials. Do not resume parsing after that point.
    if (!readValue) break
    if (!inline) preview[index] = option
    const raw = inline ? argument.slice(equals + 1) : args[index + 1]
    let value = typeof raw === 'string' ? readValue(raw) : undefined
    if (value === undefined) break
    const visibleIndex = index + (inline ? 0 : 1)
    if (isDirectory && visibleIndex < preview.length && eligibleDirectory(raw)) {
      result.canShareDirectory = true
      if (shareDirectory(raw)) {
        value = raw
        result.hasSharedDirectory = true
      }
    }
    if (inline) {
      if (value) preview[index] = option + '=' + value
    } else {
      index++
      if (index < preview.length) preview[index] = value
    }
  }
  return result
}

export function mcpPreview(entry, transport, shareDirectory = () => false) {
  if (transport === 'http') return { url: new URL(entry.url).origin }
  if (transport !== 'stdio') return {}
  const command = fileName(entry.command, binaryName)
  const args = Array.isArray(entry.args) ? entry.args : []
  return {
    ...(command ? { command } : {}),
    ...(Array.isArray(entry.args) ? argumentPreview(command, args, shareDirectory) : {}),
    ...(args.length > displayLimit ? { remainingArgs: args.length - displayLimit } : {}),
  }
}

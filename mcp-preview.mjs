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
const directorySegment = /^[a-z][a-z0-9._ -]{0,31}$/i
const privateDirectory = /(?:^|[._-])(?:private|certs?|keys?|ssh|ssl|vault|sk[-_](?:proj|test)|xox[abprs])(?:[._-]|$)/i

function directoryValue(value) {
  if (pathValue(value) === undefined) return undefined
  // Reserve space for the option prefix in the RPC's per-argument limit.
  if (value.length > 80) return ''
  const path = value.replaceAll('\\', '/')
  const temporary = /^(?:\/tmp|\/var\/tmp|\/private\/tmp)(?:\/|$)/.exec(path)
    ?? /^[a-z]:\/temp(?:\/|$)/i.exec(path)
  if (!temporary && /^(?:\/|[a-z]:|~)/i.test(path)) return ''
  if (path === '.' || path === './') return value

  const relative = temporary ? path.slice(temporary[0].length) : path.replace(/^\.\//, '')
  if (temporary && !relative) return value
  const segments = relative.replace(/\/$/, '').split('/')
  const ordinary = segments.every(segment => {
    const identifier = segment.replaceAll(' ', '-')
    return segment === segment.trim() && directorySegment.test(segment)
      && !sensitiveName.test(identifier) && !privateDirectory.test(identifier)
  })
  return ordinary ? value : ''
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
  ['--cwd', directoryValue],
  ['--dir', directoryValue],
  ['--directory', directoryValue],
  ['--root', directoryValue],
  ['--workdir', directoryValue],
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

function argumentPreview(command, args) {
  const script = scriptLauncher.test(command)
  const pkg = packageLauncher.test(command)
  const preview = Array(Math.min(args.length, displayLimit)).fill('')
  if (!script && !pkg) return preview
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
    const readValue = optionValues.get(option)
    // Once the argument boundary is ambiguous, later option-looking values
    // may themselves be credentials. Do not resume parsing after that point.
    if (!readValue) break
    if (!inline) preview[index] = option
    const raw = inline ? argument.slice(equals + 1) : args[index + 1]
    const value = typeof raw === 'string' ? readValue(raw) : undefined
    if (value === undefined) break
    if (inline) {
      if (value) preview[index] = option + '=' + value
    } else {
      index++
      if (index < preview.length) preview[index] = value
    }
  }
  return preview
}

export function mcpPreview(entry, transport) {
  if (transport === 'http') return { url: new URL(entry.url).origin }
  if (transport !== 'stdio') return {}
  const command = fileName(entry.command, binaryName)
  const args = Array.isArray(entry.args) ? entry.args : []
  return {
    ...(command ? { command } : {}),
    ...(Array.isArray(entry.args) ? { args: argumentPreview(command, args) } : {}),
    ...(args.length > displayLimit ? { remainingArgs: args.length - displayLimit } : {}),
  }
}

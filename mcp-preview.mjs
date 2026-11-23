const scriptLauncher = /^(?:node(?:js)?|bun|deno|tsx|ts-node|python(?:[23](?:\.\d+)?)?|ruby|perl)(?:\.exe)?$/i
const packageLauncher = /^(?:npx|npm|pnpm|yarn|uvx)(?:\.(?:exe|cmd))?$/i
const scriptName = /^[a-z0-9][a-z0-9._-]{0,63}\.(?:[cm]?js|tsx?|py|rb|pl)$/i
const packageName = /^(?:@[a-z0-9][a-z0-9_-]{0,31}\/[a-z0-9][a-z0-9._-]{0,63}|[a-z0-9][a-z0-9_-]{0,59}-mcp)$/
const binaryName = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const sensitiveName = /(?:^|[._\-/])(?:auth(?:orization)?|bearer|cookie|credential[s]?|password|passwd|oauth|secret[s]?|token[s]?|api[-_]?key|access[-_]?key|private[-_]?key|ghp|github[-_]pat|sk[-_]live)(?:[._\-/]|$)|[a-z0-9]{24,}/i
const standaloneFlags = new Set(['-y', '--yes', '--stdio', '--quiet', '--no-install'])
const displayLimit = 20

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
  let canRead = script || pkg
  let targetSeen = false
  return args.slice(0, displayLimit).map(value => {
    if (!canRead || typeof value !== 'string') { canRead = false; return '' }
    if (standaloneFlags.has(value)) return value
    if (!targetSeen) {
      const target = script ? fileName(value, scriptName)
        : packageName.test(value) && !sensitiveName.test(value) ? value : ''
      if (target) { targetSeen = true; return target }
    }
    // Custom flags, inline code and positional data can carry credentials.
    // Their remaining values have no safe meaning without a command schema.
    canRead = false
    return ''
  })
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

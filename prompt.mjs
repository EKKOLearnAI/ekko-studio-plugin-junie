const maxAttachmentBytes = 8 * 1024 * 1024
const maxAttachments = 32
export const text = value => ({ type: 'text', text: value })

export async function buildPrompt(input, run, capabilities, signal) {
  const prompt = []
  const attachments = new Map()
  let total = 0

  async function block(part) {
    signal.throwIfAborted()
    if (part.type === 'text') return text(part.text)
    if (attachments.has(part.assetId)) {
      return text('Repeated attachment reference: ' + attachments.get(part.assetId))
    }
    const asset = await run.attachments.resolve(part.assetId)
    if (attachments.size >= maxAttachments || asset.size > maxAttachmentBytes - total) {
      throw new Error('Junie accepts up to 32 attachments and 8 MiB of attachments per turn, including history.')
    }
    const isImage = part.type === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(asset.mediaType)
    if (part.type === 'image' && (!isImage || capabilities?.image !== true)) {
      throw new Error('This Junie session needs ACP image support and a PNG, JPEG, GIF or WebP attachment.')
    }
    if (part.type === 'file' && capabilities?.embeddedContext !== true) {
      throw new Error('This Junie session does not support ACP file attachments.')
    }
    const bytes = Buffer.from(await run.attachments.read(part.assetId))
    signal.throwIfAborted()
    total += bytes.byteLength
    if (total > maxAttachmentBytes) throw new Error('Junie accepts up to 8 MiB of attachments per turn.')
    const name = asset.name || part.name
    attachments.set(part.assetId, name)
    if (isImage) return { type: 'image', mimeType: asset.mediaType, data: bytes.toString('base64') }

    // Give Junie bytes via ACP. Never give the model the Studio storage path.
    const uri = 'studio-attachment://input/' + attachments.size + '/' + encodeURIComponent(name)
    const mimeType = asset.mediaType || 'application/octet-stream'
    const utf8 = bytes.toString('utf8')
    const body = Buffer.from(utf8).equals(bytes) && !utf8.includes('\0')
      ? { text: utf8 } : { blob: bytes.toString('base64') }
    return { type: 'resource', resource: { uri, mimeType, ...body } }
  }

  if (input.instructions.length) {
    prompt.push(text('Studio instructions:\n' + input.instructions.map(item => item.text).join('\n\n')))
  }
  if (input.history.length) {
    prompt.push(text('Previous Studio conversation:'))
    for (const message of input.history) {
      prompt.push(text(message.role + ':'))
      for (const part of message.content) prompt.push(await block(part))
    }
    prompt.push(text('Current user message:'))
  }
  for (const part of input.input) prompt.push(await block(part))
  return prompt
}

function pairs(record) {
  return Object.entries(record ?? {}).map(([name, value]) => ({ name, value: String(value) }))
}

export function acpServers(servers, capabilities) {
  return Object.entries(servers).map(([name, server]) => {
    if (typeof server.command === 'string' && server.command) {
      return { name, command: server.command, args: server.args ?? [], env: pairs(server.env) }
    }
    const type = server.type ?? 'http'
    if (!['http', 'sse'].includes(type) || capabilities?.[type] !== true || typeof server.url !== 'string') {
      throw new Error('Junie does not support a required Studio MCP transport.')
    }
    return { name, type, url: server.url, headers: pairs(server.headers) }
  })
}

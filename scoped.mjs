// Loopback credential separation follows the Cline plugin's MIT-licensed scoped relay.
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { engineEnvironment } from './engine.mjs'

export const scopedProtocols = ['chat_completions']
const profile = 'ekko-studio'
export const scopedModel = 'v1:6:custom:custom:' + profile
const endpoint = '/chat/completions'
const maxRequest = 32 * 1024 * 1024
const failure = { error: { message: 'Studio scoped model request failed.' } }

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxRequest) throw new Error('Model request exceeds its input limit.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function startProxy(model, signal) {
  const target = new URL(model.baseUrl)
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash
      || !scopedProtocols.includes(model.apiMode) || typeof model.token !== 'string' || !model.token
      || typeof model.model !== 'string' || !model.model.trim()) {
    throw new Error('The Studio scoped model binding is invalid.')
  }
  target.pathname = target.pathname.replace(/\/+$/, '') + endpoint
  const key = randomBytes(32).toString('base64url')
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== 'Bearer ' + key) { response.writeHead(401).end(); return }
    if (request.method !== 'POST' || request.url !== '/v1' + endpoint) { response.writeHead(404).end(); return }

    const connection = new AbortController()
    const disconnect = () => connection.abort()
    response.once('close', disconnect)
    try {
      const body = await readBody(request)
      if (body?.model !== model.model) { response.writeHead(403).end(); return }
      if (model.reasoningEffort) body.reasoning_effort = model.reasoningEffort
      if (Number.isSafeInteger(model.outputLimit) && model.outputLimit > 0) {
        const field = 'max_completion_tokens' in body ? 'max_completion_tokens' : 'max_tokens'
        if (!(body[field] > 0) || body[field] > model.outputLimit) body[field] = model.outputLimit
      }
      const reply = await fetch(target, {
        method: 'POST', body: JSON.stringify(body), redirect: 'error',
        signal: AbortSignal.any([signal, connection.signal]),
        headers: { authorization: 'Bearer ' + model.token, 'content-type': 'application/json' },
      })
      if (!reply.ok) {
        await reply.body?.cancel()
        response.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(failure))
        return
      }
      response.writeHead(reply.status, {
        'content-type': reply.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
      })
      if (reply.body) await pipeline(Readable.fromWeb(reply.body), response)
      else response.end()
    } catch {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify(failure))
      else response.destroy()
    } finally {
      response.off('close', disconnect)
    }
  })
  server.requestTimeout = 60_000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    key, url: 'http://127.0.0.1:' + server.address().port + '/v1' + endpoint,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }),
  }
}

export async function createScopedConfig(model, runtimeDir, signal) {
  signal.throwIfAborted()
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(join(runtimeDir, 'junie-scoped-'))
  let relay, disposal
  const dispose = () => disposal ??= (async () => {
    try { await relay?.close() }
    finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }) }
  })()
  try {
    relay = await startProxy(model, signal)
    const models = join(directory, 'models')
    const configPath = join(directory, 'studio.json')
    const config = {
      'mcp-default-locations': false, 'skill-default-locations': false,
      'command-default-locations': false, 'agent-default-locations': false,
    }
    const custom = {
      id: model.model, baseUrl: relay.url, apiType: 'OpenAICompletion', apiKey: relay.key,
      ...(Number.isSafeInteger(model.contextWindow) && model.contextWindow > 0 ? { maxContextLength: model.contextWindow } : {}),
      ...(model.reasoningEffort ? { efforts: [model.reasoningEffort], defaultEffort: model.reasoningEffort } : {}),
    }
    await mkdir(models, { mode: 0o700 })
    await Promise.all([
      writeFile(configPath, JSON.stringify(config), { mode: 0o600, signal }),
      writeFile(join(models, profile + '.json'), JSON.stringify(custom), { mode: 0o600, signal }),
    ])
    signal.throwIfAborted()
    const env = engineEnvironment({ native: false })
    for (const key of Object.keys(env)) {
      if (/^(?:https?|all|no)_proxy$/i.test(key)) delete env[key]
    }
    return {
      args: ['--model', 'custom:' + profile, '--config-default-locations', 'false',
        '--config-location', configPath, '--model-default-locations', 'false',
        '--model-location', models, '--cache-dir', join(directory, 'cache')],
      env: { ...env, JUNIE_HOME: directory, JUNIE_DATA: directory,
        NO_PROXY: 'localhost,127.0.0.1,::1' },
      dispose,
    }
  } catch (error) {
    await dispose()
    throw error
  }
}

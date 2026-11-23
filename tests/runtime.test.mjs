import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { apply, createJunieAgent } from '../server.mjs'
import { managedEngine } from '../managed-engine.mjs'
import { createScopedConfig, scopedModel } from '../scoped.mjs'
import manifest from '../plugin.json' with { type: 'json' }

const fixture = fileURLToPath(new URL('./fixtures/junie.mjs', import.meta.url))
const owner = { userId: 'owner', profile: 'default' }
const agentId = 'plugin:junie/junie'
const identity = { ...owner, agentId, sessionId: 'studio-session', runId: 'turn' }
const signal = new AbortController().signal
const lifecycle = { add() {} }
const common = { identity, signal, lifecycle }
const storage = () => join(tmpdir(), 'junie-test-' + randomUUID())
const configure = (...options) => createJunieAgent(owner, managedEngine(storage(), {
  external: async () => ({ file: process.execPath, args: [fixture, ...options] }), override: () => false,
}))

function input(message, earlier = [], extra = []) {
  return { input: [...extra, { type: 'text', text: message }], history: earlier, instructions: [], options: {} }
}

async function setup(t, agent = configure(), overrides = {}) {
  const cwd = await mkdtemp(join(await realpath(tmpdir()), 'junie-test-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const paths = { workspaceDir: cwd, runtimeDir: join(cwd, 'runtime') }
  const session = agent.runtime.createSession({ ...common, mode: 'global', paths, ...overrides })
  t.after(() => session.dispose())
  const events = [], approvals = []
  const run = {
    ...common, mode: 'global', model: {}, paths, deadlineAt: Date.now() + 15_000, mcpServers: {},
    interactions: { async approve(request) { approvals.push(request); return { outcome: 'denied' } } },
    output: { async emit(event) { events.push(event) } },
    ...overrides,
  }
  return {
    session, run, events, approvals,
    wire: async () => (await readFile(join(cwd, 'junie-wire.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse),
    turn: value => session.run(value, run),
  }
}

test('registers local Agent ID on API v1 and disposes registration', async () => {
  let registered, disposed = false
  const rpcs = new Map()
  const removed = new Set()
  const dispose = apply({ identity, paths: { dataDir: storage() }, extensions: { rpc: {
    register(name, handler) { rpcs.set(name,handler); return () => { removed.add(name) } },
  }, agents: { register(agent) {
    registered = agent
    return { async dispose() { disposed = true } }
  } } } })
  assert.equal(manifest.id, 'junie')
  assert.equal(registered.id, 'junie')
  assert.equal(registered.agentApiVersion, 1)
  assert.deepEqual(Object.keys(registered.modes), ['global', 'scoped'])
  assert.deepEqual(registered.modes.scoped.protocols, ['chat_completions'])
  assert.deepEqual(registered.management.settings(common), { viewId: 'native-login' })
  const login = rpcs.get('native-login')
  assert.equal(rpcs.size, 10)
  const { junieWordmark } = await login(null, common)
  const officialLogo = await readFile(new URL('../assets/junie-wordmark.svg', import.meta.url))
  assert.equal(junieWordmark, 'data:image/svg+xml;base64,' + officialLogo.toString('base64'))
  assert.equal(manifest.icon, 'assets/terminal.png')
  await assert.rejects(login(null, { ...common, identity: { ...identity, profile: 'another' } }), /account and Profile/)
  await assert.rejects(rpcs.get('native-skills-list')(null, { ...common, identity: { ...identity, userId: 'stranger' } }), /account and Profile/)
  await assert.rejects(rpcs.get('native-config-write')({ revision: 'missing', content: '{}' },
    { ...common, identity: { ...identity, profile: 'another' } }), /account and Profile/)
  assert.deepEqual(manifest.views.map(view => [view.id,view.slot]), [
    ['native-login','agent-settings'],['skills','agent-settings'],['mcp','agent-settings'],['native-config','agent-settings'],
  ])
  assert.deepEqual(registered.features, { surfaces: ['chat'], streaming: true, resume: false })
  await dispose()
  assert.ok(disposed)
  assert.deepEqual(removed,new Set(rpcs.keys()))
})

test('discovers executable, grouped native models, default and efforts', async () => {
  const agent = configure()
  assert.deepEqual(await agent.getStatus(common), { installed: true, version: '26.11.2 (4100.11)', source: 'external' })
  const catalog = await agent.modes.global.listModels(common)
  assert.equal(catalog.status, 'ready')
  assert.deepEqual(catalog.models, [
    { id: 'a', name: 'a', isDefault: true, reasoningEfforts: ['low', 'high'] }, { id: 'b', name: 'b' },
  ])
})

test('handles missing, unauthenticated and isolated owner access without leaking CLI errors', async t => {
  const missing = createJunieAgent(owner, managedEngine(storage(), { external: async () => undefined, override: () => false }))
  assert.equal((await missing.getStatus(common)).source, 'managed')
  assert.equal((await missing.modes.global.listModels(common)).status, 'not_installed')
  const agent = configure('unauthenticated')
  const catalog = await agent.modes.global.listModels(common)
  assert.equal(catalog.status, 'auth_required')
  assert.doesNotMatch(catalog.message, /fixture-secret/)
  for (const stranger of [{ ...identity, userId: 'other' }, { ...identity, profile: 'other' }]) {
    const other = { ...common, identity: stranger, mode: 'global' }
    assert.equal((await agent.getStatus(other)).installed, true)
    assert.throws(() => agent.management.checkUpdate(other), /account and Profile/)
    assert.throws(() => agent.management.remove(other), /account and Profile/)
    assert.equal((await agent.modes.global.listModels(other)).status, 'auth_required')
    assert.throws(() => agent.runtime.createSession(other), /account and Profile/)
  }
  const { turn, session, run } = await setup(t, agent)
  await assert.rejects(turn(input('hello')), /sign in or configure a model/)
  await assert.rejects(session.run(input('hello'), { ...run, identity: { ...identity, sessionId: 'other' } }), /account and Profile/)
})

test('streams only this run, confirms model and effort, and transfers history, attachments and MCP', async t => {
  const file = { type: 'file', assetId: 'f', name: 'note.txt', mediaType: 'text/plain' }
  const image = { type: 'image', assetId: 'i', name: 'image.png', mediaType: 'image/png' }
  const binary = { type: 'file', assetId: 'b', name: 'binary.bin', mediaType: 'application/octet-stream' }
  const fileBytes = { f: Buffer.from('attached text'), i: Buffer.from([1, 2]), b: Buffer.from([0, 255]) }
  const assets = { f: file, i: image, b: binary }
  const { turn, wire, events } = await setup(t, configure(), {
    model: { model: 'b', reasoningEffort: 'high' },
    attachments: {
      async resolve(id) { return { ...assets[id], localPath: '/private/studio/storage', size: fileBytes[id].length } },
      async read(id) { return fileBytes[id] },
    },
    mcpServers: { local: { command: 'mcp', args: ['serve'], env: { TOKEN: 'mcp-secret' } },
      remote: { type: 'http', url: 'http://127.0.0.1/mcp', headers: { Authorization: 'mcp-secret' } } },
  })
  const history = [{ role: 'assistant', content: [{ type: 'text', text: 'prior response' }] }]
  const result = await turn(input('task', history, [file, image, binary]))
  assert.deepEqual(result, { content: [{ type: 'text', text: 'fixture b/high' }], finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 8, cacheReadTokens: 3, isEstimated: false } })
  assert.deepEqual(events.map(event => event.text), ['fixture ', 'b/high'])
  const [{ params: session }, { params: first }] = await wire()
  assert.ok(session.cwd)
  assert.deepEqual(session.mcpServers, [
    { name: 'local', command: 'mcp', args: ['serve'], env: [{ name: 'TOKEN', value: 'mcp-secret' }] },
    { name: 'remote', type: 'http', url: 'http://127.0.0.1/mcp', headers: [{ name: 'Authorization', value: 'mcp-secret' }] },
  ])
  assert.ok(first.prompt.some(part => part.text === 'prior response'))
  assert.equal(first.prompt.find(part => part.resource?.mimeType === 'text/plain').resource.text, 'attached text')
  assert.equal(first.prompt.find(part => part.resource?.blob).resource.blob, 'AP8=')
  assert.deepEqual(first.prompt.find(part => part.type === 'image'), { type: 'image', mimeType: 'image/png', data: 'AQI=' })
  assert.doesNotMatch(JSON.stringify(first), /private\/studio|mcp-secret/)
  await turn(input('next', history))
  const prompts = (await wire()).filter(frame => frame.method === 'session/prompt')
  assert.notEqual(prompts[0].params.sessionId, prompts[1].params.sessionId)
})

test('sends only an explicit single-use permission result for the active session', async t => {
  const denied = await setup(t)
  assert.equal((await denied.turn(input('permission'))).content[0].text, 'denied')
  assert.equal(denied.approvals.length, 1)
  assert.deepEqual(denied.events.map(event => event.type), ['tool.started', 'tool.failed', 'text.delta'])
  assert.doesNotMatch(JSON.stringify([denied.events, denied.approvals]), /fixture-secret/)
  const allowed = await setup(t, configure(), {
    interactions: { async approve() { return { outcome: 'approved' } } },
  })
  assert.equal((await allowed.turn(input('permission'))).content[0].text, 'allowed')
  const unconfirmed = await setup(t, configure('no-safe-mode'))
  await assert.rejects(unconfirmed.turn(input('hello')), /did not confirm/)
  assert.deepEqual((await unconfirmed.wire()).map(frame => frame.method), ['session/new'])
})

test('explicit cancellation addresses the active ACP session and closes it', async t => {
  const controller = new AbortController()
  const { turn, wire } = await setup(t, configure(), {
    signal: controller.signal,
    output: { async emit(event) { if (event.text === 'waiting') controller.abort() } },
  })
  await assert.rejects(turn(input('wait')), { name: 'AbortError' })
  const [, prompt, cancel] = await wire()
  assert.equal(cancel.method, 'session/cancel')
  assert.equal(cancel.params.sessionId, prompt.params.sessionId)
})

test('deadline interrupts an unresponsive handshake', async t => {
  const { session, run } = await setup(t, configure('hang'))
  await assert.rejects(session.run(input('wait'), { ...run, deadlineAt: Date.now() + 200 }), { name: 'TimeoutError' })
})

async function modelRelay(t) {
  const calls = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    calls.push({ path: request.url, auth: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks)) })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ reply: calls.at(-1).body.model }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const bind = (selected = 'studio-model', token = 'studio-test-lease') => ({
    provider: 'test', apiMode: 'chat_completions', model: selected, token,
    baseUrl: 'http://127.0.0.1:' + server.address().port + '/gateway/v1',
    contextWindow: 64000, outputLimit: 500, reasoningEffort: 'high',
  })
  return { calls, bind }
}

test('scoped turns accept other accounts and Profiles but enforce session identity and model isolation', async t => {
  const upstream = await modelRelay(t)
  const user = { ...identity, userId: 'other', profile: 'mine' }
  const second = { ...identity, userId: 'another', profile: 'separate' }
  const a = await setup(t, configure(), { identity: user, mode: 'scoped', model: upstream.bind('model-a', 'lease-a') })
  const b = await setup(t, configure(), { identity: second, mode: 'scoped', model: upstream.bind('model-b', 'lease-b') })
  const wrong = await setup(t, configure('wrong-scoped-model'), { identity: user, mode: 'scoped', model: upstream.bind() })
  await assert.rejects(a.session.run(input('hello'), { ...a.run, identity: second }), /account and Profile/)
  await assert.rejects(wrong.turn(input('hello')), /selected model setting/)
  const results = await Promise.all([a.turn(input('first')), b.turn(input('second'))])
  assert.deepEqual(results.map(result => result.content[0].text), ['model-a', 'model-b'])
  assert.ok(results.every(result => !result.usage))
  assert.deepEqual(upstream.calls.map(call => [call.path, call.auth, call.body.model, call.body.max_tokens, call.body.reasoning_effort]).sort(), [
    ['/gateway/v1/chat/completions', 'Bearer lease-a', 'model-a', 500, 'high'],
    ['/gateway/v1/chat/completions', 'Bearer lease-b', 'model-b', 500, 'high'],
  ])
  for (const entry of [a,b,wrong]) assert.deepEqual(await readdir(entry.run.paths.runtimeDir), [])
})

test('scoped relay rejects wrong credentials, unbound models and paths and closes after disposal', async t => {
  const upstream = await modelRelay(t)
  const directory = await mkdtemp(join(tmpdir(), 'junie-relay-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(directory, { recursive: true })
  const model = upstream.bind()
  const scoped = await createScopedConfig(model, directory, signal)
  t.after(scoped.dispose)
  const profile = JSON.parse(await readFile(join(scoped.env.JUNIE_HOME, 'models', 'ekko-studio.json'), 'utf8'))
  assert.ok(scoped.args.includes('custom:ekko-studio'))
  assert.match(scopedModel, /custom:ekko-studio$/)
  assert.notEqual(profile.apiKey, model.token)
  assert.doesNotMatch(JSON.stringify(scoped), /studio-test-lease/)
  const post = (url, key, selected = model.model) => fetch(url, {
    method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ model: selected }),
  })
  assert.equal((await post(profile.baseUrl, model.token)).status, 401)
  assert.equal((await post(profile.baseUrl, profile.apiKey, 'wrong-model')).status, 403)
  assert.equal((await post(profile.baseUrl + '?extra', profile.apiKey)).status, 404)
  assert.equal(upstream.calls.length, 0)
  await scoped.dispose()
  await assert.rejects(post(profile.baseUrl, profile.apiKey), /fetch failed/)
  assert.deepEqual(await readdir(directory), [])
})

test('scoped cancellation closes its in-flight provider request and clears the private home', async t => {
  const requested = Promise.withResolvers()
  const disconnected = Promise.withResolvers()
  const upstream = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Wait for the complete request. */ }
    response.once('close', disconnected.resolve)
    requested.resolve()
  }).listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  t.after(() => new Promise(resolve => { upstream.close(resolve); upstream.closeAllConnections() }))
  const controller = new AbortController()
  const { turn, run } = await setup(t, configure(), {
    mode: 'scoped', signal: controller.signal,
    model: {
      provider: 'test', model: 'waiting-model', apiMode: 'chat_completions',
      baseUrl: 'http://127.0.0.1:' + upstream.address().port, token: 'scoped-test-lease',
      contextWindow: null, outputLimit: null,
    },
  })
  const settled = assert.rejects(turn(input('hold request')), { name: 'AbortError' })
  await requested.promise
  controller.abort()
  await settled
  await disconnected.promise
  assert.deepEqual(await readdir(run.paths.runtimeDir), [])
})

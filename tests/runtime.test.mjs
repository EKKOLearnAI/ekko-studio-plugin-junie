import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { apply, createJunieAgent } from '../server.mjs'
import manifest from '../plugin.json' with { type: 'json' }

const fixture = fileURLToPath(new URL('./fixtures/junie.mjs', import.meta.url))
const owner = { userId: 'owner', profile: 'default' }
const agentId = 'plugin:junie/junie'
const identity = { ...owner, agentId, sessionId: 'studio-session', runId: 'turn' }
const signal = new AbortController().signal
const lifecycle = { add() {} }
const common = { identity, signal, lifecycle }
const configure = (...options) => createJunieAgent(owner, async () => ({ file: process.execPath, args: [fixture, ...options] }))

function input(message, earlier = [], extra = []) {
  return { input: [...extra, { type: 'text', text: message }], history: earlier, instructions: [], options: {} }
}

async function setup(t, agent = configure(), overrides = {}) {
  const cwd = await mkdtemp(join(await realpath(tmpdir()), 'junie-test-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const paths = { workspaceDir: cwd, runtimeDir: join(cwd, 'runtime') }
  const session = agent.runtime.createSession({ ...common, mode: 'global', paths })
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
  const dispose = apply({ identity, extensions: { agents: { register(agent) {
    registered = agent
    return { async dispose() { disposed = true } }
  } } } })
  assert.equal(manifest.id, 'junie')
  assert.equal(registered.id, 'junie')
  assert.equal(registered.agentApiVersion, 1)
  assert.deepEqual(Object.keys(registered.modes), ['global'])
  assert.deepEqual(registered.features, { surfaces: ['chat'], streaming: true, resume: false })
  await dispose()
  assert.ok(disposed)
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
  const missing = createJunieAgent(owner, async () => undefined)
  assert.equal((await missing.getStatus(common)).source, 'not-installed')
  assert.equal((await missing.modes.global.listModels(common)).status, 'not_installed')
  const agent = configure('unauthenticated')
  const catalog = await agent.modes.global.listModels(common)
  assert.equal(catalog.status, 'auth_required')
  assert.doesNotMatch(catalog.message, /fixture-secret/)
  for (const stranger of [{ ...identity, userId: 'other' }, { ...identity, profile: 'other' }]) {
    const other = { ...common, identity: stranger, mode: 'global' }
    assert.equal((await agent.getStatus(other)).installed, false)
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

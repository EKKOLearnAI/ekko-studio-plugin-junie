#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import assert from 'node:assert/strict'

if (process.argv.includes('--version')) {
  console.log('Junie version: 26.11.2 (4100.11)')
  process.exit(0)
}
assert.ok(process.argv.includes('--acp=true'))
assert.ok(process.argv.includes('--acp-logging=false'))
assert.equal(process.env.STUDIO_FIXTURE_SECRET, undefined)
const settings = process.argv.slice(2)
const sessionId = randomUUID()
let model = 'a', effort = 'low', brave = 'brave-auto'
let promptId

const wire = frame => console.log(JSON.stringify({ jsonrpc: '2.0', ...frame }))
const reply = (id, result) => wire({ id, result })
const update = (sessionUpdate, extra, nativeId = sessionId) => wire({
  method: 'session/update', params: { sessionId: nativeId, update: { sessionUpdate, ...extra } },
})
const delta = (text, nativeId) => update('agent_message_chunk', { content: { type: 'text', text } }, nativeId)
const select = (id, currentValue, values) => ({ id, type: 'select', currentValue, options: values.map(value => ({ value, name: value })) })
const config = () => {
  const models = select('model', model, ['a', 'b'])
  models.options = [{ group: 'Custom', options: models.options }]
  return [models, select('effort', effort, ['low', 'high']), select('brave_mode', brave, ['brave-auto', 'off', 'on'])]
}
const permission = nativeId => wire({ id: nativeId === sessionId ? 500 : 501, method: 'session/request_permission',
  params: { sessionId: nativeId, toolCall: { kind: 'execute', toolCallId: 'one', rawInput: { secret: 'fixture-secret' } },
    options: [{ optionId: 'yes', kind: 'allow_once' }, { optionId: 'no', kind: 'reject_once' }, { optionId: 'always', kind: 'allow_always' }] },
})

for await (const line of createInterface({ input: process.stdin })) {
  const frame = JSON.parse(line)
  const { method, id, params } = frame
  if (['session/new', 'session/prompt', 'session/cancel'].includes(method)) {
    appendFileSync('junie-wire.jsonl', JSON.stringify({ method, params }) + '\n')
  }
  switch (method) {
    case 'initialize':
      if (settings.includes('hang')) break
      reply(id, {
        protocolVersion: 1, agentInfo: { name: '@jetbrains/junie' },
        agentCapabilities: { loadSession: true, promptCapabilities: { image: true, embeddedContext: true },
          mcpCapabilities: { http: true }, sessionCapabilities: { delete: {} } },
      })
      break
    case 'session/new':
      if (settings.includes('unauthenticated')) {
        wire({ id, error: { code: -32000, message: 'fixture-secret' } })
        break
      }
      reply(id, { sessionId, configOptions: config() })
      break
    case 'session/delete':
      reply(id, {})
      break
    case 'session/set_config_option':
      if (params.configId === 'brave_mode' && !settings.includes('no-safe-mode')) brave = params.value
      if (params.configId === 'model') model = params.value
      if (params.configId === 'effort') effort = params.value
      reply(id, { configOptions: config() })
      break
    case 'session/prompt': {
      assert.equal(brave, 'off')
      promptId = id
      const last = params.prompt.at(-1)?.text
      delta('foreign', 'foreign')
      if (last === 'wait') {
        delta('waiting')
      } else if (last === 'permission') {
        update('tool_call', { toolCallId: 'one', kind: 'execute', status: 'pending', rawInput: 'fixture-secret' })
        permission('foreign')
        permission(sessionId)
      } else {
        delta('fixture ')
        delta(model + '/' + effort)
        reply(id, { stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 8, cachedReadTokens: 3 } })
      }
      break
    }
    case 'session/cancel':
      reply(promptId, { stopReason: 'cancelled' })
      break
    case undefined:
      if (id === 501) assert.equal(frame.result.outcome.outcome, 'cancelled')
      if (id === 500) {
        const approved = frame.result.outcome.optionId === 'yes'
        update('tool_call_update', { toolCallId: 'one', status: approved ? 'completed' : 'failed' })
        delta(approved ? 'allowed' : 'denied')
        reply(promptId, { stopReason: 'end_turn' })
      }
      break
    default:
      wire({ id, error: { code: -32601, message: 'unsupported method' } })
  }
}

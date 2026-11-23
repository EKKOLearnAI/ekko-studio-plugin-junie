import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AcpError } from './acp.mjs'
import { initializeAcp, loginCommand, openAcp } from './engine.mjs'
import { managedEngine } from './managed-engine.mjs'
import { createScopedConfig, scopedModel, scopedProtocols } from './scoped.mjs'
import { acpServers, buildPrompt, text } from './prompt.mjs'
import { registerRpc } from './sdk/harness/contracts.mjs'
import contract from './contracts/plugin.json' with { type: 'json' }
import manifest from './plugin.json' with { type: 'json' }

const installGuide = 'https://junie.jetbrains.com/docs/junie-cli.html'
const unavailable = 'Install Junie CLI in Studio Agent management, or make an official external executable available to Studio.'
const signIn = 'Open Junie login in Agent management. Run the displayed command as the Studio service user, then sign in or configure a model and refresh the list.'
const ownerOnly = 'Junie can use native credentials only for the Studio account and Profile that enabled it.'
const cancelled = { outcome: { outcome: 'cancelled' } }
const stopReasons = { end_turn: 'stop', refusal: 'stop', max_tokens: 'length', max_turn_requests: 'tool_limit' }
const toolKinds = new Set(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other'])
const sameOwner = (left, right) => left.userId === right.userId && left.profile === right.profile
const validId = value => typeof value === 'string' && /^[^\x00-\x20\x7f][^\x00-\x1f\x7f]{0,511}$/.test(value) && value.trim() === value

async function newSession(acp, cwd, servers, capabilities, signal) {
  const native = await acp.request('session/new', {
    cwd, mcpServers: acpServers(servers, capabilities.mcpCapabilities),
  }, signal)
  if (!validId(native?.sessionId)) throw new Error('Junie did not return an ACP session ID.')
  return native
}

function option(session, id) {
  return session?.configOptions?.find(item => item.type === 'select' && item.id === id)
}

function choices(setting) {
  return setting?.options?.flatMap(item => Array.isArray(item.options) ? item.options : [item]) ?? []
}

function modelsFrom(session) {
  const model = option(session, 'model')
  const efforts = choices(option(session, 'effort')).map(item => item.value).filter(validId)
  const models = new Map()
  for (const item of choices(model)) {
    if (!validId(item?.value) || models.has(item.value)) continue
    const isDefault = item.value === model.currentValue
    models.set(item.value, {
      id: item.value,
      name: validId(item.name) ? item.name : item.value,
      ...(isDefault ? { isDefault: true } : {}),
      ...(isDefault && efforts.length ? { reasoningEfforts: efforts } : {}),
    })
  }
  return [...models.values()]
}

async function selectOption(acp, native, id, value, signal) {
  const setting = option(native, id)
  if (!choices(setting).some(item => item.value === value)) {
    throw new Error('Junie does not offer the required or selected ' + id + ' setting.')
  }
  if (setting.currentValue === value) return native
  const result = await acp.request('session/set_config_option', {
    sessionId: native.sessionId, configId: id, value,
  }, signal)
  if (option(result, id)?.currentValue !== value) {
    throw new Error('Junie did not confirm the ' + id + ' setting.')
  }
  return { ...native, configOptions: result.configOptions }
}

function catalog(status, message, models = []) {
  return { status, source: 'junie-acp', scope: 'available', models, ...(message ? { message } : {}) }
}

async function listModels(ctx, resolve) {
  const timeout = AbortSignal.timeout(25_000)
  const signal = AbortSignal.any([ctx.signal, timeout])
  let acp, directory
  try {
    signal.throwIfAborted()
    const engine = await resolve()
    if (!engine) return catalog('not_installed', unavailable)
    directory = await mkdtemp(join(await realpath(tmpdir()), 'junie-catalog-'))
    signal.throwIfAborted()
    acp = openAcp(engine, directory, ({ id }) => { if (id !== undefined) acp.methodNotFound(id) })
    ctx.lifecycle.add(() => acp.close())
    const capabilities = await initializeAcp(acp, signal)
    const native = await newSession(acp, directory, {}, capabilities, signal)
    const models = modelsFrom(native)
    if (capabilities.sessionCapabilities?.delete) {
      await acp.request('session/delete', { sessionId: native.sessionId }, signal).catch(() => {})
      signal.throwIfAborted()
    }
    return models.length ? catalog('ready', undefined, models) : catalog('empty', 'Junie did not return any models.')
  } catch (error) {
    ctx.signal.throwIfAborted()
    if (timeout.aborted) return catalog('timeout', 'Junie model discovery timed out.')
    if (error instanceof AcpError && error.code === -32000) return catalog('auth_required', signIn)
    return catalog('error', 'Could not read models from Junie CLI. Check the installed CLI and its native configuration.')
  } finally {
    try { await acp?.close() }
    finally { if (directory) await rm(directory, { recursive: true, force: true }) }
  }
}

function trackOutput(run) {
  let answer = ''
  const pending = new Set()
  return {
    get answer() { return answer },
    async update(update) {
      const { sessionUpdate, content, toolCallId, status, kind } = update ?? {}
      if (sessionUpdate === 'agent_message_chunk' && content?.type === 'text' && typeof content.text === 'string') {
        answer += content.text
        await run.output.emit({ type: 'text.delta', text: content.text })
      }
      if (!['tool_call', 'tool_call_update'].includes(sessionUpdate) || !validId(toolCallId)) return
      if (sessionUpdate === 'tool_call' && !pending.has(toolCallId)) {
        pending.add(toolCallId)
        await run.output.emit({ type: 'tool.started', callId: toolCallId, name: toolKinds.has(kind) ? kind : 'Junie tool', input: {} })
      }
      if (!['completed', 'failed'].includes(status) || !pending.delete(toolCallId)) return
      await run.output.emit(status === 'completed'
        ? { type: 'tool.completed', callId: toolCallId, result: null }
        : { type: 'tool.failed', callId: toolCallId, error: 'Junie tool failed or was denied.' })
    },
    async finish() {
      for (const callId of pending) {
        await run.output.emit({ type: 'tool.failed', callId, error: 'Junie ended the turn without a tool result.' })
      }
    },
  }
}

async function permission(run, params, signal) {
  const options = params.options
  const tool = params.toolCall
  if (!Array.isArray(options) || !validId(tool?.toolCallId) || signal.aborted ||
    options.some(option => !validId(option?.optionId)) ||
    new Set(options.map(option => option.optionId)).size !== options.length) return cancelled
  const allow = options.filter(option => option.kind === 'allow_once')
  const deny = options.filter(option => option.kind === 'reject_once')
  if (allow.length !== 1) return cancelled

  const kind = toolKinds.has(tool.kind) ? tool.kind : 'unknown'
  const result = await run.interactions.approve({
    operationId: randomUUID(),
    title: 'Junie tool permission',
    details: 'Allow this Junie tool call (' + kind + ') once? See the conversation and workspace before approving.',
  })
  if (signal.aborted || !['approved', 'denied'].includes(result.outcome)) return cancelled
  const selected = result.outcome === 'approved' ? allow[0] : deny.length === 1 ? deny[0] : undefined
  return selected ? { outcome: { outcome: 'selected', optionId: selected.optionId } } : cancelled
}

function usageFrom(usage) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null
  const inputTokens = count(usage?.inputTokens)
  const outputTokens = count(usage?.outputTokens)
  const cacheReadTokens = count(usage?.cachedReadTokens)
  if (inputTokens === null && outputTokens === null) return {}
  return { usage: { inputTokens, outputTokens, ...(cacheReadTokens === null ? {} : { cacheReadTokens }), isEstimated: false } }
}

async function executeTurn(input, run, resolve, signal) {
  const scoped = run.mode === 'scoped' ? await createScopedConfig(run.model, run.paths.runtimeDir, signal) : undefined
  try {
    if (scoped) run.lifecycle.add(scoped.dispose)
    return await promptTurn(input, run, resolve, signal, scoped)
  } finally {
    await scoped?.dispose()
  }
}

async function promptTurn(input, run, resolve, signal, scoped) {
  const engine = await resolve()
  signal.throwIfAborted()
  if (!engine) throw new Error(unavailable)
  const cwd = await realpath(run.paths.workspaceDir).catch(() => null)
  if (!cwd) throw new Error('Junie requires an existing Studio workspace directory.')
  signal.throwIfAborted()

  const failed = new AbortController()
  const live = AbortSignal.any([signal, failed.signal])
  const startup = AbortSignal.any([live, AbortSignal.timeout(30_000)])
  const output = trackOutput(run)
  let sessionId, prompting = false, updates = Promise.resolve()
  const acp = openAcp(engine, cwd, frame => {
    const { method, params, id } = frame
    const active = prompting && params?.sessionId === sessionId && !live.aborted
    if (method === 'session/update' && id === undefined && active) {
      updates = updates.then(() => {
        if (!live.aborted) return output.update(params.update)
      }).catch(() => failed.abort(new Error('Studio could not stream the Junie response.')))
    } else if (method === 'session/request_permission' && id !== undefined) {
      const response = active ? permission(run, params, live).catch(() => cancelled) : Promise.resolve(cancelled)
      void response.then(result => acp.respond(id, prompting && !live.aborted ? result : cancelled))
        .catch(() => failed.abort(new Error('Could not respond to a Junie ACP request.')))
    } else if (id !== undefined) {
      acp.methodNotFound(id)
    }
  }, scoped)
  const cancel = () => {
    if (sessionId && prompting) acp.notify('session/cancel', { sessionId })
  }
  run.lifecycle.add(() => acp.close())
  live.addEventListener('abort', cancel, { once: true })
  try {
    const capabilities = await initializeAcp(acp, startup)
    let native = await newSession(acp, cwd, run.mcpServers, capabilities, startup)
    sessionId = native.sessionId
    native = await selectOption(acp, native, 'brave_mode', 'off', startup)
    if (scoped) {
      native = await selectOption(acp, native, 'model', scopedModel, startup)
    } else if (run.model.model) {
      native = await selectOption(acp, native, 'model', run.model.model, startup)
    }
    if (run.model.reasoningEffort) {
      native = await selectOption(acp, native, 'effort', run.model.reasoningEffort, startup)
    }
    if (scoped && option(native, 'model')?.currentValue !== scopedModel) {
      throw new Error('Junie did not confirm the Studio scoped model.')
    }

    const prompt = await buildPrompt(input, run, capabilities.promptCapabilities, live)
    live.throwIfAborted()
    prompting = true
    const result = await acp.request('session/prompt', { sessionId, prompt }, live)
    prompting = false
    await updates
    live.throwIfAborted()
    const finishReason = Object.hasOwn(stopReasons, result?.stopReason) ? stopReasons[result.stopReason] : undefined
    if (!finishReason) throw new Error('Junie stopped the turn before returning a completed response.')
    await output.finish()
    return { content: output.answer ? [text(output.answer)] : [], finishReason, ...(scoped ? {} : usageFrom(result.usage)) }
  } catch (error) {
    live.throwIfAborted()
    if (startup.aborted && !prompting) throw new Error('Junie ACP startup timed out.')
    if (error instanceof AcpError && error.code === -32000) {
      throw new Error(scoped ? 'Junie could not activate the isolated Studio model.' : signIn)
    }
    throw error
  } finally {
    live.removeEventListener('abort', cancel)
    const wasPrompting = prompting
    prompting = false
    await acp.close({ cancel: live.aborted && wasPrompting })
    await updates
  }
}

export function createJunieAgent(owner, manager) {
  const resolve = async () => (await manager.resolve()).engine
  const requireOwner = run => { if (!sameOwner(owner, run.identity)) throw new Error(ownerOnly) }
  return {
    id: 'junie',
    name: manifest.name,
    vendor: 'JetBrains',
    description: manifest.description,
    agentApiVersion: 1,
    getStatus: ctx => manager.status(ctx.signal),
    management: {
      installGuideUrl: installGuide,
      settings(run) { requireOwner(run); return { viewId: 'native-login' } },
      checkUpdate(run) { requireOwner(run); return manager.checkUpdate(run) },
      upgrade(input, run) { requireOwner(run); return manager.upgrade(input, run) },
      remove(run) { requireOwner(run); return manager.remove(run) },
      supportsAutoUpdate(run) { return sameOwner(owner, run.identity) ? manager.supportsAutoUpdate(run.signal) : false },
    },
    modes: {
      global: { listModels: ctx => sameOwner(owner, ctx.identity) ? listModels(ctx, resolve) : catalog('auth_required', ownerOnly) },
      scoped: { protocols: scopedProtocols },
    },
    features: { surfaces: ['chat'], streaming: true, resume: false },
    runtime: {
      createSession(session) {
        if (session.mode === 'global') requireOwner(session)
        else if (session.mode !== 'scoped') throw new Error('Unsupported Junie mode.')
        const disposed = new AbortController()
        session.lifecycle.add(() => disposed.abort())
        return {
          async run(input, run) {
            if (run.mode !== session.mode || !sameOwner(session.identity, run.identity) ||
              session.identity.sessionId !== run.identity.sessionId || session.identity.agentId !== run.identity.agentId) {
              throw new Error(ownerOnly)
            }
            const deadline = AbortSignal.timeout(Math.max(0, run.deadlineAt - Date.now()))
            const signal = AbortSignal.any([run.signal, session.signal, disposed.signal, deadline])
            signal.throwIfAborted()
            return executeTurn(input, run, resolve, signal)
          },
          dispose() { disposed.abort() },
        }
      },
    },
  }
}

export function apply(ctx) {
  const owner = { userId: ctx.identity.userId, profile: ctx.identity.profile }
  const manager = managedEngine(ctx.paths.dataDir)
  const disposeLogin = registerRpc(ctx, contract, 'native-login', async (_input, run) => {
    if (!sameOwner(owner, run.identity)) throw new Error(ownerOnly)
    run.signal.throwIfAborted()
    const { engine } = await manager.resolve()
    return { command: loginCommand(engine?.file) }
  })
  const registration = ctx.extensions.agents.register(createJunieAgent(owner, manager))
  return async () => { await Promise.all([registration.dispose(), disposeLogin()]) }
}

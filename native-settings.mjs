import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { Document, isMap, parseDocument } from 'yaml'
import { engineEnvironment } from './engine.mjs'

const limit = 1024 * 1024
const textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const queues = new Map()
const reserved = new Set(['__proto__', 'constructor', 'prototype'])
const editableConfig = ['model', 'effort', 'skill-default-locations', 'mcp-default-locations']
const mcpFields = ['command', 'args', 'env', 'url', 'headers', 'timeout']
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const json = value => JSON.stringify(value, null, 2) + '\n'
const revisionFor = content => content === null ? 'missing' : createHash('sha256').update(content).digest('hex')
const skillName = name => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64
  && !reserved.has(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)
const mcpName = name => /^[a-zA-Z0-9][a-zA-Z0-9_. -]{0,127}$/.test(name) && name.trim() === name && !reserved.has(name)

async function inspect(path) {
  try { return await lstat(path) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}

async function directory(path, create, recursive = false) {
  let entry = await inspect(path)
  if (!entry && create) {
    try { await mkdir(path, { mode: 0o700, recursive }) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
    entry = await inspect(path)
  }
  if (entry && !entry.isDirectory()) throw new Error('Junie configuration folders must be regular directories, without links.')
  return Boolean(entry)
}

async function readText(path) {
  const entry = await inspect(path)
  if (!entry) return null
  if (!entry.isFile() || entry.size > limit) throw new Error('Junie settings require regular files up to 1 MiB, without links.')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const current = await handle.stat()
    if (!current.isFile() || current.dev !== entry.dev || current.ino !== entry.ino || current.size > limit) {
      throw new Error('Junie settings file changed. Reload and retry.')
    }
    const bytes = await handle.readFile()
    if (bytes.length > limit) throw new Error('Junie settings file exceeds 1 MiB.')
    try { return textDecoder.decode(bytes) }
    catch { throw new Error('Junie settings must be valid UTF-8.') }
  } finally {
    await handle.close()
  }
}

function parseJson(text) {
  try {
    const value = JSON.parse(text.replace(/^\uFEFF/, ''))
    if (record(value)) return value
  } catch { /* Keep native JSON and credentials out of errors. */ }
  throw new Error('Expected a valid JSON object.')
}

function expected(expectedRevision, actual) {
  if (expectedRevision !== revisionFor(actual)) throw new Error('Junie settings changed. Reload before saving.')
}

function mutate(root, signal, callback) {
  const previous = queues.get(root) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(() => {
    signal.throwIfAborted()
    return callback()
  })
  queues.set(root, next)
  return next.finally(() => { if (queues.get(root) === next) queues.delete(root) })
}

function splitSkill(markdown) {
  const header = /^\uFEFF?---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(markdown)
  if (!header || header.index !== 0) return null
  try {
    const document = parseDocument(header[1])
    if (!document.errors.length && isMap(document.contents)) {
      return { header: header[0], document, meta: document.toJS({ maxAliasCount: 20 }), body: markdown.slice(header[0].length) }
    }
  } catch { /* Keep file contents out of errors. */ }
  return null
}

function validateSkill(markdown, name) {
  const parts = splitSkill(markdown)
  if (!parts) throw new Error('SKILL.md needs a valid YAML frontmatter header.')
  const { meta, body } = parts
  const described = typeof meta.description === 'string' && Boolean(meta.description.trim())
    || meta.description === undefined && body.split(/\r?\n/).some(line => /^[^#\s]/.test(line.trim()))
  if (meta.name !== name || !described) {
    throw new Error('The frontmatter name must match the folder, with a description or a body paragraph.')
  }
}

function skillFromFields(name, before, description, body) {
  const existing = before === null ? null : splitSkill(before)
  if (before !== null && (existing?.meta.name !== name ||
      (existing.meta.description !== undefined && typeof existing.meta.description !== 'string'))) {
    throw new Error('Edit the full SKILL.md to repair its original frontmatter.')
  }
  if (existing && (existing.meta.description ?? '') === description && /\r?\n$/.test(existing.header)) {
    return existing.header + body
  }
  const document = existing?.document ?? new Document({name})
  if (description.trim()) document.set('description', description)
  else document.delete('description')
  const lineEnd = before?.includes('\r\n') ? '\r\n' : '\n'
  const bom = before?.startsWith('\uFEFF') ? '\uFEFF' : ''
  const yaml = document.toString().replaceAll('\n', lineEnd)
  return bom + '---' + lineEnd + yaml + '---' + lineEnd + body
}

function validateConfig(value) {
  for (const [key, field] of Object.entries(value)) {
    if (!editableConfig.includes(key)) throw new Error('This Junie configuration field is outside the Studio editor.')
    if (key.endsWith('-locations') ? typeof field !== 'boolean' : typeof field !== 'string' || !/^[^\s\x00-\x1f]{1,256}$/.test(field)) {
      throw new Error('Expected a boolean discovery flag or a non-empty model or effort identifier.')
    }
  }
  return value
}

function mcpTransport(entry) {
  if (!record(entry) || Object.hasOwn(entry,'url') === Object.hasOwn(entry,'command')) return 'unknown'
  if (typeof entry.command === 'string' && entry.command.trim()) return 'stdio'
  if (typeof entry.url !== 'string' || /[\x00-\x20]/.test(entry.url)) return 'unknown'
  try {
    const url = new URL(entry.url)
    if (['http:','https:'].includes(url.protocol)) return 'http'
  } catch { /* Unknown native configuration stays on disk. */ }
  return 'unknown'
}

function applyMcpPatch(existing, patch) {
  if (Object.keys(patch).length === 0 || Object.keys(patch).some(key => !mcpFields.includes(key))) {
    throw new Error('Provide at least one supported MCP field.')
  }
  const entry = { ...existing }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete entry[key]
    else entry[key] = value
  }
  if (existing?.url && entry.url !== existing.url &&
      ((existing.headers && !Object.hasOwn(patch,'headers')) || existing.oauth)) {
    throw new Error('Replace or clear headers when changing a URL. Edit OAuth endpoint changes in Junie.')
  }
  if (existing?.command && entry.command !== existing.command &&
      ['env','args'].some(key => existing[key] && !Object.hasOwn(patch,key))) {
    throw new Error('Replace or clear env and args when changing an MCP command.')
  }
  const type = mcpTransport(entry)
  if (type === 'unknown') throw new Error('Use a command for stdio or an HTTP(S) URL for a remote MCP server.')
  if (type === 'stdio' && Object.hasOwn(entry,'headers')
      || type === 'http' && (Object.hasOwn(entry,'args') || Object.hasOwn(entry,'env'))) {
    throw new Error('MCP transport fields do not match. Use null to clear a field when switching transports.')
  }
  if (entry.args !== undefined && (!Array.isArray(entry.args) || !entry.args.every(arg => typeof arg === 'string' && !arg.includes('\0')))) {
    throw new Error('MCP args must be an array of strings.')
  }
  for (const values of [entry.env, entry.headers]) {
    if (values !== undefined && (!record(values) || Object.entries(values).some(([key,value]) =>
      !key || reserved.has(key) || /[=\0\r\n]/.test(key) || typeof value !== 'string' || value.includes('\0')))) {
      throw new Error('MCP env and headers must be objects with string values.')
    }
  }
  if (entry.timeout !== undefined && (!Number.isSafeInteger(entry.timeout) || entry.timeout < 1000 || entry.timeout > 3_600_000)) {
    throw new Error('MCP timeout must be between 1000 and 3600000 milliseconds.')
  }
  if (type === 'stdio' && entry.command.includes('\0')) throw new Error('Invalid MCP command.')
  return entry
}

export function nativeSettings(env = engineEnvironment()) {
  if (!env.JUNIE_HOME || !isAbsolute(env.JUNIE_HOME)) throw new Error('Set an absolute JUNIE_HOME to edit Junie user settings.')
  const root = resolve(env.JUNIE_HOME)
  const configEnabled = env.JUNIE_CONFIG_DEFAULT_LOCATIONS?.toLowerCase() !== 'false'
  const configParts = ['config.json']
  const mcpParts = ['mcp','mcp.json']
  const skillParts = name => {
    if (!skillName(name)) throw new Error('Use a lowercase skill folder name with letters, numbers and single hyphens.')
    return ['skills',name,'SKILL.md']
  }

  async function checkedPath(parts, create = false) {
    let path = root
    if (!await directory(path, create, true)) return join(path, ...parts)
    for (const segment of parts.slice(0,-1)) {
      path = join(path,segment)
      if (!await directory(path, create)) return join(root,...parts)
    }
    return join(path, parts.at(-1))
  }

  const read = async parts => readText(await checkedPath(parts))

  async function save(parts, previous, text, signal) {
    if (Buffer.byteLength(text) > limit) throw new Error('Junie settings exceed 1 MiB.')
    const path = await checkedPath(parts, true)
    const temp = join(dirname(path), '.' + basename(path) + '.studio-' + randomUUID())
    try {
      await writeFile(temp,text,{mode:0o600,flag:'wx',signal})
      expected(revisionFor(previous), await read(parts))
      signal.throwIfAborted()
      await rename(temp,path)
    } finally {
      await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }

  const configData = text => text === null ? {} : parseJson(text)
  const configView = (value, source) => ({
    path: join(root,...configParts), revision: revisionFor(source), enabled: configEnabled,
    content: json(validateConfig(Object.fromEntries(editableConfig.filter(key => Object.hasOwn(value,key)).map(key => [key,value[key]])))),
  })

  async function discovery(kind) {
    if (!configEnabled) return 'unknown'
    try {
      const value = configData(await read(configParts))[kind + '-default-locations']
      return value === false ? 'disabled' : value === undefined || value === true ? 'enabled' : 'unknown'
    } catch { return 'unknown' }
  }

  async function listSkills() {
    const path = await checkedPath(['skills'])
    const names = await directory(path,false) ? await readdir(path) : []
    const entries = []
    for (const name of names.filter(skillName).sort()) {
      const folder = await inspect(join(path,name))
      if (!folder) continue
      if (folder.isSymbolicLink()) entries.push({name,editable:false})
      else if (folder.isDirectory()) {
        const item = await inspect(join(path,name,'SKILL.md'))
        if (!item) continue
        if (!item.isFile() || item.size > limit) { entries.push({name,editable:false}); continue }
        try {
          const content = await read(skillParts(name))
          if (content === null) continue
          const description = splitSkill(content)?.meta.description
          entries.push({name,editable:true,...(typeof description === 'string' ? {description:description.slice(0,512)} : {})})
        } catch { entries.push({name,editable:false}) }
      }
    }
    return { path, discovery: await discovery('skill'), entries }
  }

  function skillView(name, content) {
    const parts = content === null ? null : splitSkill(content)
    const fields = parts?.meta.name === name &&
      (parts.meta.description === undefined || typeof parts.meta.description === 'string')
      ? { description: parts.meta.description ?? '', body: parts.body } : {}
    return { name, markdown:content ?? '', revision:revisionFor(content), ...fields }
  }
  const mcpData = text => {
    const value = text === null ? {} : parseJson(text)
    if (!Object.hasOwn(value,'mcpServers')) value.mcpServers = {}
    if (!record(value.mcpServers)) throw new Error('The Junie mcpServers field must be an object.')
    return value
  }
  async function mcpView(value, source) {
    const entries = Object.entries(value.mcpServers).filter(([name]) => mcpName(name)).sort(([a],[b]) => a.localeCompare(b))
      .map(([name,entry]) => ({
        name,
        transport:mcpTransport(entry),
        editable:record(entry),
        fields:record(entry) ? mcpFields.filter(key => Object.hasOwn(entry,key)) : [],
        ...(Number.isSafeInteger(entry?.timeout) ? { timeout:entry.timeout } : {}),
      }))
    return { path:join(root,...mcpParts), revision:revisionFor(source), discovery:await discovery('mcp'), entries }
  }

  function changeMcp({name, revision, patch}, signal) {
    if (!mcpName(name)) throw new Error('Enter a valid MCP server name.')
    return mutate(root,signal,async () => {
      const before = await read(mcpParts)
      expected(revision,before)
      const value = mcpData(before)
      const existing = Object.hasOwn(value.mcpServers,name) ? value.mcpServers[name] : undefined
      if (patch !== undefined) {
        if (existing !== undefined && !record(existing)) throw new Error('This existing MCP server has an unsupported format.')
        value.mcpServers[name] = applyMcpPatch(existing,parseJson(patch))
      } else {
        if (existing === undefined) throw new Error('MCP server no longer exists.')
        delete value.mcpServers[name]
      }
      const after = json(value)
      await save(mcpParts,before,after,signal)
      return mcpView(value,after)
    })
  }

  return {
    listSkills,
    async readSkill({name}) { return skillView(name,await read(skillParts(name))) },
    writeSkill({name,revision,markdown,description,body},signal) {
      const parts = skillParts(name)
      const raw = typeof markdown === 'string'
      if (raw ? description !== undefined || body !== undefined
        : typeof description !== 'string' || typeof body !== 'string') {
        throw new Error('Provide full SKILL.md or the description and Markdown body.')
      }
      if (raw) validateSkill(markdown,name)
      return mutate(root,signal,async () => {
        const before = await read(parts)
        expected(revision,before)
        const next = raw ? markdown : skillFromFields(name,before,description,body)
        if (!raw) validateSkill(next,name)
        await save(parts,before,next,signal)
        return skillView(name,next)
      })
    },
    removeSkill({name,revision},signal) {
      const parts = skillParts(name)
      return mutate(root,signal,async () => {
        const before = await read(parts)
        expected(revision,before)
        if (before === null) throw new Error('Skill no longer exists.')
        const path = await checkedPath(parts)
        signal.throwIfAborted()
        await unlink(path)
        return {ok:true}
      })
    },
    async listMcp() {
      const source = await read(mcpParts)
      return mcpView(mcpData(source),source)
    },
    writeMcp: changeMcp,
    removeMcp: changeMcp,
    async readConfig() {
      const source = await read(configParts)
      return configView(configData(source),source)
    },
    writeConfig({revision,content},signal) {
      if (!configEnabled) throw new Error('The Studio service disables default Junie config locations.')
      const patch = validateConfig(parseJson(content))
      return mutate(root,signal,async () => {
        const before = await read(configParts)
        expected(revision,before)
        const value = configData(before)
        for (const key of editableConfig) delete value[key]
        Object.assign(value,patch)
        const after = json(value)
        await save(configParts,before,after,signal)
        return configView(value,after)
      })
    },
  }
}

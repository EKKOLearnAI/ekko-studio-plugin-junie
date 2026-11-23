import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { engineEnvironment } from '../engine.mjs'
import { nativeSettings } from '../native-settings.mjs'
import { createScopedConfig } from '../scoped.mjs'

const signal = new AbortController().signal
const skill = (name, text = 'Example body.') => '---\nname: ' + name + '\ndescription: |\n  Example\nx-extra: yes\n---\n' + text + '\n'
const json = text => JSON.parse(text)
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'junie-native-settings-test-'))
  t.after(() => rm(dir,{recursive:true,force:true}))
  const root = join(dir,'junie-home')
  const env = engineEnvironment({ source: { JUNIE_HOME: root } })
  return {dir,root,env, settings:nativeSettings(env)}
}

test('effective Global native home is shared by the editor and ACP, and reads create no files', async t => {
  const {root,env,settings}=await setup(t)
  assert.equal(env.JUNIE_HOME,root)
  assert.equal((await settings.listSkills()).path,join(root,'skills'))
  assert.equal((await settings.listMcp()).path,join(root,'mcp','mcp.json'))
  assert.equal((await settings.readConfig()).path,join(root,'config.json'))
  assert.equal((await settings.readConfig()).revision,'missing')
  await assert.rejects(access(root),{code:'ENOENT'})
  assert.throws(() => nativeSettings({ JUNIE_HOME:'relative-path' }),/absolute/)
})

test('creates and updates Skill markdown, detects stale writes and retains auxiliary files on removal', async t => {
  const {root,settings}=await setup(t)
  const name='native-proof'
  const first=await settings.writeSkill({name,revision:'missing',markdown:skill(name)},signal)
  const folder=join(root,'skills',name)
  await writeFile(join(folder,'notes.md'),'retained')
  assert.deepEqual((await settings.listSkills()).entries,[{name,editable:true,description:'Example\n'}])
  assert.equal((await settings.readSkill({name})).markdown,skill(name))
  await assert.rejects(settings.writeSkill({name,revision:'missing',markdown:skill(name)},signal),/changed/)
  const after=await settings.writeSkill({name,revision:first.revision,markdown:skill(name,'New body.')},signal)
  await assert.rejects(settings.removeSkill({name,revision:first.revision},signal),/changed/)
  assert.deepEqual(await settings.removeSkill({name,revision:after.revision},signal),{ok:true})
  assert.equal(await readFile(join(folder,'notes.md'),'utf8'),'retained')
  assert.deepEqual((await settings.listSkills()).entries,[])
  await assert.rejects(async () => settings.writeSkill({name,revision:'missing',markdown:skill('wrong')},signal),/must match/)
  await assert.rejects(settings.readSkill({name:'../outside'}),/lowercase/)
  const optionalDescription='---\nname: '+name+'\n---\nParagraph without an explicit description.\n'
  assert.equal((await settings.writeSkill({name,revision:'missing',markdown:optionalDescription},signal)).markdown,optionalDescription)
})

test('structured Skill editing preserves other native frontmatter and leaves raw repair available', async t => {
  const {settings}=await setup(t)
  const name='native-fields'
  const first=await settings.writeSkill({name,revision:'missing',markdown:skill(name)},signal)
  assert.equal(first.description,'Example\n')
  assert.equal(first.body,'Example body.\n')
  const bodyOnly=await settings.writeSkill({name,revision:first.revision,description:first.description,body:'Fresh body.\n'},signal)
  assert.equal(bodyOnly.markdown,skill(name,'Fresh body.'))
  const revised=await settings.writeSkill({name,revision:bodyOnly.revision,description:'Updates docs: only when asked',body:''},signal)
  assert.match(revised.markdown,/x-extra: yes/)
  assert.equal(revised.description,'Updates docs: only when asked')
  const fallback=await settings.writeSkill({name,revision:revised.revision,description:'',body:'Fallback paragraph.\n'},signal)
  assert.doesNotMatch(fallback.markdown,/description:/)
  assert.match(fallback.markdown,/x-extra: yes/)
  assert.throws(()=>settings.writeSkill({name,revision:fallback.revision,description:'Missing body'},signal),/description and Markdown body/)

  const second='generated-skill'
  const created=await settings.writeSkill({name:second,revision:'missing',description:'Fresh Skill',body:'Use it for fixtures.'},signal)
  assert.match(created.markdown,/^---\nname: generated-skill\ndescription: Fresh Skill\n---\n/)
})

test('keeps linked Skill and MCP locations out of the writable scope',{skip:process.platform==='win32'},async t=>{
  const {dir,root,settings}=await setup(t)
  const outside=join(dir,'outside')
  await mkdir(join(root,'skills'),{recursive:true})
  await mkdir(outside)
  await writeFile(join(outside,'SKILL.md'),skill('external'))
  await writeFile(join(outside,'mcp.json'),'{"mcpServers":{}}')
  await symlink(outside,join(root,'skills','external'))
  await symlink(outside,join(root,'mcp'))
  assert.deepEqual((await settings.listSkills()).entries,[{name:'external',editable:false}])
  await assert.rejects(settings.readSkill({name:'external'}),/without links/)
  await assert.rejects(settings.writeSkill({name:'external',revision:'missing',markdown:skill('external')},signal),/without links/)
  await assert.rejects(settings.listMcp(),/without links/)
  assert.equal(await readFile(join(outside,'SKILL.md'),'utf8'),skill('external'))
  assert.equal(await readFile(join(outside,'mcp.json'),'utf8'),'{"mcpServers":{}}')
})

test('edits native MCP definitions without returning credentials or overwriting unrelated rows',async t=>{
  const {root,settings}=await setup(t)
  const dir=join(root,'mcp')
  await mkdir(dir,{recursive:true})
  const file=join(dir,'mcp.json')
  const data={ other:'retain',mcpServers:{ protected:{
    url:'https://example.test/secret-path',
    headers:{Authorization:'secret-header'}, oauth:{custom:'secret-oauth'},
  }, untouched:{command:'tool',env:{PASSWORD:'secret-environment'},args:['--access','secret-arg']} } }
  await writeFile(file,JSON.stringify(data))
  const original=await settings.listMcp()
  assert.doesNotMatch(JSON.stringify(original),/secret/)
  assert.deepEqual(original.entries.map(({transport,fields,editable})=>({transport,fields,editable})),[
    {transport:'http',fields:['url','headers'],editable:true},
    {transport:'stdio',fields:['command','args','env'],editable:true},
  ])
  const modified=await settings.writeMcp({name:'protected',revision:original.revision,patch:'{"timeout":19000}'},signal)
  await assert.rejects(settings.writeMcp({name:'protected',revision:modified.revision,patch:'{"url":"https://wrong.test"}'},signal),/OAuth/)
  await assert.rejects(settings.writeMcp({name:'untouched',revision:modified.revision,patch:'{"command":"different"}'},signal),/clear env and args/)
  const after=json(await readFile(file,'utf8'))
  assert.equal(after.other,'retain')
  assert.deepEqual(after.mcpServers.protected,{...data.mcpServers.protected,timeout:19000})
  assert.deepEqual(after.mcpServers.untouched,data.mcpServers.untouched)
  const input={name:'new-stdio',revision:modified.revision,patch:'{"command":"node","args":["tool.mjs"]}'}
  const attempts=await Promise.allSettled([settings.writeMcp(input,signal),settings.writeMcp({...input,name:'other-server'},signal)])
  assert.deepEqual(attempts.map(result=>result.status),['fulfilled','rejected'])
  assert.match(attempts[1].reason.message,/changed/)
  const added=attempts[0].value
  assert.ok(added.entries.some(item=>item.name==='new-stdio'&&item.transport==='stdio'))
  await assert.rejects(settings.removeMcp({name:'protected',revision:modified.revision},signal),/changed/)
  const removed=await settings.removeMcp({name:'new-stdio',revision:added.revision},signal)
  assert.equal(removed.entries.length,2)
  await assert.rejects(settings.writeMcp({name:'new-stdio',revision:removed.revision,patch:'{"command":"node","timeout":99}'},signal),/milliseconds/)
  await assert.rejects(settings.writeMcp({name:'bad-url',revision:removed.revision,
    patch:'{"url":["https://example.test"]}'},signal),/HTTP/)
  await writeFile(file,'{"api_key":"SENSITIVE')
  await assert.rejects(settings.listMcp(),error=>error.message==='Expected a valid JSON object.')
})

test('an unsupported MCP entry can be listed and removed without disclosing its content',async t=>{
  const {root,settings}=await setup(t)
  await mkdir(join(root,'mcp'),{recursive:true})
  await writeFile(join(root,'mcp','mcp.json'),JSON.stringify({mcpServers:{malformed:'PRIVATE_VALUE'}}))
  const view=await settings.listMcp()
  assert.deepEqual(view.entries,[{name:'malformed',transport:'unknown',fields:[],editable:false,preview:{}}])
  assert.doesNotMatch(JSON.stringify(view),/PRIVATE_VALUE/)
  await assert.rejects(settings.writeMcp({name:'malformed',revision:view.revision,patch:'{"command":"node"}'},signal),/unsupported/)
  const removed=await settings.removeMcp({name:'malformed',revision:view.revision},signal)
  assert.deepEqual(removed.entries,[])
})

test('MCP preview shows ordinary launch metadata without exposing connection values',async t=>{
  const {root,settings}=await setup(t)
  await mkdir(join(root,'mcp'),{recursive:true})
  const mcpServers = {
    reference:{command:'node',args:['fixture.js','--port','8080'],timeout:18000},
    protected:{command:'C:\\PROTECTED_DIRECTORY\\node.exe',
      args:['C:\\PROTECTED_DIRECTORY\\fixture.js','--token','PRIVATE_TOKEN.js','--stdio'],
      env:{PASSWORD:'PRIVATE_ENV'}},
    inline:{command:'node',args:['-e','PRIVATE_SCRIPT.js']},
    laterFlag:{command:'node',args:['--opaque/PRIVATE_FLAG.js','fixture.js']},
    shell:{command:'sh',args:['-c','PRIVATE_SHELL.js']},
    package:{command:'npx',args:['-y','@upstash/context7-mcp','--api-key=PRIVATE_API_KEY']},
    many:{command:'node',args:['fixture.js',...Array.from({length:22},()=> 'PRIVATE_POSITIONAL')]},
    remote:{url:'https://USER_VALUE:PRIVATE_PASSWORD@localhost:8888/PRIVATE_PATH?api_key=PRIVATE_QUERY#PRIVATE_FRAGMENT',
      headers:{Authorization:'PRIVATE_HEADER'},oauth:{clientSecret:'PRIVATE_OAUTH'}},
  }
  await writeFile(join(root,'mcp','mcp.json'),JSON.stringify({mcpServers}))
  const {entries} = await settings.listMcp()
  const rows = Object.fromEntries(entries.map(x=>[x.name,x.preview]))
  assert.deepEqual(rows.reference,{command:'node',args:['fixture.js','--port','8080']})
  assert.deepEqual(rows.protected,{command:'node.exe',args:['fixture.js','','','']})
  assert.deepEqual(rows.inline,{command:'node',args:['','']})
  assert.deepEqual(rows.laterFlag,{command:'node',args:['','']})
  assert.deepEqual(rows.shell,{command:'sh',args:['','']})
  assert.deepEqual(rows.package,{command:'npx',args:['-y','@upstash/context7-mcp','']})
  assert.equal(rows.many.args.length,20)
  assert.equal(rows.many.remainingArgs,3)
  assert.deepEqual(rows.remote,{url:'https://localhost:8888'})
  assert.doesNotMatch(JSON.stringify(entries),/PRIVATE_|PROTECTED_DIRECTORY|USER_VALUE/)
})

test('MCP argument preview exposes validated options while keeping secret or ambiguous values concealed',async t=>{
  const {root,settings}=await setup(t)
  await mkdir(join(root,'mcp'),{recursive:true})
  const cases = {
    ordinary:[
      ['fixture.js','--port=8080','--host','127.0.0.1','--transport','stdio','--log-level=info','--verbose'],
      ['fixture.js','--port=8080','--host','127.0.0.1','--transport','stdio','--log-level=info','--verbose'],
    ],
    directory:[
      ['fixture.js','--cwd','/private/DIRECTORY','--directory=/private/INLINE','--port','9090'],
      ['fixture.js','--cwd','','','--port','9090'],
    ],
    sensitiveBeforePort:[
      ['fixture.js','--token','--port=65432','--port','8080'],
      ['fixture.js','','','',''],
    ],
    sensitiveAfterPort:[
      ['fixture.js','--port','8080','--api-key=PRIVATE_API_KEY','--log-level','info'],
      ['fixture.js','--port','8080','','',''],
    ],
    inlineCode:[
      ['-e','PRIVATE_INLINE_CODE','--port','8080'],
      ['','','',''],
    ],
    invalidPort:[
      ['fixture.js','--port=PRIVATE_PORT','--transport','stdio'],
      ['fixture.js','','',''],
    ],
    outOfRange:[
      ['fixture.js','--port','65536'],
      ['fixture.js','--port',''],
    ],
    missingValue:[
      ['fixture.js','--port','--transport','stdio'],
      ['fixture.js','--port','',''],
    ],
    arbitraryPositional:[
      ['fixture.js','65432','--port','8080'],
      ['fixture.js','','',''],
    ],
  }
  const mcpServers = Object.fromEntries(Object.entries(cases).map(([name,[args]])=>[name,{command:'node',args}]))
  await writeFile(join(root,'mcp','mcp.json'),JSON.stringify({mcpServers}))
  const {entries} = await settings.listMcp()
  for (const {name,preview} of entries) assert.deepEqual(preview.args,cases[name][1],name)
  assert.doesNotMatch(JSON.stringify(entries),/PRIVATE_|\/private\/|65432|65536/)
})

test('toggles one MCP using the same enabled field as Junie CLI and preserves connection data',async t=>{
  const {root,settings}=await setup(t)
  const file=join(root,'mcp','mcp.json')
  const initial={command:'node',args:['fixture.js'],env:{PASSWORD:'PRIVATE_VALUE'},timeout:99}
  const sibling={url:'https://example.test/mcp',enabled:false}
  await mkdir(join(root,'mcp'),{recursive:true})
  await writeFile(file, JSON.stringify({mcpServers:{reference:initial,sibling}}))
  const first=await settings.listMcp()
  const disabled=await settings.writeMcp({name:'reference',revision:first.revision,patch:'{"enabled":false}'},signal)
  assert.equal(first.entries[0].enabled,true)
  assert.equal(disabled.entries[0].enabled,false)
  assert.deepEqual(json(await readFile(file,'utf8')).mcpServers.reference,{...initial,enabled:false})
  await assert.rejects(settings.writeMcp({name:'reference',revision:first.revision,patch:'{"enabled":true}'},signal),/changed/)
  await assert.rejects(settings.writeMcp({name:'reference',revision:disabled.revision,patch:'{"enabled":"false"}'},signal),/boolean/)
  const restored=await settings.writeMcp({name:'reference',revision:disabled.revision,patch:'{"enabled":true}'},signal)
  assert.equal(restored.entries[0].enabled,true)
  assert.deepEqual(json(await readFile(file,'utf8')).mcpServers,{reference:initial,sibling})
})

test('edits the supported native config projection and reports Global discovery',async t=>{
  const {root,env,settings}=await setup(t)
  await mkdir(root,{recursive:true})
  const path=join(root,'config.json')
  const unrelated={ byok:{openai:'secret'},hooks:{OnStop:[]},'mcp-locations':['outside'] }
  const initial={...unrelated,model:'old','skill-default-locations':true}
  await writeFile(path,JSON.stringify(initial))
  const view=await settings.readConfig()
  assert.deepEqual(json(view.content),{model:'old','skill-default-locations':true})
  assert.doesNotMatch(view.content,/secret|hooks|outside/)
  assert.equal((await settings.listSkills()).discovery,'enabled')
  const edited={model:'custom:my-model',effort:'high','skill-default-locations':false,'mcp-default-locations':false}
  await settings.writeConfig({revision:view.revision,content:JSON.stringify(edited)},signal)
  assert.deepEqual(json(await readFile(path,'utf8')),{...unrelated,...edited})
  assert.equal((await settings.listSkills()).discovery,'disabled')
  assert.equal((await settings.listMcp()).discovery,'disabled')
  await assert.rejects(settings.writeConfig({revision:view.revision,content:'{}'},signal),/changed/)
  assert.throws(()=>settings.writeConfig({revision:'missing',content:'{"hooks":{}}'},signal),/outside/)
  const disabled=nativeSettings({...env,JUNIE_CONFIG_DEFAULT_LOCATIONS:'false'})
  assert.equal((await disabled.readConfig()).enabled,false)
  assert.equal((await disabled.listSkills()).discovery,'unknown')
  assert.throws(()=>disabled.writeConfig({revision:view.revision,content:'{}'},signal),/disables/)
})

test('Scoped launch settings keep native discovery and config isolated from user files',async t=>{
  const {root,dir,settings}=await setup(t)
  const saved=await settings.writeConfig({revision:'missing',content:'{"model":"custom:global-profile"}'},signal)
  const scoped=await createScopedConfig({baseUrl:'http://127.0.0.1:9',model:'scoped',token:'lease',
    apiMode:'chat_completions',contextWindow:null,outputLimit:null},join(dir,'runtime'),signal)
  t.after(scoped.dispose)
  assert.notEqual(scoped.env.JUNIE_HOME,root)
  const native=json(await readFile(join(scoped.env.JUNIE_HOME,'studio.json'),'utf8'))
  assert.equal(native['skill-default-locations'],false)
  assert.equal(native['mcp-default-locations'],false)
  const argIndex=scoped.args.indexOf('--config-default-locations')
  assert.equal(scoped.args[argIndex+1],'false')
  assert.equal((await settings.readConfig()).revision,saved.revision)
})

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderSurface } from 'claude-code'

import type { LabGroup, LabResult } from '../types'

export const PLUGIN = 'mods-lab'
export const PANE = 'mods-lab'
export const SCRATCH_PANE = 'mods-lab-scratch'
export const ECHO_TOOL = 'echo'
export const ECHO_TOOL_ID = `mcp__${PLUGIN}__${ECHO_TOOL}`
export const COMMAND = 'lab'
export const ECHO_SPEC = {
  name: ECHO_TOOL,
  description: 'Echoes the given text back. Exists so the mods-lab mod can check that the model can call a mod tool.',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  isDeferred: false,
}
export const COMMAND_SPEC = {
  name: COMMAND,
  description: 'Open the mods lab pane; "/lab run" runs every probe and prints the results',
  argumentHint: '[run]',
}

const counter = atom({ plugin: 'mods-lab', key: 'counter' } as const, 0)

export type ProbeContext = { surface?: RenderSurface }
export type Outcome = { ok: boolean; detail: string } | { waiting: string }

export type ActiveProbe = {
  kind: 'active'
  id: ActiveId
  group: LabGroup
  title: string
  skip?: 'costs tokens' | 'needs you'
}
export type PassiveProbe = { kind: 'passive'; id: string; group: LabGroup; title: string; hint: string }
export type Probe = ActiveProbe | PassiveProbe

export const GROUPS = [
  { id: 'ui', label: 'UI', hotkey: '1' },
  { id: 'data', label: 'Data', hotkey: '2' },
  { id: 'session', label: 'Session', hotkey: '3' },
  { id: 'model', label: 'Model', hotkey: '4' },
  { id: 'prompt', label: 'Prompt', hotkey: '5' },
  { id: 'tools', label: 'Tools', hotkey: '6' },
  { id: 'commands', label: 'Cmds', hotkey: '7' },
  { id: 'clock', label: 'Clock', hotkey: '8' },
  { id: 'hooks', label: 'Hooks', hotkey: '9' },
] as const satisfies readonly { id: LabGroup; label: string; hotkey: string }[]

export const IDLE: LabResult = { status: 'idle', detail: '', ms: null }

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error) ?? String(error)
}

function pass(detail: string): Outcome {
  return { ok: true, detail }
}

function fail(detail: string): Outcome {
  return { ok: false, detail }
}

function check(ok: boolean, detail: string): Outcome {
  return { ok, detail }
}

function passive(id: string, title: string, hint: string): PassiveProbe {
  return { kind: 'passive', id, group: 'hooks', title, hint }
}

async function storeRoundtrip($: EngineInterface): Promise<Outcome> {
  const key = 'probe-roundtrip'
  const value = { at: await $.clock.now(), tag: 'mods-lab' }
  await $.store.set(key, value)
  const got = await $.store.get(key)
  await $.store.delete(key)
  const after = await $.store.get(key)
  const isSame = JSON.stringify(got) === JSON.stringify(value)
  return check(isSame && after === undefined, `set+get ${isSame ? 'equal' : 'differ'}, after delete ${JSON.stringify(after) ?? 'undefined'}`)
}

async function stateUpdate($: EngineInterface): Promise<Outcome> {
  const before = await read($, counter)
  await update($, counter, n => n + 1)
  const after = await read($, counter)
  return check(after === before + 1, `counter ${before} -> ${after}`)
}

async function fsList($: EngineInterface): Promise<Outcome> {
  const cwd = await $.session.cwd()
  const entries = await $.fs.list(cwd)
  const dirs = entries.filter(x => x.kind === 'dir').length
  return pass(`${entries.length} entries in cwd (${dirs} dirs)`)
}

async function fsRead($: EngineInterface): Promise<Outcome> {
  const path = `${$.plugin.root}/.claude-plugin/plugin.json`
  const text = await $.fs.read(path)
  const name = (JSON.parse(text) as { name?: unknown }).name
  return check(name === PLUGIN, `read own plugin.json, ${text.length} chars, name=${String(name)}`)
}

async function processRun($: EngineInterface): Promise<Outcome> {
  const ran = await $.process.run(['echo', 'mods-lab'], { timeoutMs: 5000 })
  const out = ran.stdout.trim()
  return check(ran.exitCode === 0 && out === 'mods-lab', `exit ${ran.exitCode}, stdout "${out}"`)
}

async function envGet($: EngineInterface): Promise<Outcome> {
  const home = await $.env.get('HOME')
  return check(home !== undefined && home.length > 0, `HOME=${home ?? 'undefined'}`)
}

async function settingsRead($: EngineInterface): Promise<Outcome> {
  const merged = await $.settings.read()
  const keys = Object.keys(merged)
  return pass(`${keys.length} top-level keys${keys.length > 0 ? `: ${keys.slice(0, 4).join(', ')}` : ''}`)
}

async function httpFetch($: EngineInterface): Promise<Outcome> {
  const res = await $.http.fetch('https://example.com')
  const hasTitle = res.text.includes('Example Domain')
  return check(res.ok && hasTitle, `status ${res.status}, ${res.text.length} chars${hasTitle ? ', has "Example Domain"' : ''}`)
}

async function sessionUsage($: EngineInterface): Promise<Outcome> {
  const usage = await $.session.usage()
  const pct = usage.context.percent
  const cost = usage.cost?.usd
  return pass(
    `context ${pct === undefined ? 'n/a' : `${Math.round(pct)}%`} of ${usage.context.window}, cost ${cost === undefined ? 'n/a' : `$${cost.toFixed(3)}`}`,
  )
}

async function sessionVersion($: EngineInterface): Promise<Outcome> {
  const v = await $.session.version()
  return check(v.version.length > 0, `version ${v.version}${v.base === undefined ? '' : `, base ${v.base}`}`)
}

async function sessionMessages($: EngineInterface): Promise<Outcome> {
  const rows = await $.session.messages()
  const tools = rows.reduce((n, r) => n + r.toolUses.length, 0)
  return pass(`${rows.length} messages, ${tools} tool uses`)
}

async function sessionAppend($: EngineInterface): Promise<Outcome> {
  const row = await $.session.append({
    message: { type: 'system', content: [{ type: 'text', text: 'mods-lab: session.append probe (a notice the model never reads)' }] },
  })
  return row.deny === undefined ? pass(`appended notice ${row.uuid}`) : fail(`denied: ${row.deny}`)
}

async function modelComplete($: EngineInterface): Promise<Outcome> {
  const r = await $.model.complete({
    model: 'haiku',
    prompt: 'Reply with the single word: pong',
    maxTokens: 10,
    timeoutMs: 20000,
  })
  if (!r.isAnswered) return fail(`not answered: ${r.reason}${r.reason === 'api-error' ? ` (status ${r.status ?? 'none'})` : ''}`)
  return pass(`"${r.text.trim()}", ${r.usage.input_tokens} in / ${r.usage.output_tokens} out tokens`)
}

async function promptFill($: EngineInterface): Promise<Outcome> {
  const r = await $.prompt.fill({ text: 'mods-lab was here ', mode: 'insert' })
  return check(r.isFilled, r.isFilled ? `draft now ${r.text.length} chars, cursor ${r.cursor}` : `refused: ${r.refusal ?? 'no reason'}`)
}

async function promptRead($: EngineInterface): Promise<Outcome> {
  const box = await $.prompt.read()
  return pass(`draft ${box.text.length} chars, cursor ${box.cursor}`)
}

async function toolRegister($: EngineInterface): Promise<Outcome> {
  await $.tool.register(ECHO_SPEC)
  const tools = await $.tool.list()
  const isListed = tools.some(t => t.name === ECHO_TOOL_ID)
  return check(isListed, isListed ? `${ECHO_TOOL_ID} is listed` : `${ECHO_TOOL_ID} missing from tool.list`)
}

async function toolSelfCall($: EngineInterface): Promise<Outcome> {
  const r = await $.tool.call({ tool: ECHO_TOOL_ID, text: 'ping' })
  if (r.deny !== undefined) return fail(`denied: ${r.deny}`)
  if (r.isError === true) return fail(`errored: ${r.text ?? JSON.stringify(r.result)}`)
  return check(r.result === 'echo: ping', `answered ${JSON.stringify(r.result)}`)
}

async function toolList($: EngineInterface): Promise<Outcome> {
  const tools = await $.tool.list()
  const mcp = tools.filter(t => t.mcp).length
  return check(tools.length > 0, `${tools.length} tools, ${mcp} mcp`)
}

async function commandRegister($: EngineInterface): Promise<Outcome> {
  const value = await $.command.register(COMMAND_SPEC)
  return pass(`registered /${COMMAND}: ${JSON.stringify(value) ?? 'undefined'}`)
}

async function commandList($: EngineInterface): Promise<Outcome> {
  const commands = await $.command.list()
  const mine = commands.filter(c => c.plugin === PLUGIN || c.name === COMMAND || c.name.endsWith(`:${COMMAND}`))
  return check(mine.length > 0, `${commands.length} commands; mine: ${mine.map(c => `/${c.name}`).join(', ') || 'none'}`)
}

async function clockAfter($: EngineInterface): Promise<Outcome> {
  const startedAt = await $.clock.now()
  await new Promise<void>(resolve => {
    $.clock.after(50, resolve)
  })
  const waited = (await $.clock.now()) - startedAt
  return check(waited >= 50, `fired after ${waited}ms (asked 50)`)
}

async function paneOpenClose($: EngineInterface): Promise<Outcome> {
  const opened = await $.ui.open({ id: SCRATCH_PANE, title: 'mods-lab scratch' })
  if (!opened.isPlaced) return fail(`open not placed: ${opened.reason}`)
  const whileOpen = (await $.ui.panes()).some(p => p.id === SCRATCH_PANE)
  await $.ui.close({ id: SCRATCH_PANE })
  const afterClose = (await $.ui.panes()).some(p => p.id === SCRATCH_PANE)
  return check(whileOpen && !afterClose, `listed while open: ${whileOpen}, listed after close: ${afterClose}`)
}

async function notify($: EngineInterface): Promise<Outcome> {
  const r = await $.ui.notify('mods-lab: notify probe', { title: 'mods-lab' })
  return r.isSent ? pass(`sent via ${r.channel}`) : fail(`not sent: ${r.reason}`)
}

async function copy($: EngineInterface, ctx: ProbeContext): Promise<Outcome> {
  const r = await $.ui.copy(ctx.surface === undefined ? { text: 'mods-lab copy probe' } : { text: 'mods-lab copy probe', surface: ctx.surface })
  return r.isCopied ? pass('copied "mods-lab copy probe" to the clipboard') : fail(`not copied: ${r.reason}`)
}

const ACTIVE = [
  ['ui.toast', 'ui', 'ui.toast'],
  ['ui.status', 'ui', 'ui.status'],
  ['ui.log', 'ui', 'ui.log'],
  ['ui.notice', 'ui', 'ui.notice (next tool call)', 'needs you'],
  ['ui.notify', 'ui', 'ui.notify'],
  ['ui.copy', 'ui', 'ui.copy'],
  ['ui.pane', 'ui', 'ui.open + ui.close a second pane'],
  ['ui.band', 'ui', 'band (AbovePrompt render)', 'needs you'],
  ['data.store', 'data', 'store set/get/delete'],
  ['data.state', 'data', 'state update'],
  ['data.fs.list', 'data', 'fs.list cwd'],
  ['data.fs.read', 'data', 'fs.read own manifest'],
  ['data.process', 'data', 'process.run echo'],
  ['data.env', 'data', 'env.get HOME'],
  ['data.settings', 'data', 'settings.read'],
  ['data.http', 'data', 'http.fetch example.com'],
  ['session.cwd', 'session', 'session.cwd'],
  ['session.usage', 'session', 'session.usage'],
  ['session.version', 'session', 'session.version'],
  ['session.messages', 'session', 'session.messages'],
  ['session.model', 'session', 'session.model'],
  ['session.id', 'session', 'session.id'],
  ['session.turns', 'session', 'session.turns'],
  ['session.append', 'session', 'session.append notice'],
  ['model.complete', 'model', 'model.complete haiku (costs tokens)', 'costs tokens'],
  ['prompt.fill', 'prompt', 'prompt.fill insert'],
  ['prompt.read', 'prompt', 'prompt.read'],
  ['tools.register', 'tools', 'tool.register echo'],
  ['tools.call', 'tools', 'tool.call echo from the mod'],
  ['tools.list', 'tools', 'tool.list'],
  ['commands.register', 'commands', 'command.register /lab'],
  ['commands.list', 'commands', 'command.list'],
  ['clock.after', 'clock', 'clock.after 50ms'],
] as const satisfies readonly (readonly [string, LabGroup, string, ActiveProbe['skip']?])[]

export type ActiveId = (typeof ACTIVE)[number][0]

export const PROBES: readonly Probe[] = [
  ...ACTIVE.map(([id, group, title, skip]): ActiveProbe =>
    skip === undefined ? { kind: 'active', id, group, title } : { kind: 'active', id, group, title, skip },
  ),
  passive('hooks.tool.call', 'tool.call observed', 'any tool call'),
  passive('hooks.echo', 'echo tool answered', `the model calling ${ECHO_TOOL_ID}`),
  passive('hooks.prompt.submit', 'prompt.submit observed', 'you sending a prompt'),
  passive('hooks.turn.complete', 'turn.complete observed', 'a turn ending'),
  passive('hooks.session.append', 'session.append observed', 'a row added to the conversation'),
]

export async function execute($: EngineInterface, id: ActiveId, ctx: ProbeContext): Promise<Outcome> {
  switch (id) {
    case 'ui.toast':
      $.ui.toast('mods-lab: toast probe')
      return pass('raised; look for it on the notification bar')
    case 'ui.status':
      $.ui.status('mods-lab: status probe')
      return pass('set; look at the status line')
    case 'ui.log':
      $.ui.log('mods-lab: log probe', { to: 'transcript' })
      return pass('logged to the transcript')
    case 'ui.notice':
      return { waiting: 'armed: the next tool call gets a notice line under its permission dialog' }
    case 'ui.notify':
      return notify($)
    case 'ui.copy':
      return copy($, ctx)
    case 'ui.pane':
      return paneOpenClose($)
    case 'ui.band':
      return { waiting: 'band shown above the prompt: press its "band ok" button' }
    case 'data.store':
      return storeRoundtrip($)
    case 'data.state':
      return stateUpdate($)
    case 'data.fs.list':
      return fsList($)
    case 'data.fs.read':
      return fsRead($)
    case 'data.process':
      return processRun($)
    case 'data.env':
      return envGet($)
    case 'data.settings':
      return settingsRead($)
    case 'data.http':
      return httpFetch($)
    case 'session.cwd':
      return pass(await $.session.cwd())
    case 'session.usage':
      return sessionUsage($)
    case 'session.version':
      return sessionVersion($)
    case 'session.messages':
      return sessionMessages($)
    case 'session.model':
      return pass(await $.session.model())
    case 'session.id':
      return pass(await $.session.id())
    case 'session.turns':
      return pass(`${await $.session.turns()} turns`)
    case 'session.append':
      return sessionAppend($)
    case 'model.complete':
      return modelComplete($)
    case 'prompt.fill':
      return promptFill($)
    case 'prompt.read':
      return promptRead($)
    case 'tools.register':
      return toolRegister($)
    case 'tools.call':
      return toolSelfCall($)
    case 'tools.list':
      return toolList($)
    case 'commands.register':
      return commandRegister($)
    case 'commands.list':
      return commandList($)
    case 'clock.after':
      return clockAfter($)
  }
}

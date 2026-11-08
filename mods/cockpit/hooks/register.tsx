import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { CallRec, CallStatus, FileRec, Lifetime, Tab, TurnRec } from '../types'
import {
  Heading,
  Meter,
  Rule,
  Spark,
  Stat,
  Tabs,
  clip,
  duration,
  levelTone,
  tone,
  usd,
} from './kit'
import type { Kit } from './kit'

const PANE = 'cockpit'
const TITLE = 'Cockpit'
const LIFETIME_KEY = 'lifetime'
const LONG_TURN_MS = 90_000

const calls = atom({ plugin: 'cockpit', key: 'calls' } as const, [], { shape: 'calls-1' })
const turns = atom({ plugin: 'cockpit', key: 'turns' } as const, [], { shape: 'turns-1' })
const files = atom({ plugin: 'cockpit', key: 'files' } as const, [], { shape: 'files-1' })
const tab = atom({ plugin: 'cockpit', key: 'tab' } as const, 'overview')
const isBandHidden = atom({ plugin: 'cockpit', key: 'isBandHidden' } as const, false)

const TABS = [
  { id: 'overview', label: 'Overview', hotkey: '1' },
  { id: 'tools', label: 'Tools', hotkey: '2' },
  { id: 'files', label: 'Files', hotkey: '3' },
] as const satisfies readonly { id: Tab; label: string; hotkey: string }[]

const STATUS_GLYPH: Record<CallStatus, { glyph: string; tone: keyof typeof tone }> = {
  running: { glyph: '◐', tone: 'warn' },
  ok: { glyph: '✓', tone: 'ok' },
  error: { glyph: '✗', tone: 'bad' },
  denied: { glyph: '⊘', tone: 'muted' },
}

const READS = new Set(['Read', 'Grep', 'Glob'])
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function labelOf(input: Record<string, unknown>): string {
  for (const field of ['command', 'file_path', 'pattern', 'url', 'query', 'description', 'prompt']) {
    const v = input[field]
    if (typeof v === 'string' && v.length > 0) return v.replace(/\s+/g, ' ')
  }
  return ''
}

function shortPath(path: string, cwd: string): string {
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path
}

async function loadLifetime($: EngineInterface): Promise<Lifetime> {
  const stored = await $.store.get(LIFETIME_KEY)
  const v = (stored ?? {}) as Partial<Lifetime>
  return { sessions: v.sessions ?? 0, turns: v.turns ?? 0, toolCalls: v.toolCalls ?? 0 }
}

let lifetimeWrites: Promise<void> = Promise.resolve()

function bumpLifetime($: EngineInterface, delta: Partial<Lifetime>): Promise<void> {
  lifetimeWrites = lifetimeWrites.then(() => writeLifetime($, delta)).catch(() => undefined)
  return lifetimeWrites
}

async function writeLifetime($: EngineInterface, delta: Partial<Lifetime>): Promise<void> {
  const now = await loadLifetime($)
  await $.store.set(LIFETIME_KEY, {
    sessions: now.sessions + (delta.sessions ?? 0),
    turns: now.turns + (delta.turns ?? 0),
    toolCalls: now.toolCalls + (delta.toolCalls ?? 0),
  })
}

function overview(ui: Kit, w: number, list: TurnRec[], callList: CallRec[]): RenderElement {
  const last = list.at(-1)
  const ctx = list.map(t => t.ctxPct ?? 0)
  const secs = list.map(t => t.ms / 1000)
  const running = callList.filter(c => c.status === 'running').length
  const failed = callList.filter(c => c.status === 'error').length
  const meterW = Math.max(6, w - 16)
  const totalMs = list.reduce((sum, t) => sum + t.ms, 0)

  return (
    <ui.Box flexDirection="column" gap={1}>
      {Meter(ui, 'context', last?.ctxPct ?? null, meterW)}
      <ui.Box flexWrap="wrap">
        {Stat(ui, 'cost', usd(last?.costUsd ?? null), 'accent')}
        {Stat(ui, 'turns', String(list.length))}
        {Stat(ui, 'tools', String(callList.length))}
        {Stat(ui, 'running', String(running), running > 0 ? 'warn' : 'muted')}
        {Stat(ui, 'failed', String(failed), failed > 0 ? 'bad' : 'muted')}
        {Stat(ui, 'busy', duration(totalMs))}
      </ui.Box>
      <ui.Box flexDirection="column">
        <ui.Text dimColor>context per turn</ui.Text>
        {list.length === 0 ? (
          <ui.Text dimColor>no turns yet</ui.Text>
        ) : (
          Spark(ui, 'ctx', ctx, w, { pctScale: true })
        )}
      </ui.Box>
      <ui.Box flexDirection="column">
        <ui.Text dimColor>turn duration</ui.Text>
        {list.length === 0 ? <ui.Text dimColor>no turns yet</ui.Text> : Spark(ui, 'dur', secs, w)}
      </ui.Box>
      {last !== undefined && (
        <ui.Text dimColor>
          last turn #{last.n}: {duration(last.ms)} · {last.tools} tools · {last.reason}
        </ui.Text>
      )}
    </ui.Box>
  )
}

function toolList(ui: Kit, w: number, rows: number, callList: CallRec[], cwd: string): RenderElement {
  if (callList.length === 0) return <ui.Text dimColor>No tool calls yet.</ui.Text>
  const counts = new Map<string, number>()
  for (const c of callList) counts.set(c.tool, (counts.get(c.tool) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  const visible = callList.slice(-Math.max(1, rows - 3)).reverse()

  return (
    <ui.Box flexDirection="column">
      <ui.Text dimColor>{clip(top.map(([t, n]) => `${t}×${n}`).join('  '), w)}</ui.Text>
      {visible.map(c => {
        const s = STATUS_GLYPH[c.status]
        const time = c.ms === null || c.status === 'denied' ? '' : duration(c.ms)
        const head = `${c.tool} `
        const room = Math.max(4, w - head.length - time.length - 4)
        return (
          <ui.Box justifyContent="space-between">
            <ui.Text>
              <ui.Text color={tone[s.tone]}>{s.glyph} </ui.Text>
              <ui.Text bold>{head}</ui.Text>
              <ui.Text dimColor>{clip(shortPath(c.label, cwd), room)}</ui.Text>
            </ui.Text>
            <ui.Text dimColor>{time}</ui.Text>
          </ui.Box>
        )
      })}
    </ui.Box>
  )
}

function fileList(ui: Kit, w: number, rows: number, fileRecs: FileRec[], cwd: string): RenderElement {
  if (fileRecs.length === 0) return <ui.Text dimColor>No files touched yet.</ui.Text>
  const sorted = [...fileRecs].sort((a, b) => b.edits - a.edits || b.reads - a.reads)
  const maxEdits = Math.max(1, ...sorted.map(f => f.edits))
  const heatW = 8

  return (
    <ui.Box flexDirection="column">
      <ui.Text dimColor>{fileRecs.length} files · edits ▮ reads r</ui.Text>
      {sorted.slice(0, Math.max(1, rows - 2)).map(f => {
        const heat = Math.round((f.edits / maxEdits) * heatW)
        return (
          <ui.Box justifyContent="space-between">
            <ui.Text>{clip(shortPath(f.path, cwd), Math.max(6, w - heatW - 8))}</ui.Text>
            <ui.Text>
              <ui.Text color={tone[f.edits > 0 ? 'accent' : 'muted']}>
                {'▮'.repeat(heat)}
                {'·'.repeat(heatW - heat)}
              </ui.Text>
              <ui.Text dimColor> {f.reads}r</ui.Text>
            </ui.Text>
          </ui.Box>
        )
      })}
    </ui.Box>
  )
}

async function clearHistory($: EngineInterface): Promise<void> {
  await update($, calls, () => [])
  await update($, turns, () => [])
  await update($, files, () => [])
  $.ui.status(undefined)
}

async function togglePane($: EngineInterface): Promise<boolean> {
  const panes = await $.ui.panes()
  if (panes.some(p => p.id === PANE)) {
    await $.ui.close({ id: PANE })
    return false
  }
  await $.ui.open({ id: PANE, title: TITLE })
  return true
}

export const register: Register = on => {
  let toolsThisTurn = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit', description: 'Open or close the session cockpit pane' })
    await $.command.register({ name: 'cockpit-reset', description: 'Clear the cockpit history of this session' })
    void bumpLifetime($, { sessions: 1 })
    if (e.isInteractive) void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'cockpit' }, async $ => ({
    text: (await togglePane($)) ? 'Cockpit opened.' : 'Cockpit closed.',
  }))

  on('command.run', { command: 'cockpit-reset' }, async $ => {
    await clearHistory($)
    return { text: 'Cockpit history cleared.' }
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') await clearHistory($)
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) toolsThisTurn = 0
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = String(e.tool)
    const startedAt = await $.clock.now()
    const rec: CallRec = { id: e.tool_use_id, tool, label: labelOf(input), startedAt, ms: null, status: 'running' }
    toolsThisTurn += 1
    await update($, calls, list => [...list, rec].slice(-300))

    const ran = await next(e)

    const status: CallStatus = ran.deny !== undefined ? 'denied' : ran.isError === true ? 'error' : 'ok'
    const ms = (await $.clock.now()) - startedAt
    await update($, calls, list => list.map(c => (c.id === rec.id ? { ...c, ms, status } : c)))

    const path = input.file_path
    if (status === 'ok' && typeof path === 'string' && (READS.has(tool) || EDITS.has(tool))) {
      const isEdit = EDITS.has(tool)
      await update($, files, list => {
        const found = list.find(f => f.path === path)
        const base = found ?? { path, reads: 0, edits: 0 }
        const next1 = { ...base, reads: base.reads + (isEdit ? 0 : 1), edits: base.edits + (isEdit ? 1 : 0) }
        return found === undefined ? [...list, next1].slice(-200) : list.map(f => (f.path === path ? next1 : f))
      })
    }
    void bumpLifetime($, { toolCalls: 1 })
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    const usage = await $.session.usage()
    const ctxPct = usage.context.percent ?? null
    const costUsd = usage.cost?.usd ?? null
    const prior = await read($, turns)
    const rec: TurnRec = {
      n: (prior.at(-1)?.n ?? 0) + 1,
      ms: e.durationMs,
      tools: toolsThisTurn,
      ctxPct,
      costUsd,
      reason: e.reason,
    }
    await update($, turns, list => [...list, rec].slice(-120))
    void bumpLifetime($, { turns: 1 })

    const ctxText = ctxPct === null ? '' : `ctx ${Math.round(ctxPct)}%`
    $.ui.status([ctxText, usd(costUsd)].filter(s => s !== '' && s !== 'n/a').join(' · ') || undefined)
    if (e.durationMs > LONG_TURN_MS) {
      $.ui.toast(`Cockpit: that turn took ${duration(e.durationMs)} with ${rec.tools} tool calls`)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, turns)
    const last = list.at(-1)
    if (e.props.hasSurvey || last === undefined || (await read($, isBandHidden))) return next(e)

    const ui = $.ui.resolve(e) as Kit
    const pct = last.ctxPct
    return (
      <ui.Box gap={1}>
        <ui.Text color={tone.accent}>◆</ui.Text>
        {pct !== null && (
          <ui.Text color={tone[levelTone(pct)]}>ctx {Math.round(pct)}%</ui.Text>
        )}
        <ui.Text dimColor>
          {usd(last.costUsd)} · turn #{last.n} {duration(last.ms)} · {last.tools} tools
        </ui.Text>
        <ui.Button
          key="toggle"
          label="Cockpit"
          plain
          onPress={() => void togglePane($)}
        />
        <ui.Button key="hide-band" label="×" plain onPress={() => update($, isBandHidden, () => true)} />
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as Kit
    const w = Math.max(20, e.props.bodyColumns)
    const rows = Math.max(8, (e.viewport?.rows ?? 30) - 8)
    const stored = await read($, tab)
    const active: Tab = TABS.some(t => t.id === stored) ? stored : 'overview'
    const turnList = await read($, turns)
    const callList = await read($, calls)
    const fileRecs = await read($, files)
    const cwd = await $.session.cwd()
    const life = await loadLifetime($)

    const body =
      active === 'overview'
        ? overview(ui, w, turnList, callList)
        : active === 'tools'
          ? toolList(ui, w, rows, callList, cwd)
          : fileList(ui, w, rows, fileRecs, cwd)

    return (
      <ui.Box flexDirection="column" gap={1}>
        {Heading(ui, 'Session cockpit', `${life.sessions} ${life.sessions === 1 ? 'session' : 'sessions'} · ${life.toolCalls} calls all-time`)}
        {Tabs(ui, TABS, active, id => void update($, tab, () => id))}
        {Rule(ui, w)}
        {body}
      </ui.Box>
    )
  })
}

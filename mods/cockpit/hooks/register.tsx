import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { CallRec, CallStatus, FileRec, Lifetime, Live, Tab, Totals, TurnRec } from '../types'
import { FIELD_MAX, Heading, Meter, Pager, Rule, Spark, Stat, Tabs, cells, clip, clipMiddle, duration, levelTone, levelWord, tone, usd } from './kit'
import type { Kit, Tone } from './kit'

const PANE = 'cockpit'
const TITLE = 'Cockpit'
const LIFETIME_KEY = 'lifetime'
const LONG_TURN_MS = 90_000
const KEEP_CALLS = 300
const KEEP_TURNS = 120
const KEEP_FILES = 200
const TOOL_NAME_MAX = 18

const EMPTY_TOTALS: Totals = { turns: 0, calls: 0, failed: 0, denied: 0, busyMs: 0 }

const calls = atom({ plugin: 'cockpit', key: 'calls' } as const, [], { shape: 'calls-1' })
const turns = atom({ plugin: 'cockpit', key: 'turns' } as const, [], { shape: 'turns-1' })
const files = atom({ plugin: 'cockpit', key: 'files' } as const, [], { shape: 'files-1' })
const totals = atom({ plugin: 'cockpit', key: 'totals' } as const, EMPTY_TOTALS, { shape: 'totals-1' })
const live = atom({ plugin: 'cockpit', key: 'live' } as const, null, { shape: 'live-1' })
const tab = atom({ plugin: 'cockpit', key: 'tab' } as const, 'overview')
const page = atom({ plugin: 'cockpit', key: 'page' } as const, 0)
const isBandHidden = atom({ plugin: 'cockpit', key: 'isBandHidden' } as const, false)

const TABS = [
  { id: 'overview', label: 'Overview', short: 'Ovw', hotkey: '1' },
  { id: 'tools', label: 'Tools', short: 'Tls', hotkey: '2' },
  { id: 'files', label: 'Files', short: 'Fls', hotkey: '3' },
] as const satisfies readonly { id: Tab; label: string; short: string; hotkey: string }[]

const STATUS: Record<CallStatus, { glyph: string; tone: Tone; word: string }> = {
  running: { glyph: '◐', tone: 'info', word: 'running' },
  ok: { glyph: '✓', tone: 'ok', word: 'ok' },
  error: { glyph: '✗', tone: 'bad', word: 'failed' },
  denied: { glyph: '⊘', tone: 'warn', word: 'denied' },
}

const READS = new Set(['Read', 'Grep', 'Glob'])
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function labelOf(input: Record<string, unknown>): string {
  for (const field of ['command', 'file_path', 'pattern', 'url', 'query', 'description', 'prompt']) {
    const v = input[field]
    if (typeof v === 'string' && v.length > 0) return v.replace(/\s+/g, ' ').slice(0, FIELD_MAX)
  }
  return ''
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
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

function overview(ui: Kit, w: number, list: readonly TurnRec[], callList: readonly CallRec[], sum: Totals, life: Lifetime): RenderElement {
  const last = list.at(-1)
  const running = callList.filter(c => c.status === 'running').length
  const ctx = list.map(t => t.ctxPct ?? 0)
  const secs = list.map(t => t.ms / 1000)
  const sparkW = Math.max(1, w)
  const shown = Math.min(list.length, sparkW)
  const longest = Math.max(0, ...secs.slice(-sparkW))

  return (
    <ui.Box flexDirection="column" gap={1}>
      <ui.Box flexDirection="column">
        <ui.Text dimColor>{last ? clip(`as of turn #${last.n}, the last one that finished`, w) : 'no turns yet'}</ui.Text>
        {Meter(ui, 'context', last?.ctxPct ?? null, w)}
      </ui.Box>
      <ui.Box flexWrap="wrap">
        {Stat(ui, 'cost', usd(last?.costUsd ?? null), 'accent')}
        {Stat(ui, 'running', String(running), running > 0 ? 'info' : 'muted')}
        {Stat(ui, 'failed', String(sum.failed), sum.failed > 0 ? 'bad' : 'muted')}
        {Stat(ui, 'denied', String(sum.denied), sum.denied > 0 ? 'warn' : 'muted')}
      </ui.Box>
      <ui.Text dimColor>{clip(`this session · ${count(sum.turns, 'turn')} · ${count(sum.calls, 'tool call')} · busy ${duration(sum.busyMs)}`, w)}</ui.Text>
      {list.length > 0 && (
        <ui.Box flexDirection="column">
          <ui.Text dimColor>{clip(`context per turn · last ${shown} · scale 0–100%`, w)}</ui.Text>
          {Spark(ui, 'ctx', ctx, sparkW, { pctScale: true })}
          <ui.Text dimColor>{clip(`turn time · last ${shown} · tallest ${duration(longest * 1000)}`, w)}</ui.Text>
          {Spark(ui, 'dur', secs, sparkW, { tone: 'accent' })}
        </ui.Box>
      )}
      <ui.Text dimColor>{clip(`all time · ${count(life.sessions, 'session')} · ${count(life.toolCalls, 'tool call')}`, w)}</ui.Text>
    </ui.Box>
  )
}

function callRow(ui: Kit, w: number, c: CallRec, cwd: string): RenderElement {
  const s = STATUS[c.status]
  const time = c.ms === null || c.status === 'denied' ? '' : duration(c.ms)
  const name = clipMiddle(c.tool, Math.min(TOOL_NAME_MAX, Math.max(4, Math.floor(w / 3))))
  const room = w - 2 - cells(name) - 1 - (time === '' ? 0 : cells(time) + 1)
  return (
    <ui.Box key={`call-${c.id}`} justifyContent="space-between">
      <ui.Text>
        <ui.Text color={tone[s.tone]}>{s.glyph} </ui.Text>
        <ui.Text bold>{name}</ui.Text>
        {room >= 4 && <ui.Text dimColor>{` ${clipMiddle(shortPath(c.label, cwd), room)}`}</ui.Text>}
      </ui.Text>
      {time !== '' && <ui.Text dimColor>{time}</ui.Text>}
    </ui.Box>
  )
}

function toolList(ui: Kit, w: number, size: number, at: number, callList: readonly CallRec[], sum: Totals, cwd: string, onPage: (p: number) => void): RenderElement {
  if (callList.length === 0) return <ui.Text dimColor>No tool calls yet.</ui.Text>
  const counts = new Map<string, number>()
  for (const c of callList) counts.set(c.tool, (counts.get(c.tool) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  const newest = [...callList].reverse()
  const pages = Math.max(1, Math.ceil(newest.length / size))
  const p = Math.min(at, pages - 1)
  const dropped = sum.calls - callList.filter(c => c.status !== 'running').length

  return (
    <ui.Box flexDirection="column">
      <ui.Text dimColor>{clip('✓ ok  ✗ failed  ⊘ denied by a rule or hook  ◐ running', w)}</ui.Text>
      <ui.Text dimColor>{clip(top.map(([t, n]) => `${t}×${n}`).join('  '), w)}</ui.Text>
      {newest.slice(p * size, p * size + size).map(c => callRow(ui, w, c, cwd))}
      {Pager(ui, p, size, newest.length, 'recent calls', onPage)}
      {dropped > 0 && <ui.Text dimColor>{clip(`${dropped} older calls are counted in the totals but no longer listed`, w)}</ui.Text>}
    </ui.Box>
  )
}

function fileList(ui: Kit, w: number, size: number, at: number, fileRecs: readonly FileRec[], cwd: string, onPage: (p: number) => void): RenderElement {
  if (fileRecs.length === 0) return <ui.Text dimColor>No files touched yet.</ui.Text>
  const sorted = [...fileRecs].sort((a, b) => b.edits - a.edits || b.reads - a.reads)
  const maxEdits = Math.max(1, ...sorted.map(f => f.edits))
  const heatW = w >= 56 ? 8 : 0
  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const p = Math.min(at, pages - 1)

  return (
    <ui.Box flexDirection="column">
      <ui.Text dimColor>{clip(heatW > 0 ? `sorted by edits · bar relative to the top file (${maxEdits})` : 'sorted by edits', w)}</ui.Text>
      {sorted.slice(p * size, p * size + size).map(f => {
        const counts = `${f.edits}e ${f.reads}r`
        const heat = f.edits === 0 ? 0 : Math.max(1, Math.round((f.edits / maxEdits) * heatW))
        const room = w - cells(counts) - 1 - (heatW > 0 ? heatW + 1 : 0)
        return (
          <ui.Box key={`file-${f.path}`} justifyContent="space-between">
            <ui.Text>{clipMiddle(shortPath(f.path, cwd), Math.max(1, room))}</ui.Text>
            <ui.Text>
              {heatW > 0 && (
                <ui.Text color={tone[f.edits > 0 ? 'accent' : 'muted']}>
                  {'▮'.repeat(heat)}
                  {'·'.repeat(heatW - heat)}{' '}
                </ui.Text>
              )}
              <ui.Text bold={f.edits > 0}>{counts}</ui.Text>
            </ui.Text>
          </ui.Box>
        )
      })}
      {Pager(ui, p, size, sorted.length, 'files', onPage)}
      <ui.Text dimColor>e edits · r reads</ui.Text>
    </ui.Box>
  )
}

async function clearHistory($: EngineInterface): Promise<void> {
  await update($, calls, () => [])
  await update($, turns, () => [])
  await update($, files, () => [])
  await update($, totals, () => EMPTY_TOTALS)
  await update($, live, () => null)
  await update($, page, () => 0)
  await update($, isBandHidden, () => false)
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
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit', description: 'Open or close the session cockpit pane' })
    await $.command.register({ name: 'cockpit-reset', description: 'Clear this session in the cockpit and show its band again' })
    void bumpLifetime($, { sessions: 1 })
    if (e.isInteractive) void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'cockpit' }, async $ => ({
    text: (await togglePane($)) ? 'Cockpit opened.' : 'Cockpit closed.',
  }))

  on('command.run', { command: 'cockpit-reset' }, async $ => {
    await clearHistory($)
    return { text: 'Cockpit history cleared, and its band is shown again.' }
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') await clearHistory($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const startedAt = await $.clock.now()
      const sum = await read($, totals)
      await update($, live, (): Live => ({ n: sum.turns + 1, startedAt }))
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = String(e.tool)
    const startedAt = await $.clock.now()
    const rec: CallRec = { id: e.tool_use_id, tool: tool.slice(0, FIELD_MAX), label: labelOf(input), startedAt, ms: null, status: 'running' }
    await update($, calls, list => [...list, rec].slice(-KEEP_CALLS))

    const ran = await next(e)

    const status: CallStatus = ran.deny !== undefined ? 'denied' : ran.isError === true ? 'error' : 'ok'
    const ms = (await $.clock.now()) - startedAt
    await update($, calls, list => list.map(c => (c.id === rec.id ? { ...c, ms, status } : c)))
    await update($, totals, t => ({
      ...t,
      calls: t.calls + 1,
      failed: t.failed + (status === 'error' ? 1 : 0),
      denied: t.denied + (status === 'denied' ? 1 : 0),
    }))

    const path = input.file_path
    if (status === 'ok' && typeof path === 'string' && (READS.has(tool) || EDITS.has(tool))) {
      const isEdit = EDITS.has(tool)
      await update($, files, list => {
        const found = list.find(f => f.path === path)
        const base = found ?? { path: path.slice(0, FIELD_MAX * 2), reads: 0, edits: 0 }
        const after = { ...base, reads: base.reads + (isEdit ? 0 : 1), edits: base.edits + (isEdit ? 1 : 0) }
        return found === undefined ? [...list, after].slice(-KEEP_FILES) : list.map(f => (f.path === path ? after : f))
      })
    }
    void bumpLifetime($, { toolCalls: 1 })
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    const now = await read($, live)
    const usage = await $.session.usage()
    const ctxPct = usage.context.percent ?? null
    const costUsd = usage.cost?.usd ?? null
    const sum = await read($, totals)
    const callList = await read($, calls)
    const startedAt = now?.startedAt ?? 0
    const rec: TurnRec = {
      n: sum.turns + 1,
      ms: e.durationMs,
      tools: callList.filter(c => c.startedAt >= startedAt).length,
      ctxPct,
      costUsd,
      reason: e.reason,
    }
    await update($, turns, list => [...list, rec].slice(-KEEP_TURNS))
    await update($, totals, t => ({ ...t, turns: t.turns + 1, busyMs: t.busyMs + e.durationMs }))
    await update($, live, () => null)
    void bumpLifetime($, { turns: 1 })

    const ctxText = ctxPct === null ? '' : `ctx ${Math.round(ctxPct)}%`
    $.ui.status([ctxText, usd(costUsd)].filter(s => s !== '' && s !== 'n/a').join(' · ') || undefined)
    if (e.durationMs > LONG_TURN_MS) {
      $.ui.toast(`Cockpit: turn #${rec.n} finished after ${duration(e.durationMs)}, with ${count(rec.tools, 'tool call')}`)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, live)
    const last = (await read($, turns)).at(-1)
    if (e.props.hasSurvey || (now === null && last === undefined) || (await read($, isBandHidden))) return next(e)

    const ui = $.ui.resolve(e) as Kit
    const w = e.props.bodyColumns
    const actions = (
      <ui.Box gap={1}>
        <ui.Button key="toggle" label="Cockpit" plain onPress={() => void togglePane($)} />
        <ui.Button key="hide-band" label="Hide" plain onPress={() => update($, isBandHidden, () => true)} />
      </ui.Box>
    )
    const room = Math.max(0, w - 16)

    if (now !== null) {
      const sofar = (await read($, calls)).filter(c => c.startedAt >= now.startedAt).length
      const text = room >= 34 ? `turn #${now.n} working · ${count(sofar, 'tool call')} so far` : `#${now.n} working`
      return (
        <ui.Box gap={1}>
          <ui.Text color={tone.info}>◐</ui.Text>
          <ui.Text dimColor>{clip(text, Math.max(1, room - 2))}</ui.Text>
          {actions}
        </ui.Box>
      )
    }
    if (last === undefined) return next(e)
    const pct = last.ctxPct
    const hot = pct !== null && levelTone(pct) !== 'ok' && room >= 48
    const done = room >= 30 ? `turn #${last.n} done · ${duration(last.ms)} · ${count(last.tools, 'tool call')}` : `#${last.n} · ${duration(last.ms)}`
    return (
      <ui.Box gap={1}>
        <ui.Text color={tone[last.reason === 'answer' ? 'ok' : 'warn']}>{last.reason === 'answer' ? '✓' : '⊘'}</ui.Text>
        <ui.Text dimColor>{clip(done, Math.max(1, room - 2 - (hot ? 18 : 0)))}</ui.Text>
        {hot && pct !== null && (
          <ui.Text color={tone[levelTone(pct)]}>{`ctx ${Math.round(pct)}% ${levelWord(pct)}`}</ui.Text>
        )}
        {actions}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as Kit
    const w = Math.max(1, e.props.bodyColumns)
    const bodyRows = e.props.scroll?.bodyRows ?? 30
    const stored = await read($, tab)
    const active: Tab = TABS.some(t => t.id === stored) ? stored : 'overview'
    const at = await read($, page)
    const turnList = await read($, turns)
    const callList = await read($, calls)
    const fileRecs = await read($, files)
    const sum = await read($, totals)
    const now = await read($, live)
    const hidden = await read($, isBandHidden)
    const cwd = await $.session.cwd()
    const size = Math.max(3, bodyRows - 10)
    const goPage = (p: number) => void update($, page, () => p)

    const right = now !== null ? `◐ turn #${now.n} working` : turnList.length > 0 ? count(sum.turns, 'turn') : 'standing by'
    const body =
      active === 'overview'
        ? overview(ui, w, turnList, callList, sum, await loadLifetime($))
        : active === 'tools'
          ? toolList(ui, w, size, at, callList, sum, cwd, goPage)
          : fileList(ui, w, size, at, fileRecs, cwd, goPage)

    return (
      <ui.Box flexDirection="column" gap={1}>
        {Heading(ui, 'Session cockpit', w, right)}
        <ui.Box gap={1} flexWrap="wrap">
          {Tabs(ui, TABS, active, w, id => {
            void update($, tab, () => id)
            void update($, page, () => 0)
          })}
          {hidden && <ui.Button key="show-band" label="Show band" plain onPress={() => update($, isBandHidden, () => false)} />}
        </ui.Box>
        {Rule(ui, w)}
        {body}
      </ui.Box>
    )
  })
}

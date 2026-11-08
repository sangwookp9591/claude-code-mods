import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Blocked, Brief, Call, CallStatus, Change, Lane, RuleId, Tab, TurnInfo } from '../types'

const PANE = 'blackbox'
const TITLE = 'Blackbox'
const RULES_KEY = 'rules'
const WINDOW_MS = 90_000
const MAX_CALLS = 400
const MAX_CHANGES = 200
const DIFF_LINES = 400

const calls = atom({ plugin: 'blackbox', key: 'calls' } as const, [], { shape: 'calls-1' })
const changes = atom({ plugin: 'blackbox', key: 'changes' } as const, [], { shape: 'changes-1' })
const rules = atom({ plugin: 'blackbox', key: 'rules' } as const, ['rm-rf', 'force-push', 'env-write', 'pipe-sh', 'reset-hard'], { shape: 'rules-1' })
const blocked = atom({ plugin: 'blackbox', key: 'blocked' } as const, [], { shape: 'blocked-1' })
const brief = atom({ plugin: 'blackbox', key: 'brief' } as const, { status: 'idle' }, { shape: 'brief-1' })
const turn = atom({ plugin: 'blackbox', key: 'turn' } as const, { n: 0, startedAt: 0, endedAt: null, calls: 0 }, { shape: 'turn-1' })
const tab = atom({ plugin: 'blackbox', key: 'tab' } as const, 'radar')
const picked = atom({ plugin: 'blackbox', key: 'picked' } as const, '')
const isBandHidden = atom({ plugin: 'blackbox', key: 'isBandHidden' } as const, false)

const TABS: readonly { id: Tab; label: string; hotkey: string }[] = [
  { id: 'radar', label: 'Radar', hotkey: '1' },
  { id: 'reel', label: 'Reel', hotkey: '2' },
  { id: 'guard', label: 'Guard', hotkey: '3' },
  { id: 'debrief', label: 'Debrief', hotkey: '4' },
]

const ALL_RULES: readonly RuleId[] = ['rm-rf', 'force-push', 'env-write', 'pipe-sh', 'reset-hard']

const RULES: Record<RuleId, { title: string; why: string; test: (tool: string, input: Record<string, unknown>) => boolean }> = {
  'rm-rf': {
    title: 'Recursive force delete',
    why: 'rm with both -r and -f',
    test: (tool, input) => tool === 'Bash' && /\brm\s+(?:-\S+\s+)*-(?:\S*r\S*f|\S*f\S*r)\S*/i.test(str(input.command)),
  },
  'force-push': {
    title: 'Force push',
    why: 'git push --force or -f',
    test: (tool, input) => tool === 'Bash' && /\bgit\s+push\b[^;&|]*\s(?:--force(?!-with-lease)\b|-f\b)/.test(str(input.command)),
  },
  'reset-hard': {
    title: 'Discard work',
    why: 'git reset --hard, git clean -f',
    test: (tool, input) => tool === 'Bash' && /\bgit\s+(?:reset\s+--hard|clean\s+-\S*f)/.test(str(input.command)),
  },
  'pipe-sh': {
    title: 'Pipe a download into a shell',
    why: 'curl or wget piped to sh',
    test: (tool, input) => tool === 'Bash' && /\b(?:curl|wget)\b[^|;]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/.test(str(input.command)),
  },
  'env-write': {
    title: 'Write a secrets file',
    why: '.env files',
    test: (tool, input) =>
      (EDIT_TOOLS.has(tool) && /(?:^|\/)\.env(?:\.[\w-]+)?$/.test(str(input.file_path))) ||
      (tool === 'Bash' && />\s*\S*\.env\b/.test(str(input.command))),
  },
}

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const LANES: Record<string, Lane> = {
  Read: 'read',
  NotebookRead: 'read',
  Grep: 'find',
  Glob: 'find',
  LS: 'find',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'run',
  BashOutput: 'run',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'agent',
  Task: 'agent',
}

const GLYPH: Record<CallStatus, { glyph: string; color: string }> = {
  running: { glyph: '◐', color: 'warning' },
  ok: { glyph: '✓', color: 'success' },
  error: { glyph: '✗', color: 'error' },
  blocked: { glyph: '⊘', color: 'error' },
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function laneOf(tool: string): Lane {
  return LANES[tool] ?? (tool.startsWith('mcp__') ? 'web' : 'other')
}

function labelOf(input: Record<string, unknown>, cwd: string): string {
  for (const field of ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'description', 'prompt']) {
    const v = input[field]
    if (typeof v === 'string' && v.length > 0) return rel(v.replace(/\s+/g, ' '), cwd)
  }
  return ''
}

function rel(path: string, cwd: string): string {
  return cwd !== '' && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path
}

function width(text: string): number {
  let n = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    n += c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || c >= 0x1f300) ? 2 : 1
  }
  return n
}

function clip(text: string, cols: number): string {
  if (width(text) <= cols) return text
  const chars = [...text]
  const keep = Math.max(1, cols - 1)
  const tail: string[] = []
  let used = 0
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const w = width(chars[i] ?? '')
    if (used + w > Math.ceil(keep * 0.6)) break
    tail.unshift(chars[i] ?? '')
    used += w
  }
  const head: string[] = []
  for (const ch of chars) {
    const w = width(ch)
    if (used + w > keep) break
    head.push(ch)
    used += w
  }
  return `${head.join('')}…${tail.join('')}`
}

function duration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`
}

function hunk(oldText: string, newText: string): { diff: string; added: number; removed: number } {
  const a = oldText === '' ? [] : oldText.split('\n')
  const b = newText === '' ? [] : newText.split('\n')
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1
  let post = 0
  while (post < a.length - pre && post < b.length - pre && a[a.length - 1 - post] === b[b.length - 1 - post]) post += 1
  const ctxA = Math.max(0, pre - 2)
  const head = a.slice(ctxA, pre)
  const tail = a.slice(a.length - post, Math.min(a.length, a.length - post + 2))
  const middle = lineDiff(a.slice(pre, a.length - post), b.slice(pre, b.length - post))
  const body = [...head.map(l => ` ${l}`), ...middle, ...tail.map(l => ` ${l}`)].slice(0, DIFF_LINES)
  const added = middle.filter(l => l.startsWith('+')).length
  const removed = middle.filter(l => l.startsWith('-')).length
  const kept = middle.length - added - removed
  return {
    diff: `@@ -${ctxA + 1},${head.length + kept + removed + tail.length} +${ctxA + 1},${head.length + kept + added + tail.length} @@\n${body.join('\n')}`,
    added,
    removed,
  }
}

function lineDiff(a: readonly string[], b: readonly string[]): string[] {
  if (a.length * b.length > 250_000) return [...a.map(l => `-${l}`), ...b.map(l => `+${l}`)]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(` ${a[i]}`)
      i += 1
      j += 1
    } else if (i < a.length && (j === b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      out.push(`-${a[i]}`)
      i += 1
    } else {
      out.push(`+${b[j]}`)
      j += 1
    }
  }
  return out
}

function changeOf(tool: string, input: Record<string, unknown>): { diff: string; added: number; removed: number } | null {
  if (tool === 'Edit') return hunk(str(input.old_string), str(input.new_string))
  if (tool === 'Write') return hunk('', str(input.content))
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    const parts = input.edits.map(x => {
      const e = (x ?? {}) as Record<string, unknown>
      return hunk(str(e.old_string), str(e.new_string))
    })
    return {
      diff: parts.map(p => p.diff).join('\n'),
      added: parts.reduce((n, p) => n + p.added, 0),
      removed: parts.reduce((n, p) => n + p.removed, 0),
    }
  }
  return null
}

function nth(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
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

async function clearAll($: EngineInterface): Promise<void> {
  await update($, calls, () => [])
  await update($, changes, () => [])
  await update($, blocked, () => [])
  await update($, brief, () => ({ status: 'idle' }) as Brief)
  await update($, picked, () => '')
}

async function toggleRule($: EngineInterface, id: RuleId): Promise<void> {
  const next = await update($, rules, list => (list.includes(id) ? list.filter(r => r !== id) : [...list, id]))
  await $.store.set(RULES_KEY, next)
}

async function writeBrief($: EngineInterface, cwd: string): Promise<void> {
  const changeList = await read($, changes)
  const callList = await read($, calls)
  const blockedList = await read($, blocked)
  await update($, brief, () => ({ status: 'writing' }) as Brief)
  const counts = new Map<string, number>()
  for (const c of callList) counts.set(c.tool, (counts.get(c.tool) ?? 0) + 1)
  let budget = 12_000
  const diffs: string[] = []
  for (const c of changeList.slice(-30)) {
    const piece = `### ${c.path} (+${c.added} -${c.removed})\n${c.diff}`.slice(0, 2_000)
    if (budget - piece.length < 0) break
    budget -= piece.length
    diffs.push(piece)
  }
  const prompt = [
    `Working directory: ${cwd}`,
    `Tool calls: ${[...counts.entries()].map(([t, n]) => `${t}×${n}`).join(', ') || 'none'}`,
    `Failed calls: ${callList.filter(c => c.status === 'error').map(c => `${c.tool} ${c.label}`).slice(-8).join('; ') || 'none'}`,
    `Blocked by guard: ${blockedList.map(b => `${b.rule}: ${b.label}`).slice(-8).join('; ') || 'none'}`,
    '',
    'Edits, oldest first:',
    diffs.join('\n\n') || '(no edits)',
  ].join('\n')
  const r = await $.model.complete({
    model: 'haiku',
    system:
      'You write the debrief a developer reads after a coding session with an AI agent. Markdown. Three short sections: "What changed" (bullets naming files), "Watch out" (risks, failed or blocked commands, things left half done), "Next" (one concrete step). Under 140 words. No preamble.',
    prompt,
    maxTokens: 500,
    timeoutMs: 45_000,
  })
  const at = await $.clock.now()
  await update($, brief, () =>
    (r.isAnswered
      ? { status: 'done', text: r.text, at, changes: changeList.length }
      : { status: 'failed', reason: r.reason }) as Brief,
  )
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

async function radarView($: EngineInterface, ui: Ui, hasClient: boolean, w: number, callList: readonly Call[], changeList: readonly Change[]): Promise<RenderElement> {
  const now = await $.clock.now()
  const sel = await read($, picked)
  const pick = callList.find(c => c.id === sel) ?? callList.at(-1)
  const recent = callList.filter(c => now - (c.endedAt ?? now) <= WINDOW_MS).slice(-120)
  const radar =
    hasClient && "Client" in ui ? (
      <ui.Client key="radar" module="./radar.tsx" width="100%" props={{ blips: recent, now, windowMs: WINDOW_MS, picked: pick?.id ?? '' }} />
    ) : (
      <ui.Box flexDirection="column">
        {recent.slice(-12).map(c => (
          <ui.Text key={`r-${c.id}`} color={GLYPH[c.status].color}>{`${GLYPH[c.status].glyph} ${c.lane.padEnd(5)} ${clip(`${c.tool} ${c.label}`, w - 9)}`}</ui.Text>
        ))}
        {recent.length === 0 && <ui.Text dimColor>No calls in the last 90 seconds.</ui.Text>}
      </ui.Box>
    )
  const ok = callList.filter(c => c.status === 'ok').length
  const bad = callList.filter(c => c.status === 'error').length
  const stop = callList.filter(c => c.status === 'blocked').length
  const ch = pick ? changeList.find(c => c.id === pick.id) : undefined
  return (
    <ui.Box flexDirection="column" gap={1}>
      {radar}
      <ui.Text>
        <ui.Text color="success">{`✓ ${ok}`}</ui.Text>
        {'  '}
        <ui.Text color={bad > 0 ? 'error' : 'subtle'}>{`✗ ${bad}`}</ui.Text>
        {'  '}
        <ui.Text color={stop > 0 ? 'error' : 'subtle'}>{`⊘ ${stop} blocked`}</ui.Text>
        <ui.Text dimColor>{'  · ← → or click a blip'}</ui.Text>
      </ui.Text>
      {pick === undefined ? (
        <ui.Text dimColor>Waiting for the first tool call. Every call lands on the radar as it happens.</ui.Text>
      ) : (
        <ui.Box flexDirection="column">
          <ui.Text>
            <ui.Text color={GLYPH[pick.status].color}>{`${GLYPH[pick.status].glyph} `}</ui.Text>
            <ui.Text bold>{`${pick.tool} `}</ui.Text>
            <ui.Text dimColor>{clip(pick.label, Math.max(4, w - pick.tool.length - 14))}</ui.Text>
            <ui.Text dimColor>{pick.endedAt !== null ? `  ${duration(pick.endedAt - pick.startedAt)}` : '  running'}</ui.Text>
          </ui.Text>
          {ch !== undefined && <ui.Code key="pick-diff" source={ch.diff.split('\n').slice(0, 14).join('\n')} format="diff" path={ch.path} wrap="truncate-end" />}
        </ui.Box>
      )}
    </ui.Box>
  )
}

async function reelView($: EngineInterface, ui: Ui, w: number, rows: number, changeList: readonly Change[]): Promise<RenderElement> {
  if (changeList.length === 0) return <ui.Text dimColor>No edits yet. Each Edit, Write and MultiEdit lands here as a replayable diff.</ui.Text>
  const sel = await read($, picked)
  const pick = changeList.find(c => c.id === sel) ?? changeList.at(-1)
  const at = pick ? changeList.indexOf(pick) : changeList.length - 1
  const listRows = Math.min(8, Math.max(3, Math.floor(rows / 3)))
  const start = Math.max(0, Math.min(changeList.length - listRows, at - Math.floor(listRows / 2)))
  const view = changeList.slice(start, start + listRows)
  const files = new Set(changeList.map(c => c.path)).size
  const added = changeList.reduce((n, c) => n + c.added, 0)
  const removed = changeList.reduce((n, c) => n + c.removed, 0)
  const go = (i: number) => {
    const c = changeList[Math.max(0, Math.min(changeList.length - 1, i))]
    return c ? update($, picked, () => c.id) : undefined
  }
  return (
    <ui.Box flexDirection="column" gap={1}>
      <ui.Text>
        <ui.Text dimColor>{`${changeList.length} edits · ${files} files · `}</ui.Text>
        <ui.Text color="diffAdded">{`+${added}`}</ui.Text> <ui.Text color="diffRemoved">{`−${removed}`}</ui.Text>
        <ui.Text dimColor>{start > 0 ? `  · ${start} earlier` : ''}</ui.Text>
      </ui.Text>
      <ui.Box flexDirection="column">
        {view.map(c => (
          <ui.Button
            key={`chg-${c.id}`}
            plain
            label={`${c.id === pick?.id ? '▸' : ' '} ${clip(c.path, Math.max(6, w - 18))}  +${c.added} −${c.removed}${c.nth > 1 ? ` · ${nth(c.nth)}` : ''}`}
            onPress={() => update($, picked, () => c.id)}
          />
        ))}
      </ui.Box>
      <ui.Box gap={2}>
        <ui.Button key="prev" label="◂ Prev" hotkey="p" onPress={() => go(at - 1)} />
        <ui.Button key="next" label="Next ▸" hotkey="n" onPress={() => go(at + 1)} />
        <ui.Text dimColor>{`${at + 1} / ${changeList.length}`}</ui.Text>
      </ui.Box>
      {pick && <ui.Code key="reel-diff" source={pick.diff.split('\n').slice(0, Math.max(8, rows - listRows - 8)).join('\n')} format="diff" path={pick.path} wrap="truncate-end" />}
    </ui.Box>
  )
}

async function guardView($: EngineInterface, ui: Ui, w: number): Promise<RenderElement> {
  const enabledRules = await read($, rules)
  const hits = await read($, blocked)
  return (
    <ui.Box flexDirection="column" gap={1}>
      <ui.Text dimColor>Rules run before every tool call. A match is denied and Claude is told why.</ui.Text>
      <ui.Box flexDirection="column">
        {ALL_RULES.map(id => {
          const isOn = enabledRules.includes(id)
          const n = hits.filter(h => h.rule === id).length
          return (
            <ui.Box key={`row-${id}`} justifyContent="space-between">
              <ui.Button
                key={`rule-${id}`}
                plain
                label={`${isOn ? '■ on ' : '□ off'}  ${clip(RULES[id].title, Math.max(6, w - 22))}`}
                onPress={() => toggleRule($, id)}
              />
              <ui.Text color={n > 0 ? 'error' : 'subtle'}>{n > 0 ? `⊘ ${n}` : (width(RULES[id].why) <= w - 38 ? RULES[id].why : '')}</ui.Text>
            </ui.Box>
          )
        })}
      </ui.Box>
      {hits.length > 0 && (
        <ui.Box flexDirection="column">
          <ui.Text dimColor>Last blocked</ui.Text>
          {hits.slice(-5).reverse().map((hit, i) => (
            <ui.Text key={`hit-${i}`} color="error">{`⊘ ${clip(hit.label, w - 2)}`}</ui.Text>
          ))}
        </ui.Box>
      )}
    </ui.Box>
  )
}

async function debriefView($: EngineInterface, ui: Ui, w: number, cwd: string, changeList: readonly Change[]): Promise<RenderElement> {
  const b = await read($, brief)
  const button = (
    <ui.Button
      key="brief"
      label={b.status === 'done' ? 'Write it again' : 'Write debrief'}
      variant="primary"
      onPress={() => (b.status === 'writing' ? undefined : writeBrief($, cwd))}
    />
  )
  const stale = b.status === 'done' && b.changes !== changeList.length
  return (
    <ui.Box flexDirection="column" gap={1}>
      <ui.Text dimColor>Haiku reads the diffs, failures and blocks, and writes what changed, what to watch, and the next step. A few cents a run.</ui.Text>
      <ui.Box gap={2}>
        {button}
        {b.status === 'writing' && <ui.Text color="warning">◐ writing…</ui.Text>}
        {stale && <ui.Text color="warning">{`${changeList.length - (b.status === 'done' ? b.changes : 0)} new edits since`}</ui.Text>}
      </ui.Box>
      {b.status === 'done' && (ui.Markdown ? <ui.Markdown key="brief-md" text={b.text} /> : <ui.Text>{b.text}</ui.Text>)}
      {b.status === 'failed' && <ui.Text color="error">{`The model did not answer (${b.reason}). Try again.`}</ui.Text>}
    </ui.Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'blackbox', description: 'Open or close the Blackbox flight recorder' })
    await $.command.register({ name: 'blackbox-reset', description: 'Clear what Blackbox recorded in this session' })
    const saved = await $.store.get(RULES_KEY)
    if (Array.isArray(saved)) {
      const ok = saved.filter((r): r is RuleId => ALL_RULES.includes(r as RuleId))
      await update($, rules, () => ok)
    }
    if (e.isInteractive) void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'blackbox' }, async $ => ({
    text: (await togglePane($)) ? 'Blackbox opened.' : 'Blackbox closed.',
  }))

  on('command.run', { command: 'blackbox-reset' }, async $ => {
    await clearAll($)
    return { text: 'Blackbox cleared.' }
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') await clearAll($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const startedAt = await $.clock.now()
      await update($, turn, t => ({ n: t.n + 1, startedAt, endedAt: null, calls: 0 }))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const endedAt = await $.clock.now()
      await update($, turn, t => ({ ...t, endedAt }))
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = e.tool
    const cwd = await $.session.cwd().catch(() => '')
    const startedAt = await $.clock.now()
    const base: Call = { id: e.tool_use_id, tool, lane: laneOf(tool), label: labelOf(input, cwd), startedAt, endedAt: null, status: 'running' }
    if (e.agentId === undefined) await update($, turn, t => ({ ...t, calls: t.calls + 1 }))

    const enabled = await read($, rules)
    const hit = enabled.find(id => RULES[id]?.test(tool, input))
    if (hit !== undefined) {
      await update($, calls, list => [...list, { ...base, endedAt: startedAt, status: 'blocked' as const }].slice(-MAX_CALLS))
      await update($, blocked, list => [...list, { at: startedAt, rule: hit, label: base.label }].slice(-50))
      $.ui.toast(`Blackbox blocked: ${RULES[hit].title}`)
      return { deny: `Blocked by the Blackbox guard rule "${RULES[hit].title}" (${RULES[hit].why}). The person can turn it off in /blackbox, Guard tab.` }
    }

    await update($, calls, list => [...list, base].slice(-MAX_CALLS))
    const ran = await next(e)
    const endedAt = await $.clock.now()
    const status: CallStatus = 'deny' in ran ? 'blocked' : ran.isError ? 'error' : 'ok'
    await update($, calls, list => list.map(c => (c.id === base.id ? { ...c, endedAt, status } : c)))

    if (status === 'ok' && EDIT_TOOLS.has(tool)) {
      const ch = changeOf(tool, input)
      const path = rel(str(input.file_path) || str(input.notebook_path), cwd)
      if (ch !== null && path !== '') {
        await update($, changes, list => {
          const count = list.filter(c => c.path === path).length + 1
          const rec: Change = { id: base.id, path, diff: ch.diff, added: ch.added, removed: ch.removed, at: endedAt, nth: count }
          return [...list, rec].slice(-MAX_CHANGES)
        })
      }
    }
    return ran
  })

  on('ui.message', async ($, e, next) => {
    const data = (e.data ?? {}) as { pick?: unknown }
    if (e.module.endsWith('radar.tsx') && typeof data.pick === 'string') {
      await update($, picked, () => data.pick as string)
      return {}
    }
    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    if (!EDIT_TOOLS.has(e.props.tool) || e.props.isExpanded === true) return row
    const ch = (await read($, changes)).find(c => c.id === e.props.tool_use_id)
    if (ch === undefined) return row
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {row}
        <Text dimColor>
          {'  ⎿ blackbox '}
          <Text color="diffAdded">+{ch.added}</Text> <Text color="diffRemoved">−{ch.removed}</Text>
          {` · ${nth(ch.nth)} change to ${ch.path.split('/').at(-1) ?? ch.path}`}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isBandHidden))) return next(e)
    const t = await read($, turn)
    if (t.n === 0) return next(e)
    const ui = $.ui.resolve(e)
    const callList = await read($, calls)
    const live = t.endedAt === null
    const current = [...callList].reverse().find(c => c.status === 'running')
    const now = await $.clock.now()
    const hiddenBtn = <ui.Button key="hide-band" label="×" plain onPress={() => update($, isBandHidden, () => true)} />
    const openBtn = <ui.Button key="open" label="Blackbox" plain onPress={() => void togglePane($)} />
    const cols = Math.max(20, e.props.bodyColumns)
    if (live && e.surface === 'terminal' && 'Client' in ui) {
      return (
        <ui.Box gap={1}>
          <ui.Client
            key="rec"
            module="./rec.tsx"
            props={{ n: t.n, startedAt: t.startedAt, now, calls: t.calls, current: current ? clip(`${current.tool} ${current.label}`, Math.max(8, cols - 48)) : '' }}
          />
          {openBtn}
          {hiddenBtn}
        </ui.Box>
      )
    }
    const turnCalls = callList.filter(c => c.startedAt >= t.startedAt)
    const failed = turnCalls.filter(c => c.status === 'error').length
    const stopped = turnCalls.filter(c => c.status === 'blocked').length
    const edits = (await read($, changes)).filter(c => c.at >= t.startedAt)
    return (
      <ui.Box gap={1}>
        <ui.Text color={live ? 'error' : 'subtle'}>{live ? '● REC' : '■'}</ui.Text>
        <ui.Text dimColor>{`turn #${t.n} ${t.endedAt !== null ? duration(t.endedAt - t.startedAt) : ''} · ${t.calls} calls`}</ui.Text>
        {edits.length > 0 && cols >= 50 && (
          <ui.Text>
            <ui.Text color="diffAdded">+{edits.reduce((n, c) => n + c.added, 0)}</ui.Text>{' '}
            <ui.Text color="diffRemoved">−{edits.reduce((n, c) => n + c.removed, 0)}</ui.Text>
            <ui.Text dimColor>{` in ${new Set(edits.map(c => c.path)).size} files`}</ui.Text>
          </ui.Text>
        )}
        {failed > 0 && <ui.Text color="error">{`✗ ${failed}`}</ui.Text>}
        {stopped > 0 && <ui.Text color="error">{`⊘ ${stopped}`}</ui.Text>}
        {openBtn}
        {hiddenBtn}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const w = Math.max(24, e.props.bodyColumns)
    const rows = Math.max(10, e.props.scroll?.bodyRows ?? 30)
    const stored = await read($, tab)
    const active: Tab = TABS.some(t => t.id === stored) ? stored : 'radar'
    const cwd = await $.session.cwd().catch(() => '')
    const t = await read($, turn)
    const callList = await read($, calls)
    const changeList = await read($, changes)
    const bandHidden = await read($, isBandHidden)

    const right = t.n === 0 ? 'standing by' : `turn #${t.n} · ${callList.length} calls · ${changeList.length} edits`
    const body =
      active === 'radar'
        ? await radarView($, ui, e.surface === "terminal" || e.surface === "desktop", w, callList, changeList)
        : active === 'reel'
          ? await reelView($, ui, w, rows, changeList)
          : active === 'guard'
            ? await guardView($, ui, w)
            : await debriefView($, ui, w, cwd, changeList)

    return (
      <ui.Box flexDirection="column" gap={1}>
        <ui.Box justifyContent="space-between">
          <ui.Text bold color="claude">
            ◉ Blackbox
          </ui.Text>
          <ui.Text dimColor>{clip(right, Math.max(4, w - 12))}</ui.Text>
        </ui.Box>
        <ui.Box gap={1} flexWrap="wrap">
          {TABS.map(x => (
            <ui.Button
              key={`tab-${x.id}`}
              label={w < 40 ? x.label.slice(0, 3) : x.label}
              hotkey={x.hotkey}
              variant={x.id === active ? 'primary' : 'secondary'}
              onPress={() => update($, tab, () => x.id)}
            />
          ))}
          {bandHidden && <ui.Button key="show-band" label="Show band" plain onPress={() => update($, isBandHidden, () => false)} />}
        </ui.Box>
        {body}
      </ui.Box>
    )
  })

}

export type { Blocked, TurnInfo }

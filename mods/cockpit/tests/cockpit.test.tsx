import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

function pane(bodyColumns: number, bodyRows = 30) {
  return {
    plugin: 'cockpit',
    component: 'Pane',
    requestId: 'cockpit',
    props: { title: 'Cockpit', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  } as const
}

function band(bodyColumns: number) {
  return { plugin: 'cockpit', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns } } as const
}

const PANE = pane(48)
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

function engine(on: On) {
  const clock = mock.clock(on, { now: 1_000 })
  mock.store(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { context: { percent: 72 }, cost: { usd: 0.42 } } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.call', async (_, e) => {
    await clock.advance(200)
    return e.tool === 'Bash' && e.command === 'false' ? { result: {}, isError: true } : { result: {} }
  })
  return clock
}

function cells(text: string): number {
  let n = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    n += (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ? 2 : 1
  }
  return n
}

function textOf(el: unknown): string {
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  if (Array.isArray(el)) return el.map(textOf).join('')
  if (el && typeof el === 'object' && 'props' in el) return textOf((el as { props: { children?: unknown } }).props.children)
  return ''
}

function widest(el: RenderElement | string | null | undefined): number {
  if (el === null || el === undefined || typeof el !== 'object') return typeof el === 'string' ? cells(el) : 0
  const node = el as { type: string; props: Record<string, unknown> & { children?: unknown } }
  const kids = ([] as unknown[]).concat(node.props.children ?? []).filter(k => k !== null && k !== undefined && k !== false) as RenderElement[]
  if (node.type === 'Text') return cells(textOf(node))
  if (node.type === 'Button') return cells(String(node.props.label ?? '')) + 4
  if (node.props.flexDirection === 'column') return Math.max(0, ...kids.map(widest))
  if (node.props.flexWrap === 'wrap') return Math.max(0, ...kids.map(widest))
  const gap = typeof node.props.gap === 'number' ? node.props.gap : 0
  return kids.reduce((n, k) => n + widest(k), 0) + gap * Math.max(0, kids.length - 1)
}

async function aTurn($: Parameters<Parameters<typeof test>[1]>[0], id: string, work: () => Promise<unknown>) {
  await $.turn.start({ text: 'go', turnId: id })
  await work()
  await $.turn.complete({ answer: 'ok', durationMs: 25_000, isAborted: false, turnId: id, reason: 'answer' })
}

test('the tools tab lists each call with its outcome, on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-tools' })
    expect((await ui.find({ type: 'Text', text: /ls -la/ }))?.text).toContain('ls -la')
    expect(await ui.find({ type: 'Text', text: /src\/app\.ts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⊘ denied by a rule or hook/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the files tab shows real counts, not only a relative bar', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'y', new_string: 'z' })

  const ui = await $.ui.mount({ ...pane(60), surface: 'terminal' })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: /^a\.ts$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2e 1r$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /bar relative to the top file \(2\)/ })).toBeDefined()
  await ui.unmount()
})

test('session totals keep counting past what the lists keep', { timeoutMs: 60_000 }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 305; i += 1) await $.tool.call({ tool: 'Bash', tool_use_id: `c${i}`, command: i % 50 === 0 ? 'false' : 'ls' })

  const ui = await $.ui.mount({ ...pane(80), surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /305 tool calls/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^7$/ })).toBeDefined()
  await ui.press({ key: 'tab-tools' })
  expect(await ui.find({ type: 'Text', text: /5 older calls are counted in the totals/ })).toBeDefined()
  await ui.unmount()
})

test('the tools tab pages through the calls by the rows the pane has', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 40; i += 1) await $.tool.call({ tool: 'Bash', tool_use_id: `c${i}`, command: `echo ${i}` })

  const ui = await $.ui.mount({ ...pane(60, 20), surface: 'terminal' })
  await ui.press({ key: 'tab-tools' })
  expect(await ui.find({ type: 'Text', text: /^1–10 of 40 recent calls$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /echo 39/ })).toBeDefined()
  await ui.press({ key: 'page-older' })
  expect(await ui.find({ type: 'Text', text: /^11–20 of 40 recent calls$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /echo 29/ })).toBeDefined()
  await ui.unmount()
})

test('no row is wider than the pane, even at 20 columns with Korean paths and long MCP names', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await aTurn($, 't1', async () => {
    await $.tool.call({ tool: 'Read', file_path: '/repo/문서/아주/긴/한글/경로/설계-문서-최종본.md' })
    await $.tool.call({ tool: 'mcp__a_very_long_server_name__and_an_even_longer_tool_name', query: 'x'.repeat(5000) })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/문서/아주/긴/한글/경로/설계-문서-최종본.md', old_string: 'a', new_string: 'b' })
  })

  for (const w of [20, 32, 56]) {
    for (const t of ['overview', 'tools', 'files']) {
      const ui = await $.ui.mount({ ...pane(w), surface: 'terminal' })
      await ui.press({ key: `tab-${t}` })
      const tree = await ui.drawn()
      const rows = (tree as { props: { children: RenderElement[] } }).props.children
      for (const row of ([] as RenderElement[]).concat(rows).filter(Boolean)) {
        if (typeof row === 'object' && row !== null && (row as { props: { flexWrap?: string } }).props.flexWrap === 'wrap') continue
        expect(widest(row)).toBeLessThanOrEqual(w)
      }
      await ui.unmount()
    }
  }
  const ui = await $.ui.mount({ ...pane(56), surface: 'terminal' })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: /설계-문서-최종본\.md$/ })).toBeDefined()
  await ui.unmount()
})

test('the band says what it shows, works while a turn runs, and comes back after Hide', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const working = await $.ui.mount({ ...band(100), surface: 'terminal' })
  expect(await working.find({ type: 'Text', text: /turn #1 working · 1 tool call so far/ })).toBeDefined()
  await working.unmount()
  await $.turn.complete({ answer: 'ok', durationMs: 25_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const done = await $.ui.mount({ ...band(100), surface: 'desktop' })
  expect(await done.find({ type: 'Text', text: /turn #1 done · 25s · 1 tool call/ })).toBeDefined()
  expect(await done.find({ type: 'Text', text: /ctx 72% filling/ })).toBeDefined()
  expect(widest(await done.drawn())).toBeLessThanOrEqual(100)
  await done.press({ key: 'hide-band' })
  await done.unmount()

  const gone = await $.ui.mount({ ...band(100), surface: 'terminal' })
  expect(await gone.find({ type: 'Text', text: /turn #1/ })).toBeUndefined()
  await gone.unmount()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'show-band' })
  await ui.unmount()
  const back = await $.ui.mount({ ...band(30), surface: 'terminal' })
  expect(await back.find({ type: 'Text', text: /#1 · 25s/ })).toBeDefined()
  expect(widest(await back.drawn())).toBeLessThanOrEqual(30)
  await back.unmount()
})

test('the context graph uses the same scale and colours on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await aTurn($, 't1', async () => undefined)
  await aTurn($, 't2', async () => undefined)
  const drawn: string[] = []
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    drawn.push(JSON.stringify(await ui.findAll({ type: 'Text', text: /^[▁▂▃▄▅▆▇█]+$/ })))
    expect(await ui.find({ type: 'Text', text: /scale 0–100%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /as of turn #2, the last one that finished/ })).toBeDefined()
    await ui.unmount()
  }
  expect(new Set(drawn).size).toBe(1)
  expect(drawn[0]).toContain('warning')
})

test('the overview starts empty and says so', async ($, on) => {
  engine(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /no turns yet/ })).toBeDefined()
    await ui.unmount()
  }
})

test('history stored by an older shape is declined', async ($, on) => {
  engine(on)
  on('state.get', { key: 'turns' }, () => ({ value: { value: [{ n: 'old' }], version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /no turns yet/ })).toBeDefined()
  await ui.unmount()
})

test('a stored tab that is no tab falls back to the overview', async ($, on) => {
  engine(on)
  on('state.get', { key: 'tab' }, () => ({ value: { value: 'gone', version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /all time/ })).toBeDefined()
  await ui.unmount()
})

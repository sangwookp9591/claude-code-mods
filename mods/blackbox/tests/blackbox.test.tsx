import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'blackbox',
  component: 'Pane',
  requestId: 'blackbox',
  props: { title: 'Blackbox', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const BAND = {
  plugin: 'blackbox',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 4, bodyColumns: 100 },
} as const

function engine(on: On) {
  const clock = mock.clock(on, { now: 10_000 })
  mock.store(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', { component: 'ToolUse' }, (_, e) => ({ type: 'Text', props: {}, children: [`${e.props.tool} row`] }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.call', async (_, e) => {
    await clock.advance(e.tool === 'Bash' ? 1_500 : 120)
    return e.tool === 'Bash' && e.command === 'npm test' ? { result: {}, isError: true } : { result: {} }
  })
  return clock
}

async function start($: Parameters<Parameters<typeof test>[1]>[0]) {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
}

test('the guard denies a risky command and lets it through once the rule is off', async ($, on) => {
  engine(on)
  await start($)
  const denied = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect('deny' in denied && denied.deny).toContain('Recursive force delete')
  const pushed = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
  expect('deny' in pushed).toBe(true)
  const safe = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect('deny' in safe).toBe(false)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-guard' })
  expect(await ui.find({ type: 'Text', text: /rm -rf build/ })).toBeDefined()
  await ui.press({ key: 'rule-rm-rf' })
  await ui.unmount()

  const again = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect('deny' in again).toBe(false)
})

test('every edit lands in the reel as a diff and under its own tool row', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/src/app.ts', old_string: 'const a = 1\nconst b = 2', new_string: 'const a = 1\nconst b = 3\nconst c = 4' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e2', file_path: '/repo/src/app.ts', old_string: 'x', new_string: 'y' })

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-reel' })
    expect(await ui.find({ type: 'Button', text: /src\/app\.ts\s+\+1 −1 · 2nd/ })).toBeDefined()
    await ui.press({ key: 'prev' })
    const code = await ui.find({ type: 'Code' })
    expect(code?.text).toContain('+const c = 4')
    await ui.unmount()
  }
})

test('an unchanged line inside an edit is counted as context, as Claude Code counts it', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({
    tool: 'Edit',
    tool_use_id: 'm1',
    file_path: '/repo/src/math.js',
    old_string: '// TODO: add() is wrong\nexport function add(a, b) {\n  return a - b',
    new_string: 'export function add(a, b) {\n  return a + b',
  })
  const row = { tool_use_id: 'm1', tool: 'Edit', input: {}, isRunning: false, isErrored: false, isInterrupted: false }
  const card = await $.ui.mount({ plugin: 'blackbox', surface: 'terminal', component: 'ToolUse', requestId: 'm1', props: row })
  expect((await card.find({ type: 'Text', text: /blackbox/ }))?.text).toContain('+1 −2 · 1st change to math.js')
  await card.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-reel' })
  expect((await ui.find({ type: 'Code' }))?.text).toContain(' export function add(a, b) {')
  await ui.unmount()
})

test('the radar is a live client on the terminal and a list where there is none', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /RADAR/, in: 'radar' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /✗/, in: 'radar' })).toBeDefined()
  await term.unmount()

  const vs = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await vs.find({ type: 'Text', text: /✗ run\s+Bash npm test/ })).toBeDefined()
  await vs.unmount()
})

test('the debrief asks haiku once and shows its answer', async ($, on) => {
  engine(on)
  let asked = 0
  on('model.complete', (_, e) => {
    asked += 1
    expect(e.model).toBe('haiku')
    expect(e.prompt).toContain('src/app.ts')
    return { value: { isAnswered: true, text: '**What changed**\n- app.ts', usage: { input_tokens: 10, output_tokens: 5 } } }
  })
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-debrief' })
  await ui.press({ key: 'brief' })
  expect(asked).toBe(1)
  expect((await ui.find({ type: 'Markdown' }))?.text).toContain('What changed')
  await ui.unmount()
})

test('the band records while the turn runs, sums it after, and can come back once hidden', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })
  const live = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await live.find({ type: 'Text', text: /REC/, in: 'rec' })).toBeDefined()
  await live.unmount()

  await $.turn.complete({ answer: 'ok', durationMs: 4_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await after.find({ type: 'Text', text: /in 1 files/ })).toBeDefined()
  await after.press({ key: 'hide-band' })
  await after.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'show-band' })
  await pane.unmount()
  const back = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await back.find({ type: 'Button', text: /Blackbox/ })).toBeDefined()
  await back.unmount()
})

test('a history stored by an older shape is declined', async ($, on) => {
  engine(on)
  on('state.get', { key: 'changes' }, () => ({ value: { value: [{ path: 1 }], version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-reel' })
  expect(await ui.find({ type: 'Text', text: /No edits yet/ })).toBeDefined()
  await ui.unmount()
})

test('an edit row gets a one-line impact card, and an expanded row is left alone', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e9', file_path: '/repo/src/app.ts', old_string: 'a\nb', new_string: 'a\nc\nd' })
  const row = { tool_use_id: 'e9', tool: 'Edit', input: {}, isRunning: false, isErrored: false, isInterrupted: false }
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'blackbox', surface, component: 'ToolUse', requestId: 'e9', props: row })
    expect((await ui.find({ type: 'Text', text: /blackbox/ }))?.text).toContain('+2 −1 · 1st change to app.ts')
    await ui.unmount()
  }
  const open = await $.ui.mount({ plugin: 'blackbox', surface: 'terminal', component: 'ToolUse', requestId: 'e9', props: { ...row, isExpanded: true } })
  expect(await open.find({ type: 'Text', text: /blackbox/ })).toBeUndefined()
  await open.unmount()
})

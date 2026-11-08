import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'reef',
  component: 'Pane',
  requestId: 'reef',
  props: { title: 'Reef', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

function engine(on: On) {
  const clock = mock.clock(on, { now: 50_000 })
  mock.store(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.call', (_, e) => (e.tool === 'Bash' && e.command === 'false' ? { result: {}, isError: true } : { result: {} }))
  return clock
}

test('the first tool call hatches a named fish that swims in the tank', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /1 fish · 1 hatched · fed 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\[=\]|\[\$\]/, in: 'tank' })).toBeDefined()
  await ui.unmount()
})

test('more fish hatch as Claude works, errors feed nobody', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  for (let i = 0; i < 8; i += 1) await $.tool.call({ tool: i % 2 === 0 ? 'Read' : 'Bash', tool_use_id: `c${i}`, file_path: '/repo/a.ts', command: 'ls' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'bad', command: 'false' })
  await $.turn.complete({ answer: 'ok', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /5 fish · 5 hatched · fed 8 · 1 turn$/ })).toBeDefined()
  await ui.press({ key: 'feed' })
  expect(await ui.find({ type: 'Text', text: /fed 9/ })).toBeDefined()
  await ui.unmount()
})

test('picking a fish tells where it hatched from', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.post({ pick: 'b1' }, { in: 'tank' })
  expect((await ui.find({ type: 'Text', text: /the pufferfish/ }))?.text).toContain('hatched from Bash npm test')
  expect(await ui.find({ type: 'Text', text: /Mochi/, in: 'tank' })).toBeDefined()
  await ui.unmount()
})

test('clicking the water drops food, and the nearest fish eats it', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/a.ts' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.resize({ columns: 60, rows: 14, in: 'tank' })
  await ui.pointer({ type: 'down', x: 40, y: 2, button: 'left', in: 'tank' })
  await ui.advance(150)
  expect(await ui.find({ type: 'Text', text: /fed 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /·/, in: 'tank' })).toBeDefined()
  await ui.advance(600)
  expect(await ui.find({ type: 'Text', text: /·/, in: 'tank' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /♥/, in: 'tank' })).toBeDefined()
  await ui.unmount()
})

test('without a client the fish are listed', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'vscode', isInteractive: true })
  await $.tool.call({ tool: 'WebFetch', tool_use_id: 'w1', url: 'https://example.com' })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Text', text: /Mochi the jellyfish/ })).toBeDefined()
  await ui.unmount()
})

test('a reef stored by an older shape is declined', async ($, on) => {
  engine(on)
  on('state.get', { key: 'reef' }, () => ({ value: { value: { fish: 3 }, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /The reef is empty/ })).toBeDefined()
  await ui.unmount()
})

test('a turn counts once, and a subagent turn does not count', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/a.ts' })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.start({ text: 'sub', turnId: 's1', agentId: 'a1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 's1', reason: 'answer', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /· 1 turn$/ })).toBeDefined()
  await ui.unmount()
})

test('the hint only promises clicks where the layout delivers them', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/a.ts' })
  const full = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 160, rows: 40, isFullscreen: true } })
  expect(await full.find({ type: 'Text', text: /Click the water/ })).toBeDefined()
  await full.unmount()
  const main = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 160, rows: 40, isFullscreen: false } })
  expect(await main.find({ type: 'Text', text: /Click the water/ })).toBeUndefined()
  expect(await main.find({ type: 'Text', text: /\/tui fullscreen/ })).toBeDefined()
  await main.unmount()
})

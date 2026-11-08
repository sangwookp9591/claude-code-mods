import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'cockpit',
  component: 'Pane',
  requestId: 'cockpit',
  props: {
    title: 'Cockpit',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

function engine(on: On) {
  mock.clock(on, { now: 1_000 })
  mock.store(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => (e.tool === 'Bash' && e.command === 'false' ? { result: {}, isError: true } : { result: {} }))
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
    await ui.unmount()
  }
})

test('the files tab counts reads and edits per file', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'x', new_string: 'y' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: /^a\.ts$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1r/ })).toBeDefined()
  await ui.unmount()
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
  expect(await ui.find({ type: 'Text', text: /context per turn/ })).toBeDefined()
  await ui.unmount()
})

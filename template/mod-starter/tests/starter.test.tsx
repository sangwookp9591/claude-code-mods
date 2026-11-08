import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: '__MOD__',
  component: 'Pane',
  requestId: '__MOD__',
  props: {
    title: '__TITLE__',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

function engine(on: On) {
  mock.clock(on, { now: 1_000 })
  mock.store(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
}

test('a tool call shows in the pane, on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Bash$/ }))?.text).toBe('Bash')
    await ui.unmount()
  }
})

test('the band can be hidden and comes back from the pane', async ($, on) => {
  engine(on)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const BAND = { plugin: '__MOD__', component: 'AbovePrompt', surface: 'terminal', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80 } } as const

  const band = await $.ui.mount(BAND)
  await band.press({ key: 'hide-band' })
  await band.unmount()

  const gone = await $.ui.mount(BAND)
  expect(await gone.find({ type: 'Button', text: /Hide/ })).toBeUndefined()
  await gone.unmount()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'show-band' })
  await ui.unmount()

  const back = await $.ui.mount(BAND)
  expect(await back.find({ type: 'Button', text: /Hide/ })).toBeDefined()
  await back.unmount()
})

test('a long value is cut to the columns the pane has, counting wide characters as two', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: '아주긴도구이름'.repeat(40), command: 'ls' })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 20 }, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /…$/ })
  expect(row?.text.length).toBeLessThanOrEqual(10)
  await ui.unmount()
})

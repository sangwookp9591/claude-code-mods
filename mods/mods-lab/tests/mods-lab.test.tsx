import type { CommandInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

const PANE = {
  plugin: 'mods-lab',
  component: 'Pane',
  requestId: 'mods-lab',
  props: {
    title: 'Mods lab',
    isFocused: true,
    bodyColumns: 72,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'mods-lab',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 72, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

const SURFACES = ['terminal', 'desktop'] as const
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const
const USAGE = { input_tokens: 9, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type Calls = { model: number; opened: string[]; clock: MockClock }

function engine(on: On, overrides: { denyHttp?: boolean; denyCommand?: boolean } = {}): Calls {
  const panes = new Set<string>()
  const calls: Calls = { model: 0, opened: [], clock: mock.clock(on, { now: 1_000 }) }
  mock.store(on)
  mock.env(on, { HOME: '/home/lab' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__mods-lab__${e.name}` } }))
  on('command.register', (_, e) =>
    overrides.denyCommand === true ? { deny: '"/lab" refused: test says no' } : { value: { command: e.name } },
  )
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('ui.open', (_, e) => {
    calls.opened.push(e.id)
    panes.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    panes.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...panes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine draws here'] }))
  on('fs.list', () => ({ value: [{ name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  on('fs.read', () => ({ value: JSON.stringify({ name: 'mods-lab' }) }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: `${e.argv.slice(1).join(' ')}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('settings.read', () => ({ value: { model: 'opus', theme: 'dark' } }))
  on('http.fetch', () =>
    overrides.denyHttp === true
      ? { deny: 'no network in tests' }
      : { value: { status: 200, ok: true, headers: {}, text: '<h1>Example Domain</h1>' } },
  )
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 12 }, rateLimits: [], cost: { usd: 0.25 } } }))
  on('session.version', () => ({ value: { version: '2.1.319' } }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'hi', toolUses: [] }] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.turns', () => ({ value: 3 }))
  on('model.complete', () => {
    calls.model += 1
    return { value: { isAnswered: true, text: 'pong', usage: USAGE } }
  })
  on('prompt.fill', (_, e) => ({ isFilled: true, text: e.text, cursor: e.text.length }))
  on('prompt.read', () => ({ value: { text: 'draft', cursor: 5 } }))
  on('tool.list', () => ({ value: [{ name: 'mcp__mods-lab__echo', description: 'echo', mcp: true }] }))
  on('tool.call', () => ({ result: {} }))
  on('command.list', () => ({
    value: [{ name: 'lab', description: 'lab', source: 'plugin', plugin: 'mods-lab' } as unknown as CommandInfo],
  }))
  return calls
}

test('a pressed probe shows its pass or its failure text, on terminal and desktop', async ($, on) => {
  engine(on, { denyHttp: true })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'reset' })
    await ui.press({ key: 'tab-data' })
    await ui.press({ key: 'probe-data.process' })
    expect((await ui.find({ key: 'probe-data.process' }))?.text).toMatch(/^✓ process\.run echo/)
    expect(await ui.find({ type: 'Text', text: /exit 0, stdout "mods-lab"/ })).toBeDefined()

    await ui.press({ key: 'probe-data.http' })
    expect((await ui.find({ key: 'probe-data.http' }))?.text).toMatch(/^✗ http\.fetch/)
    expect(await ui.find({ type: 'Text', text: /no network in tests/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 fail/ })).toBeDefined()
    await ui.unmount()
  }
})

test('run all passes the stubbed probes, reports the self tool call it cannot route, and skips the model probe', async ($, on) => {
  const calls = engine(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'run-all' })
  await calls.clock.advance(50)
  await ui.press({ key: 'tab-clock' })
  expect((await ui.find({ key: 'probe-clock.after' }))?.text).toMatch(/^✓/)
  const failed: string[] = []
  for (const group of ['ui', 'data', 'session', 'prompt', 'tools', 'commands', 'clock']) {
    await ui.press({ key: `tab-${group}` })
    for (const row of await ui.findAll({ type: 'Button' })) {
      if (row.key?.startsWith('probe-') === true && row.text.startsWith('✗')) failed.push(row.key)
    }
  }
  // From a press the engine does not route the mod's own $.tool.call through its own echo hook, while /lab run does.
  expect(failed).toEqual(['probe-tools.call'])
  await ui.press({ key: 'tab-tools' })
  expect(await ui.find({ type: 'Text', text: /answered \{\}/ })).toBeDefined()

  await ui.press({ key: 'tab-model' })
  expect((await ui.find({ key: 'probe-model.complete' }))?.text).toMatch(/^· .*\(costs tokens\)/)
  expect(calls.model).toBe(0)

  await ui.press({ key: 'tab-ui' })
  expect((await ui.find({ key: 'probe-ui.pane' }))?.text).toMatch(/^✓/)
  expect(await ui.find({ type: 'Text', text: /listed while open: true, listed after close: false/ })).toBeDefined()
  expect(calls.opened).toContain('mods-lab-scratch')
  await ui.unmount()
})

test('the model probe runs only when pressed and shows the reply', async ($, on) => {
  const calls = engine(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-model' })
  await ui.press({ key: 'probe-model.complete' })
  expect(calls.model).toBe(1)
  expect(await ui.find({ type: 'Text', text: /"pong", 9 in \/ 2 out tokens/ })).toBeDefined()
  await ui.unmount()
})

test('the echo tool answers the model and the hooks tab records it', async ($, on) => {
  engine(on)
  const ran = await $.tool.call({ tool: 'mcp__mods-lab__echo', text: 'hi' })
  expect(ran.result).toBe('echo: hi')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-hooks' })
    expect((await ui.find({ key: 'probe-hooks.echo' }))?.text).toMatch(/^✓/)
    expect((await ui.find({ key: 'probe-hooks.tool.call' }))?.text).toMatch(/^✓/)
    expect((await ui.find({ key: 'probe-hooks.prompt.submit' }))?.text).toMatch(/^·/)
    await ui.unmount()
  }
})

test('/lab opens the pane and /lab run prints every result', async ($, on) => {
  const calls = engine(on)
  const opened = await $.command.run({ command: 'lab', args: '', ...TYPED })
  expect(opened.text).toBe('Mods lab opened.')
  expect(calls.opened).toContain('mods-lab')

  const running = $.command.run({ command: 'lab', args: 'run', ...TYPED })
  await calls.clock.advance(50)
  const report = await running
  expect(report.text).toContain('+ data.process: exit 0, stdout "mods-lab"')
  expect(report.text).toContain('- model.complete: skipped (costs tokens)')
  expect(report.text).toContain('+ tools.call: answered "echo: ping"')
  expect(report.text).not.toContain('\nx ')
})

test('the band probe draws a band whose button records the pass', async ($, on) => {
  engine(on)
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'probe-ui.band' })
  expect((await pane.find({ key: 'probe-ui.band' }))?.text).toMatch(/^◐/)

  for (const surface of SURFACES) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: /mods-lab band/ })).toBeDefined()
    await band.unmount()
  }
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'band-ok' })
  await band.unmount()

  expect((await pane.find({ key: 'probe-ui.band' }))?.text).toMatch(/^✓/)
  expect(await pane.find({ type: 'Text', text: /band drawn and pressed on desktop/ })).toBeDefined()
  await pane.unmount()
})

test('a registration the engine refuses at session start shows as a failure', async ($, on) => {
  engine(on, { denyCommand: true })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-commands' })
  expect((await ui.find({ key: 'probe-commands.register' }))?.text).toMatch(/^✗/)
  expect(await ui.find({ type: 'Text', text: /test says no/ })).toBeDefined()
  await ui.press({ key: 'tab-tools' })
  expect((await ui.find({ key: 'probe-tools.register' }))?.text).toMatch(/^✓/)
  await ui.unmount()
})

test('results stored under an older shape are declined', async ($, on) => {
  engine(on)
  on('state.get', { key: 'results' }, () => ({ value: { value: { 'ui.toast': 'old' }, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /0\/38 pass · 0 fail/ })).toBeDefined()
  await ui.unmount()
})

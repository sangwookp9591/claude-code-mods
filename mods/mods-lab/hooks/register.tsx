import { atom, read, update } from 'claude-code'
import type { ButtonProps, EngineInterface, Register, RenderElement } from 'claude-code'

import type { LabGroup, LabResult, LabStatus } from '../types'
import { Heading, Rule, Tabs, clip, duration, tone } from './kit'
import type { Kit, Tone } from './kit'
import {
  COMMAND_SPEC,
  ECHO_SPEC,
  GROUPS,
  IDLE,
  PANE,
  PROBES,
  errorText,
  execute,
} from './probes'
import type { ActiveProbe, Outcome, Probe, ProbeContext } from './probes'

const TITLE = 'Mods lab'

const results = atom({ plugin: 'mods-lab', key: 'results' } as const, {}, { shape: 'results-1' })
const tab = atom({ plugin: 'mods-lab', key: 'tab' } as const, 'ui')

const GLYPH: Record<LabStatus, { glyph: string; tone: Tone }> = {
  idle: { glyph: '·', tone: 'muted' },
  running: { glyph: '◐', tone: 'warn' },
  pass: { glyph: '✓', tone: 'ok' },
  fail: { glyph: '✗', tone: 'bad' },
}

const seen = new Map<string, number>()

function bump(id: string): number {
  const n = (seen.get(id) ?? 0) + 1
  seen.set(id, n)
  return n
}

async function setResult($: EngineInterface, id: string, result: LabResult): Promise<void> {
  await update($, results, all => ({ ...all, [id]: result }))
}

async function runProbe($: EngineInterface, probe: ActiveProbe, ctx: ProbeContext): Promise<LabResult> {
  await setResult($, probe.id, { status: 'running', detail: 'running', ms: null })
  const startedAt = await $.clock.now()
  let outcome: Outcome
  try {
    outcome = await execute($, probe.id, ctx)
  } catch (error) {
    outcome = { ok: false, detail: errorText(error) }
  }
  const ms = (await $.clock.now()) - startedAt
  const result: LabResult =
    'waiting' in outcome
      ? { status: 'running', detail: outcome.waiting, ms: null }
      : { status: outcome.ok ? 'pass' : 'fail', detail: outcome.detail, ms }
  await setResult($, probe.id, result)
  return result
}

async function pressProbe($: EngineInterface, probe: Probe, ctx: ProbeContext): Promise<void> {
  if (probe.kind === 'active') {
    await runProbe($, probe, ctx)
    return
  }
  await setResult($, probe.id, { status: 'running', detail: `waiting for ${probe.hint}`, ms: null })
}

async function runAll($: EngineInterface, ctx: ProbeContext, group?: LabGroup): Promise<string[]> {
  const lines: string[] = []
  for (const probe of PROBES) {
    if (probe.kind !== 'active' || (group !== undefined && probe.group !== group)) continue
    if (probe.skip !== undefined) {
      lines.push(`- ${probe.id}: skipped (${probe.skip})`)
      continue
    }
    const r = await runProbe($, probe, ctx)
    lines.push(`${r.status === 'pass' ? '+' : 'x'} ${probe.id}: ${r.detail}`)
  }
  return lines
}

async function observe($: EngineInterface, id: string, detail: string): Promise<void> {
  await setResult($, id, { status: 'pass', detail, ms: null })
}

async function recordStartup($: EngineInterface, id: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
    await setResult($, id, { status: 'pass', detail: 'registered at session start', ms: null })
  } catch (error) {
    const detail = errorText(error)
    $.ui.log(`mods-lab: ${id} failed at session start: ${detail}`)
    await setResult($, id, { status: 'fail', detail, ms: null })
  }
}

async function armedNotice($: EngineInterface, toolUseId: string, tool: string): Promise<void> {
  const all = await read($, results)
  if (all['ui.notice']?.status !== 'running') return
  $.ui.notice(toolUseId, 'mods-lab: notice probe')
  await observe($, 'ui.notice', `sent under the ${tool} call; it shows only if that call asked permission`)
}

function probeRow(ui: Kit, w: number, probe: Probe, r: LabResult, onPress: ButtonProps['onPress']): RenderElement {
  const g = GLYPH[r.status]
  const suffix = probe.kind === 'active' && probe.skip !== undefined && r.status === 'idle' ? ` (${probe.skip})` : ''
  const ms = r.ms === null ? '' : ` ${duration(r.ms)}`
  const head = `${probe.title}${suffix}${ms}`
  return (
    <ui.Box flexDirection="column">
      <ui.Button key={`probe-${probe.id}`} plain onPress={onPress}>
        <ui.Text color={tone[g.tone]}>{g.glyph} </ui.Text>
        <ui.Text bold>{clip(head, Math.max(8, w - 2))}</ui.Text>
      </ui.Button>
      {r.detail !== '' && (
        <ui.Text color={r.status === 'fail' ? tone.bad : undefined} dimColor={r.status !== 'fail'}>
          {'  '}
          {clip(r.detail, Math.max(8, w - 2))}
        </ui.Text>
      )}
    </ui.Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await recordStartup($, 'tools.register', () => $.tool.register(ECHO_SPEC))
    await recordStartup($, 'commands.register', () => $.command.register(COMMAND_SPEC))
    return next(e)
  })

  on('command.run', { command: 'lab' }, async ($, e) => {
    if (e.args.trim() === 'run') {
      const lines = await runAll($, {})
      return { text: `mods-lab results:\n${lines.join('\n')}` }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Mods lab opened.' : `Mods lab not placed: ${opened.reason}` }
  }).catch(($, e, next) => (next.called ? next(e) : { text: 'mods-lab: /lab failed; see the debug log.' }))

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    void observe($, 'hooks.tool.call', `${bump('hooks.tool.call')} seen, last ${tool}`)
    await armedNotice($, e.tool_use_id, tool)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__mods-lab__echo' }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    const text = typeof input.text === 'string' ? input.text : ''
    void observe($, 'hooks.echo', `${bump('hooks.echo')} calls, last "${clip(text, 40)}"`)
    return { result: `echo: ${text}` }
  }).catch(() => ({ isError: true, result: 'mods-lab: the echo tool failed' }))

  on('prompt.submit', async ($, e, next) => {
    void observe($, 'hooks.prompt.submit', `${bump('hooks.prompt.submit')} seen, last ${e.text.length} chars`)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void observe($, 'hooks.turn.complete', `${bump('hooks.turn.complete')} seen, last ${duration(e.durationMs)}`)
    return done
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    void observe($, 'hooks.session.append', `${bump('hooks.session.append')} rows, last door ${e.door}`)
    return stored
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const band = (await read($, results))['ui.band']
    if (e.props.hasSurvey || band?.status !== 'running') return next(e)
    const ui = $.ui.resolve(e) as Kit
    return (
      <ui.Box gap={1}>
        <ui.Text color={tone.accent}>◆ mods-lab band</ui.Text>
        <ui.Text dimColor>drawn on {e.surface}</ui.Text>
        <ui.Button
          key="band-ok"
          label="band ok"
          onPress={p => void setResult($, 'ui.band', { status: 'pass', detail: `band drawn and pressed on ${p.surface}`, ms: null })}
        />
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: 'mods-lab-scratch' }, async ($, e) => {
    const ui = $.ui.resolve(e) as Kit
    return <ui.Text dimColor>mods-lab scratch pane: it closes itself.</ui.Text>
  })

  on('ui.render', { component: 'Pane', requestId: 'mods-lab' }, async ($, e) => {
    const ui = $.ui.resolve(e) as Kit
    const w = Math.max(24, e.props.bodyColumns)
    const all = await read($, results)
    const stored = await read($, tab)
    const active: LabGroup = GROUPS.some(g => g.id === stored) ? stored : 'ui'
    const rows = PROBES.map(p => ({ probe: p, r: all[p.id] ?? IDLE }))
    const passed = rows.filter(x => x.r.status === 'pass').length
    const failed = rows.filter(x => x.r.status === 'fail').length

    return (
      <ui.Box flexDirection="column" gap={1}>
        {Heading(ui, TITLE, `${passed}/${rows.length} pass · ${failed} fail`)}
        {Tabs(ui, GROUPS, active, id => void update($, tab, () => id))}
        <ui.Box gap={1}>
          <ui.Button key="run-all" label="Run all" hotkey="r" variant="primary" onPress={p => void runAll($, { surface: p.surface })} />
          <ui.Button key="run-tab" label="Run tab" hotkey="t" onPress={p => void runAll($, { surface: p.surface }, active)} />
          <ui.Button key="reset" label="Reset" hotkey="x" onPress={() => void update($, results, () => ({}))} />
        </ui.Box>
        {Rule(ui, w)}
        <ui.Box flexDirection="column">
          {rows
            .filter(x => x.probe.group === active)
            .map(x => probeRow(ui, w, x.probe, x.r, p => void pressProbe($, x.probe, { surface: p.surface })))}
        </ui.Box>
      </ui.Box>
    )
  })
}

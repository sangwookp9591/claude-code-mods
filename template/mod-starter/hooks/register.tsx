import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, Tab } from '../types'
import { FIELD_MAX, Heading, Rule, Stat, Tabs, cells, clip, tone } from './kit'
import type { Kit } from './kit'

const MOD = '__MOD__'
const PANE = MOD
const TITLE = '__TITLE__'

const items = atom({ plugin: '__MOD__', key: 'items' } as const, [], { shape: 'items-1' })
const tab = atom({ plugin: '__MOD__', key: 'tab' } as const, 'main')
const isBandHidden = atom({ plugin: '__MOD__', key: 'isBandHidden' } as const, false)

const TABS = [
  { id: 'main', label: 'Main', short: 'Mn', hotkey: '1' },
  { id: 'about', label: 'About', short: 'Ab', hotkey: '2' },
] as const satisfies readonly { id: Tab; label: string; short: string; hotkey: string }[]

async function togglePane($: EngineInterface): Promise<boolean> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) {
    await $.ui.close({ id: PANE })
    return false
  }
  await $.ui.open({ id: PANE, title: TITLE })
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: MOD, description: `Open or close the ${TITLE} pane` })
    return next(e)
  })

  on('command.run', { command: '__MOD__' }, async $ => ({
    text: (await togglePane($)) ? `${TITLE} opened.` : `${TITLE} closed.`,
  }))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const at = await $.clock.now()
    await update($, items, list => [...list, { id: e.tool_use_id, text: String(e.tool).slice(0, FIELD_MAX), at }].slice(-100))
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, items)
    if (e.props.hasSurvey || list.length === 0 || (await read($, isBandHidden))) return next(e)
    const ui = $.ui.resolve(e) as Kit
    const room = e.props.bodyColumns - cells(TITLE) - 14
    return (
      <ui.Box gap={1}>
        <ui.Text color={tone.accent}>◆</ui.Text>
        {room >= 4 && <ui.Text dimColor>{clip(`${list.length} items`, room)}</ui.Text>}
        <ui.Button key="open" label={TITLE} plain onPress={() => void togglePane($)} />
        <ui.Button key="hide-band" label="Hide" plain onPress={() => update($, isBandHidden, () => true)} />
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as Kit
    const w = Math.max(1, e.props.bodyColumns)
    const visible = Math.max(1, (e.props.scroll?.bodyRows ?? 20) - 8)
    const hidden = await read($, isBandHidden)
    const stored = await read($, tab)
    const active: Tab = TABS.some(t => t.id === stored) ? stored : 'main'
    const list = await read($, items)

    return (
      <ui.Box flexDirection="column" gap={1}>
        {Heading(ui, TITLE, w, `${list.length} items`)}
        <ui.Box gap={1} flexWrap="wrap">
          {Tabs(ui, TABS, active, w, id => void update($, tab, () => id))}
          {hidden && <ui.Button key="show-band" label="Show band" plain onPress={() => update($, isBandHidden, () => false)} />}
        </ui.Box>
        {Rule(ui, w)}
        {active === 'main' ? (
          <ui.Box flexDirection="column">
            {list.length === 0 && <ui.Text dimColor>Nothing yet.</ui.Text>}
            {list.slice(-visible).reverse().map(it => (
              <ui.Text key={`item-${it.id}`}>{clip(it.text, w)}</ui.Text>
            ))}
          </ui.Box>
        ) : (
          <ui.Box>{Stat(ui, 'items', String(list.length), 'accent')}</ui.Box>
        )}
      </ui.Box>
    )
  })
}

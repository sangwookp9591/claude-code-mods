import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, Tab } from '../types'
import { Heading, Rule, Stat, Tabs, clip, tone } from './kit'
import type { Kit } from './kit'

const MOD = '__MOD__'
const PANE = MOD
const TITLE = '__TITLE__'

const items = atom({ plugin: '__MOD__', key: 'items' } as const, [], { shape: 'items-1' })
const tab = atom({ plugin: '__MOD__', key: 'tab' } as const, 'main')
const isBandHidden = atom({ plugin: '__MOD__', key: 'isBandHidden' } as const, false)

const TABS = [
  { id: 'main', label: 'Main', hotkey: '1' },
  { id: 'about', label: 'About', hotkey: '2' },
] as const satisfies readonly { id: Tab; label: string; hotkey: string }[]

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
    await update($, items, list => [...list, { id: e.tool_use_id, text: String(e.tool), at }].slice(-100))
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, items)
    if (e.props.hasSurvey || list.length === 0 || (await read($, isBandHidden))) return next(e)
    const ui = $.ui.resolve(e) as Kit
    return (
      <ui.Box gap={1}>
        <ui.Text color={tone.accent}>◆</ui.Text>
        <ui.Text dimColor>{list.length} items</ui.Text>
        <ui.Button key="open" label={TITLE} plain onPress={() => void togglePane($)} />
        <ui.Button key="hide-band" label="×" plain onPress={() => update($, isBandHidden, () => true)} />
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as Kit
    const w = Math.max(20, e.props.bodyColumns)
    const stored = await read($, tab)
    const active: Tab = TABS.some(t => t.id === stored) ? stored : 'main'
    const list = await read($, items)

    return (
      <ui.Box flexDirection="column" gap={1}>
        {Heading(ui, TITLE, `${list.length} items`)}
        {Tabs(ui, TABS, active, id => void update($, tab, () => id))}
        {Rule(ui, w)}
        {active === 'main' ? (
          <ui.Box flexDirection="column">
            {list.length === 0 && <ui.Text dimColor>Nothing yet.</ui.Text>}
            {list.slice(-10).reverse().map(it => (
              <ui.Text>{clip(it.text, w)}</ui.Text>
            ))}
          </ui.Box>
        ) : (
          <ui.Box>{Stat(ui, 'items', String(list.length), 'accent')}</ui.Box>
        )}
      </ui.Box>
    )
  })
}

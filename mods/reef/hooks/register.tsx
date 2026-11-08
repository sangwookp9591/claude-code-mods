import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fish, Reef, Species } from '../types'

const PANE = 'reef'
const TITLE = 'Reef'
const STORE_KEY = 'reef'
const MAX_FISH = 12
const HATCH_EVERY = 4
const MIN_TANK = 12
const MAX_TANK = 30
const FIRST_FISH = 3

const EMPTY: Reef = { fish: [], hatched: 0, calls: 0, fed: 0, errors: 0, turns: 0, lastAt: 0 }

const reef = atom({ plugin: 'reef', key: 'reef' } as const, EMPTY, { shape: 'reef-1' })
const isWorking = atom({ plugin: 'reef', key: 'isWorking' } as const, false)
const picked = atom({ plugin: 'reef', key: 'picked' } as const, '')

const SPECIES: Record<string, Species> = {
  Read: 'minnow',
  NotebookRead: 'minnow',
  Grep: 'minnow',
  Glob: 'minnow',
  LS: 'minnow',
  Edit: 'angel',
  MultiEdit: 'angel',
  Write: 'angel',
  NotebookEdit: 'angel',
  Bash: 'puffer',
  BashOutput: 'puffer',
  WebFetch: 'jelly',
  WebSearch: 'jelly',
  Agent: 'whale',
  Task: 'whale',
}

const KIND: Record<Species, { word: string; sprite: string; from: string }> = {
  minnow: { word: 'minnow', sprite: '><>', from: 'reads and searches' },
  angel: { word: 'angelfish', sprite: '><((°>', from: 'edits' },
  puffer: { word: 'pufferfish', sprite: '<(°)>', from: 'shell commands' },
  jelly: { word: 'jellyfish', sprite: '{@}', from: 'web and MCP calls' },
  whale: { word: 'whale', sprite: '><===°>', from: 'subagents' },
  crab: { word: 'crab', sprite: '/(°°)\\', from: 'everything else' },
}

const NAMES = ['Mochi', 'Tofu', 'Bao', 'Pip', 'Juno', 'Ziggy', 'Dot', 'Miso', 'Nori', 'Yuzu', 'Taro', 'Pebble', 'Byte', 'Pixel', 'Rio', 'Hodu', 'Dubu', 'Bori', 'Kiwi', 'Sesame', 'Udon', 'Gimbap', 'Latte', 'Comet']

function speciesOf(tool: string): Species {
  return SPECIES[tool] ?? (tool.startsWith('mcp__') ? 'jelly' : 'crab')
}

function labelOf(input: Record<string, unknown>, cwd: string): string {
  for (const field of ['command', 'file_path', 'pattern', 'url', 'query', 'description']) {
    const v = input[field]
    if (typeof v === 'string' && v.length > 0) {
      const one = v.replace(/\s+/g, ' ')
      return cwd !== '' && one.startsWith(`${cwd}/`) ? one.slice(cwd.length + 1) : one
    }
  }
  return ''
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86_400)}d ago`
}

function isReef(v: unknown): v is Reef {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return Array.isArray(r.fish) && ['hatched', 'calls', 'fed', 'errors', 'turns', 'lastAt'].every(k => typeof r[k] === 'number')
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set(STORE_KEY, await read($, reef))
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

async function feed($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, reef, r => ({ ...r, fed: r.fed + 1, lastAt: at }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'reef', description: 'Open or close the Reef aquarium' })
    await $.command.register({ name: 'reef-reset', description: 'Release every fish and start a new reef' })
    const now = await read($, reef)
    if (now.hatched === 0) {
      const saved = await $.store.get(STORE_KEY)
      if (isReef(saved)) await update($, reef, () => saved)
    }
    return next(e)
  })

  on('command.run', { command: 'reef' }, async $ => ({
    text: (await togglePane($)) ? 'Reef opened. Click the water to feed the fish.' : 'Reef closed.',
  }))

  on('command.run', { command: 'reef-reset' }, async $ => {
    await update($, reef, () => EMPTY)
    await update($, picked, () => '')
    await save($)
    return { text: 'Every fish swam off. A new reef is waiting for the next tool call.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isWorking, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      await update($, isWorking, () => false)
      await update($, reef, r => ({ ...r, turns: r.turns + 1, lastAt: at }))
      await save($)
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if ('deny' in ran) return ran
    const at = await $.clock.now()
    const input = e as unknown as Record<string, unknown>
    const cwd = await $.session.cwd().catch(() => '')
    const before = await read($, reef)
    const calls = before.calls + 1
    const isEarly = before.fish.length < FIRST_FISH
    const hatches = !ran.isError && (isEarly || calls % HATCH_EVERY === 0)
    const baby: Fish | null = hatches
      ? { id: e.tool_use_id, name: NAMES[before.hatched % NAMES.length] ?? 'Fish', species: speciesOf(e.tool), tool: e.tool, label: clip(labelOf(input, cwd), 60), bornAt: at }
      : null
    await update($, reef, r => ({
      ...r,
      calls,
      lastAt: at,
      fed: ran.isError ? r.fed : r.fed + 1,
      errors: ran.isError ? r.errors + 1 : r.errors,
      hatched: baby ? r.hatched + 1 : r.hatched,
      fish: baby ? [...r.fish, baby].slice(-MAX_FISH) : r.fish,
    }))
    if (baby && (before.hatched + 1) % 10 === 0) $.ui.toast(`Reef: ${baby.name} is fish #${before.hatched + 1}`)
    return ran
  })

  on('ui.message', async ($, e, next) => {
    if (!e.module.endsWith('tank.tsx')) return next(e)
    const data = (e.data ?? {}) as { pick?: unknown; feed?: unknown }
    if (typeof data.pick === 'string') await update($, picked, () => data.pick as string)
    if (data.feed === true) await feed($)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const w = Math.max(24, e.props.bodyColumns)
    const r = await read($, reef)
    const working = await read($, isWorking)
    const pick = await read($, picked)
    const now = await $.clock.now()
    const chosen = r.fish.find(f => f.id === pick)
    const hasClient = e.surface === 'terminal' || e.surface === 'desktop'
    const asleep = !working && r.lastAt > 0 && now - r.lastAt > 45_000

    const stats = `${r.fish.length} fish · ${r.hatched} hatched · fed ${r.fed} · ${r.turns} turns`
    const mood = r.fish.length === 0 ? 'empty' : asleep ? 'asleep' : working ? 'feeding' : 'calm'
    const about = chosen
      ? `${chosen.name} the ${KIND[chosen.species].word} · hatched from ${chosen.tool}${chosen.label ? ` ${chosen.label}` : ''} · ${ago(now - chosen.bornAt)}`
      : r.fish.length === 0
        ? `The reef is empty. The first tool calls Claude makes hatch fish, and one more hatches every ${HATCH_EVERY} calls after that.`
        : hasClient
          ? 'Click the water to drop food. Click a fish to meet it. Arrow keys and f work after a click.'
          : 'Open this pane in the terminal or the desktop app to watch the fish swim.'

    const tank = hasClient && 'Client' in ui ? (
      <ui.Client
        key="tank"
        module="./tank.tsx"
        width="100%"
        height={Math.min(MAX_TANK, Math.max(MIN_TANK, (e.props.scroll?.bodyRows ?? 30) - 12))}
        props={{ fish: r.fish.map(f => ({ id: f.id, name: f.name, species: f.species })), fed: r.fed, errors: r.errors, turns: r.turns, isWorking: working, lastAt: r.lastAt, now, picked: pick }}
      />
    ) : (
      <ui.Box flexDirection="column">
        {r.fish.map(f => (
          <ui.Text key={`f-${f.id}`}>
            <ui.Text color="claude">{KIND[f.species].sprite.padEnd(8)}</ui.Text>
            {clip(`${f.name} the ${KIND[f.species].word}`, Math.max(8, w - 9))}
          </ui.Text>
        ))}
      </ui.Box>
    )

    return (
      <ui.Box flexDirection="column" gap={1}>
        <ui.Box justifyContent="space-between">
          <ui.Text bold color="suggestion">
            ≋ Reef
          </ui.Text>
          <ui.Text dimColor>{clip(`${mood} · ${stats}`, Math.max(4, w - 9))}</ui.Text>
        </ui.Box>
        {tank}
        <ui.Text color={chosen ? 'claude' : undefined} dimColor={!chosen}>
          {about}
        </ui.Text>
        <ui.Box gap={1} flexWrap="wrap">
          <ui.Button key="feed" label="Feed" hotkey="f" variant="primary" onPress={() => feed($)} />
          {chosen && <ui.Button key="unpick" label="Let go" plain onPress={() => update($, picked, () => '')} />}
        </ui.Box>
        {w >= 60 && (
          <ui.Text dimColor>
            {(Object.keys(KIND) as Species[]).map(s => `${KIND[s].sprite} ${KIND[s].from}`).join('   ')}
          </ui.Text>
        )}
      </ui.Box>
    )
  })
}

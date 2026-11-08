import type { ClientModule, RenderElement } from 'claude-code'

type Blip = {
  id: string
  lane: string
  label: string
  startedAt: number
  endedAt: number | null
  status: 'running' | 'ok' | 'error' | 'blocked'
}

export type RadarProps = {
  blips: Blip[]
  now: number
  windowMs: number
  picked: string
}

type RadarState = { propsNow: number; elapsed: number; frame: number; cursor: number | null }

const LANES: readonly { id: string; label: string; color: string }[] = [
  { id: 'read', label: 'read ', color: 'suggestion' },
  { id: 'find', label: 'find ', color: 'suggestion' },
  { id: 'edit', label: 'edit ', color: 'claude' },
  { id: 'run', label: 'run  ', color: 'bashBorder' },
  { id: 'web', label: 'web  ', color: 'permission' },
  { id: 'agent', label: 'agent', color: 'success' },
  { id: 'other', label: 'other', color: 'subtle' },
]

const PULSE = '◐◓◑◒'
const TICK_MS = 125
const GUTTER = 7

function glyphOf(b: Blip, frame: number): string {
  if (b.status === 'running') return PULSE.charAt(frame % PULSE.length)
  if (b.status === 'error') return '✗'
  if (b.status === 'blocked') return '⊘'
  return '●'
}

function colorOf(b: Blip, lane: string): string {
  if (b.status === 'error') return 'error'
  if (b.status === 'blocked') return 'error'
  if (b.status === 'running') return 'warning'
  return LANES.find(l => l.id === lane)?.color ?? 'subtle'
}

type Cell = { ch: string; color?: string; dim?: boolean; inverse?: boolean }

function laneCells(blips: readonly Blip[], lane: string, now: number, windowMs: number, width: number, frame: number, picked: string, sweep: number): Cell[] {
  const cells: Cell[] = Array.from({ length: width }, (_, i) => (i === sweep ? { ch: '┊', dim: true } : { ch: '·', dim: true }))
  const col = (t: number) => Math.round((width - 1) * (1 - Math.min(1, Math.max(0, (now - t) / windowMs))))
  for (const b of blips) {
    if (b.lane !== lane) continue
    const end = b.endedAt ?? now
    if (now - end > windowMs) continue
    const a = col(b.startedAt)
    const z = col(end)
    const color = colorOf(b, lane)
    for (let x = a; x < z; x += 1) cells[x] = { ch: '━', color }
    cells[z] = { ch: glyphOf(b, frame), color, inverse: b.id === picked }
  }
  return cells
}

function runs(cells: readonly Cell[]): Cell[] {
  const out: Cell[] = []
  for (const c of cells) {
    const last = out.at(-1)
    if (last && last.color === c.color && last.dim === c.dim && last.inverse === c.inverse) last.ch += c.ch
    else out.push({ ...c })
  }
  return out
}

function visible(p: RadarProps, now: number): Blip[] {
  return p.blips.filter(b => now - (b.endedAt ?? now) <= p.windowMs).sort((a, b) => a.startedAt - b.startedAt)
}

const Radar: ClientModule<RadarProps, RadarState> = (p, surface) => {
  const { Box, Text } = surface.elements
  const st = surface.state
  if (st === undefined) {
    surface.every(TICK_MS, () => {
      const cur = surface.state
      if (cur === undefined) return
      surface.setState({ ...cur, elapsed: cur.elapsed + TICK_MS, frame: cur.frame + 1 })
    })
    surface.setState({ propsNow: p.now, elapsed: 0, frame: 0, cursor: null })
  }
  const state: RadarState = st ?? { propsNow: p.now, elapsed: 0, frame: 0, cursor: null }
  const elapsed = state.propsNow === p.now ? state.elapsed : 0
  if (st !== undefined && state.propsNow !== p.now) surface.setState({ ...state, propsNow: p.now, elapsed: 0 })
  const now = p.now + elapsed
  const width = Math.max(10, (surface.columns || 56) - GUTTER - 1)
  const sweep = Math.floor((state.frame * 2) % (width * 2)) < width ? Math.floor((state.frame * 2) % width) : -1
  const shown = visible(p, now)
  const running = shown.filter(b => b.status === 'running').length

  surface.onKey(k => {
    const list = visible(p, now)
    if (list.length === 0) return
    const at = Math.max(0, list.findIndex(b => b.id === p.picked))
    if (k.key === 'left' || k.key === 'right') {
      const next = list[Math.min(list.length - 1, Math.max(0, at + (k.key === 'left' ? -1 : 1)))]
      if (next) surface.post({ pick: next.id })
    }
  })
  surface.onPointer(e => {
    if (e.type !== 'down') return
    const lane = LANES[e.y - 1]
    if (!lane || e.x < GUTTER) return
    const x = e.x - GUTTER
    let best: Blip | undefined
    let dist = Infinity
    for (const b of visible(p, now)) {
      if (b.lane !== lane.id) continue
      const bx = Math.round((width - 1) * (1 - Math.min(1, (now - (b.endedAt ?? now)) / p.windowMs)))
      if (Math.abs(bx - x) < dist) {
        dist = Math.abs(bx - x)
        best = b
      }
    }
    if (best && dist <= 3) surface.post({ pick: best.id })
  })

  const rows: RenderElement[] = LANES.map(l => (
    <Box key={l.id}>
      <Text dimColor>{` ${l.label} `}</Text>
      {runs(laneCells(shown, l.id, now, p.windowMs, width, state.frame, p.picked, sweep)).map((c, i) => (
        <Text key={`${l.id}-${i}`} color={c.color} dimColor={c.dim} inverse={c.inverse}>
          {c.ch}
        </Text>
      ))}
    </Box>
  ))
  const secs = Math.round(p.windowMs / 1000)
  const axis = `${' '.repeat(GUTTER)}${`-${secs}s`.padEnd(Math.floor(width / 2))}${`-${Math.round(secs / 2)}s`.padEnd(Math.ceil(width / 2) - 3)}now`

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="claude">
          {` ◉ RADAR `}
          <Text dimColor>{`last ${secs}s · ${shown.length} calls`}</Text>
        </Text>
        <Text color={running > 0 ? 'warning' : 'subtle'}>{running > 0 ? `${PULSE.charAt(state.frame % 4)} ${running} running ` : 'idle '}</Text>
      </Box>
      {rows}
      <Text dimColor>{axis}</Text>
    </Box>
  )
}

export default Radar

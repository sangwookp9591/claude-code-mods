import type { ClientModule, RenderElement } from 'claude-code'

type Species = 'minnow' | 'angel' | 'puffer' | 'jelly' | 'whale' | 'crab'

export type TankProps = {
  fish: { id: string; name: string; species: Species }[]
  fed: number
  errors: number
  turns: number
  isWorking: boolean
  lastAt: number
  now: number
  picked: string
}

type Swim = { id: string; species: Species; x: number; y: number; dx: number; fullUntil: number }
type Dot = { x: number; y: number; age: number }

type TankState = {
  frame: number
  propsNow: number
  elapsed: number
  seed: number
  isWorking: boolean
  lastAt: number
  swims: Swim[]
  pellets: Dot[]
  wrecks: Dot[]
  bubbles: Dot[]
  seenFed: number
  seenErrors: number
}

type Cell = { ch: string; color?: string; dim?: boolean; inverse?: boolean; bold?: boolean }

const TICK_MS = 150
const SLEEP_MS = 45_000
const HEIGHT = 14

const SPRITES: Record<Species, { right: string; left: string; color: string; speed: number }> = {
  minnow: { right: '><>', left: '<><', color: 'suggestion', speed: 0.9 },
  angel: { right: '><((°>', left: '<°))><', color: 'claude', speed: 0.55 },
  puffer: { right: '<(°)>', left: '<(°)>', color: 'bashBorder', speed: 0.35 },
  jelly: { right: '{@}', left: '{@}', color: 'permission', speed: 0.2 },
  whale: { right: '><===°>', left: '<°===><', color: 'success', speed: 0.3 },
  crab: { right: '/(°°)\\', left: '/(°°)\\', color: 'warning', speed: 0.25 },
}

function rand(seed: number): [number, number] {
  const next = (seed * 1103515245 + 12345) % 2147483648
  return [next / 2147483648, next]
}

function water(ht: number): { top: number; bottom: number } {
  return { top: 1, bottom: ht - 3 }
}

function spawn(f: { id: string; species: Species }, w: number, ht: number, seed: number, entering: boolean): [Swim, number] {
  const [a, s1] = rand(seed)
  const [b, s2] = rand(s1)
  const { top, bottom } = water(ht)
  const len = SPRITES[f.species].right.length
  const y = f.species === 'crab' ? ht - 2 : top + Math.floor(b * (bottom - top + 1))
  const x = entering ? -len : Math.floor(a * Math.max(1, w - len))
  return [{ id: f.id, species: f.species, x, y, dx: entering || a < 0.5 ? 1 : -1, fullUntil: 0 }, s2]
}

function reconcile(st: TankState, p: TankProps, w: number, ht: number): TankState {
  let seed = st.seed
  const known = new Set(st.swims.map(s => s.id))
  const alive = new Set(p.fish.map(f => f.id))
  const swims = st.swims.filter(s => alive.has(s.id))
  for (const f of p.fish) {
    if (known.has(f.id)) continue
    const [s, next] = spawn(f, w, ht, seed, true)
    seed = next
    swims.push(s)
  }
  const pellets = [...st.pellets]
  for (let i = 0; i < Math.min(6, p.fed - st.seenFed); i += 1) {
    const [a, next] = rand(seed)
    seed = next
    pellets.push({ x: 2 + Math.floor(a * Math.max(1, w - 4)), y: 1, age: 0 })
  }
  const wrecks = [...st.wrecks]
  for (let i = 0; i < Math.min(3, p.errors - st.seenErrors); i += 1) {
    const [a, next] = rand(seed)
    seed = next
    wrecks.push({ x: 2 + Math.floor(a * Math.max(1, w - 4)), y: 1, age: 0 })
  }
  return {
    ...st,
    seed,
    swims,
    pellets: pellets.slice(-24),
    wrecks: wrecks.slice(-8),
    propsNow: p.now,
    elapsed: 0,
    isWorking: p.isWorking,
    lastAt: p.lastAt,
    seenFed: Math.max(st.seenFed, p.fed),
    seenErrors: Math.max(st.seenErrors, p.errors),
  }
}

function isAsleep(st: TankState): boolean {
  return !st.isWorking && st.propsNow + st.elapsed - st.lastAt > SLEEP_MS
}

function mouth(s: Swim): number {
  const len = SPRITES[s.species].right.length
  return s.dx > 0 ? s.x + len - 1 : s.x
}

function step(st: TankState, w: number, ht: number): TankState {
  const frame = st.frame + 1
  const asleep = isAsleep(st)
  const { top, bottom } = water(ht)
  let seed = st.seed
  let pellets = st.pellets
    .map(d => ({ ...d, y: frame % 2 === 0 && d.y < ht - 2 ? d.y + 1 : d.y, age: d.age + 1 }))
    .filter(d => d.age < 160)

  const swims = st.swims.map(s => {
    const sprite = SPRITES[s.species]
    const len = sprite.right.length
    let { x, y, dx } = s
    let fullUntil = s.fullUntil
    const food = asleep || s.species === 'crab' ? undefined : pellets.reduce<Dot | undefined>((best, d) => (Math.abs(d.x - x) < 30 && (!best || Math.abs(d.x - x) + Math.abs(d.y - y) < Math.abs(best.x - x) + Math.abs(best.y - y)) ? d : best), undefined)
    const speed = sprite.speed * (asleep ? 0.15 : food ? 1.6 : 1)
    if (food) {
      dx = food.x >= mouth(s) ? 1 : -1
      if (frame % 3 === 0 && food.y !== y) y += food.y > y ? 1 : -1
    } else {
      const [r, next] = rand(seed)
      seed = next
      if (r < 0.01) dx = -dx
      if (s.species === 'jelly') y = Math.min(bottom, Math.max(top, y + (frame % 24 < 12 ? (frame % 4 === 0 ? -1 : 0) : frame % 4 === 0 ? 1 : 0)))
      else if (s.species !== 'crab' && r > 0.96) y = Math.min(bottom, Math.max(top, y + (r > 0.98 ? 1 : -1)))
    }
    x += dx * speed
    if (x <= 0 && dx < 0) dx = 1
    if (x >= w - len && dx > 0 && x > 0) dx = -1
    const eaten = pellets.find(d => Math.abs(d.x - mouth({ ...s, x, dx })) <= 1 && d.y === y)
    if (eaten) {
      pellets = pellets.filter(d => d !== eaten)
      fullUntil = frame + 12
    }
    return { ...s, x, y, dx, fullUntil }
  })

  const wrecks = st.wrecks.map(d => ({ ...d, y: frame % 3 === 0 && d.y < ht - 2 ? d.y + 1 : d.y, age: d.age + 1 })).filter(d => d.age < 90)
  let bubbles = st.bubbles.map(d => ({ ...d, y: frame % 2 === 0 ? d.y - 1 : d.y, age: d.age + 1 })).filter(d => d.y >= top)
  if (frame % (asleep ? 30 : 7) === 0) bubbles = [...bubbles, { x: w - 4, y: bottom, age: 0 }]
  for (const s of swims) {
    const [r, next] = rand(seed)
    seed = next
    if (!asleep && r < 0.01) bubbles.push({ x: Math.round(mouth(s)), y: s.y - 1, age: 0 })
  }

  return { ...st, frame, elapsed: st.elapsed + TICK_MS, seed, swims, pellets, wrecks, bubbles: bubbles.slice(-30) }
}

function put(grid: Cell[][], at: number, y: number, cell: Cell): void {
  const x = Math.round(at)
  const row = grid[y]
  if (!row || x < 0 || x >= row.length) return
  row[x] = cell
}

function draw(st: TankState, p: TankProps, w: number, ht: number): Cell[][] {
  const asleep = isAsleep(st)
  const grid: Cell[][] = Array.from({ length: ht }, () => Array.from({ length: w }, () => ({ ch: ' ' })))
  const wave = '~^~~-~^-~~'
  for (let x = 0; x < w; x += 1) put(grid, x, 0, { ch: wave.charAt((x + st.frame) % wave.length), color: 'suggestion', dim: asleep })
  for (let x = 0; x < w; x += 1) put(grid, x, ht - 1, { ch: x % 7 === 3 ? '▒' : '░', color: 'warning', dim: true })

  const plants = Math.min(12, 1 + p.turns)
  const tall = Math.min(5, 1 + Math.floor(p.turns / 3))
  for (let i = 0; i < plants; i += 1) {
    const px = Math.round(((i + 0.5) * (w - 8)) / plants) + 1
    for (let k = 0; k < tall - (i % 2); k += 1) {
      const sway = (Math.floor(st.frame / 6) + k + i) % 2 === 0
      put(grid, px, ht - 2 - k, { ch: sway ? '(' : ')', color: 'success', dim: asleep })
    }
  }
  const chest = st.frame % 40 < 4 && !asleep ? '[$]' : '[=]'
  for (let i = 0; i < 3; i += 1) put(grid, 2 + i, ht - 2, { ch: chest.charAt(i), color: 'warning', bold: true })
  put(grid, w - 4, ht - 2, { ch: 'Y', color: 'subtle' })

  for (const d of st.bubbles) put(grid, d.x, d.y, { ch: d.age < 4 ? '.' : d.age < 10 ? 'o' : '°', color: 'suggestion', dim: true })
  for (const d of st.pellets) put(grid, d.x, d.y, { ch: d.y >= ht - 2 ? '.' : '·', color: 'claude', bold: true })
  for (const d of st.wrecks) put(grid, d.x, d.y, { ch: '✗', color: 'error', bold: true })

  const names = new Map(p.fish.map(f => [f.id, f.name]))
  for (const s of st.swims) {
    const sprite = SPRITES[s.species]
    const body = s.dx > 0 ? sprite.right : sprite.left
    const x0 = Math.round(s.x)
    const picked = s.id === p.picked
    for (let i = 0; i < body.length; i += 1) put(grid, x0 + i, s.y, { ch: body.charAt(i), color: sprite.color, dim: asleep && !picked, inverse: picked, bold: picked })
    if (asleep && (st.frame + x0) % 20 < 12) put(grid, x0 + body.length, s.y - 1, { ch: 'z', color: 'subtle', dim: true })
    else if (s.fullUntil > st.frame) put(grid, mouth(s) + (s.dx > 0 ? 1 : -1), s.y - 1, { ch: '♥', color: 'error' })
    if (picked) {
      const tag = names.get(s.id) ?? ''
      const tx = Math.max(0, Math.min(w - tag.length, x0))
      for (let i = 0; i < tag.length; i += 1) put(grid, tx + i, Math.max(1, s.y - 1), { ch: tag.charAt(i), color: sprite.color, bold: true })
    }
  }
  return grid
}

function runs(cells: readonly Cell[]): Cell[] {
  const out: Cell[] = []
  for (const c of cells) {
    const last = out.at(-1)
    if (last && last.color === c.color && last.dim === c.dim && last.inverse === c.inverse && last.bold === c.bold) last.ch += c.ch
    else out.push({ ...c })
  }
  return out
}

function fishAt(st: TankState, x: number, y: number): Swim | undefined {
  return st.swims.find(s => {
    const x0 = Math.round(s.x)
    return y === s.y && x >= x0 - 1 && x <= x0 + SPRITES[s.species].right.length
  })
}

const Tank: ClientModule<TankProps, TankState> = (p, surface) => {
  const { Box, Text } = surface.elements
  const w = Math.max(20, surface.columns || 60)
  const ht = Math.max(8, surface.rows || HEIGHT)
  const st = surface.state

  if (st === undefined) {
    surface.every(TICK_MS, () => {
      const cur = surface.state
      if (cur !== undefined) surface.setState(step(cur, Math.max(20, surface.columns || 60), Math.max(8, surface.rows || HEIGHT)))
    })
  }

  let state: TankState
  if (st === undefined) {
    let seed = 7
    const swims: Swim[] = []
    for (const f of p.fish) {
      const [s, next] = spawn(f, w, ht, seed, false)
      seed = next
      swims.push(s)
    }
    state = { frame: 0, propsNow: p.now, elapsed: 0, seed, isWorking: p.isWorking, lastAt: p.lastAt, swims, pellets: [], wrecks: [], bubbles: [], seenFed: p.fed, seenErrors: p.errors }
    surface.setState(state)
  } else if (st.propsNow !== p.now) {
    state = reconcile(st, p, w, ht)
    surface.setState(state)
  } else state = st

  surface.onPointer(e => {
    if (e.type !== 'down') return
    const cur = surface.state
    if (cur === undefined) return
    const hit = fishAt(cur, e.x, e.y)
    if (hit) {
      surface.post({ pick: hit.id === p.picked ? '' : hit.id })
      return
    }
    const { top, bottom } = water(ht)
    if (e.y < top || e.y > bottom) return
    surface.setState({ ...cur, pellets: [...cur.pellets, { x: e.x, y: e.y, age: 0 }], seenFed: cur.seenFed + 1 })
    surface.post({ feed: true })
  })

  surface.onKey(k => {
    const cur = surface.state
    if (cur === undefined) return
    if (k.key === 'f') {
      const [a, seed] = rand(cur.seed)
      surface.setState({ ...cur, seed, pellets: [...cur.pellets, { x: 2 + Math.floor(a * (w - 4)), y: 1, age: 0 }], seenFed: cur.seenFed + 1 })
      surface.post({ feed: true })
    }
    if ((k.key === 'left' || k.key === 'right') && p.fish.length > 0) {
      const at = p.fish.findIndex(f => f.id === p.picked)
      const next = p.fish[(at + (k.key === 'left' ? p.fish.length - 1 : 1) + p.fish.length) % p.fish.length]
      if (next) surface.post({ pick: next.id })
    }
  })

  const rows: RenderElement[] = draw(state, p, w, ht).map((row, y) => (
    <Box key={`r${y}`}>
      {runs(row).map((c, i) => (
        <Text key={`r${y}-${i}`} color={c.color} dimColor={c.dim} inverse={c.inverse} bold={c.bold}>
          {c.ch}
        </Text>
      ))}
    </Box>
  ))
  return <Box flexDirection="column">{rows}</Box>
}

export default Tank

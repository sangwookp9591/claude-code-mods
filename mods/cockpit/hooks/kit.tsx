import type { BoxProps, ButtonProps, Color, ElementConstructor, RenderElement, TextProps } from 'claude-code'

export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export const tone = {
  accent: 'claude',
  ok: 'success',
  warn: 'warning',
  bad: 'error',
  muted: 'subtle',
  info: 'suggestion',
} as const satisfies Record<string, Color>

export type Tone = keyof typeof tone

export const LEVELS = { warn: 60, bad: 85 } as const

export function levelTone(pct: number): Tone {
  if (pct >= LEVELS.bad) return 'bad'
  if (pct >= LEVELS.warn) return 'warn'
  return 'ok'
}

export function levelWord(pct: number): string {
  if (pct >= LEVELS.bad) return 'nearly full'
  if (pct >= LEVELS.warn) return 'filling'
  return 'roomy'
}

export const FIELD_MAX = 240

function cellWidth(cp: number): number {
  if (cp === 0x200d || (cp >= 0x300 && cp <= 0x36f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2
  return 1
}

export function cells(text: string): number {
  let n = 0
  for (const ch of text) n += cellWidth(ch.codePointAt(0) ?? 0)
  return n
}

function take(chars: readonly string[], width: number): string[] {
  const out: string[] = []
  let used = 0
  for (const ch of chars) {
    const w = cellWidth(ch.codePointAt(0) ?? 0)
    if (used + w > width) break
    out.push(ch)
    used += w
  }
  return out
}

export function clip(text: string, width: number): string {
  const safe = text.length > FIELD_MAX * 2 ? text.slice(0, FIELD_MAX * 2) : text
  if (width <= 0) return ''
  if (cells(safe) <= width) return safe
  return width === 1 ? '…' : `${take([...safe], width - 1).join('')}…`
}

export function clipMiddle(text: string, width: number): string {
  const safe = text.length > FIELD_MAX * 2 ? `…${text.slice(-FIELD_MAX * 2)}` : text
  if (width <= 0) return ''
  if (cells(safe) <= width) return safe
  if (width < 6) return clip(safe, width)
  const chars = [...safe]
  const slash = safe.lastIndexOf('/')
  const base = slash >= 0 ? safe.slice(slash) : ''
  const tailWant = Math.min(cells(base) || Math.ceil(width / 2), width - 2)
  const tail = take([...chars].reverse(), tailWant).reverse()
  const head = take(chars, width - 1 - cells(tail.join('')))
  return `${head.join('')}…${tail.join('')}`
}

export function bar(pct: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  const full = Math.round((clamped / 100) * width)
  return '█'.repeat(full) + '░'.repeat(Math.max(0, width - full))
}

const BARS = '▁▂▃▄▅▆▇█'

export function sparkGlyph(v: number, max: number): string {
  if (max <= 0) return BARS.charAt(0)
  return BARS.charAt(Math.max(0, Math.min(BARS.length - 1, Math.round((v / max) * (BARS.length - 1)))))
}

export function Spark(
  ui: Kit,
  key: string,
  values: readonly number[],
  width: number,
  opts: { pctScale?: boolean; tone?: Tone } = {},
): RenderElement {
  const tail = values.slice(-Math.max(1, Math.min(512, width)))
  const max = opts.pctScale ? 100 : Math.max(...tail, 0)
  const runs: { t: Tone; s: string }[] = []
  for (const v of tail) {
    const t = opts.pctScale ? levelTone(v) : (opts.tone ?? 'accent')
    const last = runs.at(-1)
    if (last && last.t === t) last.s += sparkGlyph(v, max)
    else runs.push({ t, s: sparkGlyph(v, max) })
  }
  return (
    <ui.Text key={key}>
      {runs.map((r, i) => (
        <ui.Text key={`${key}-${i}`} color={tone[r.t]}>
          {r.s}
        </ui.Text>
      ))}
    </ui.Text>
  )
}

export function Meter(ui: Kit, label: string, pct: number | null, width: number): RenderElement {
  if (pct === null) return <ui.Text dimColor>{label} n/a</ui.Text>
  const t = levelTone(pct)
  const tag = ` ${Math.round(pct)}% ${levelWord(pct)}`
  const room = width - cells(label) - 1 - cells(tag)
  return (
    <ui.Box>
      <ui.Text dimColor>{label} </ui.Text>
      {room >= 4 && <ui.Text color={tone[t]}>{bar(pct, room)}</ui.Text>}
      <ui.Text color={tone[t]} bold>
        {tag}
      </ui.Text>
    </ui.Box>
  )
}

export function Heading(ui: Kit, text: string, width: number, right?: string): RenderElement {
  const title = clip(`◆ ${text}`, width)
  const room = width - cells(title) - 2
  return (
    <ui.Box justifyContent="space-between">
      <ui.Text color={tone.accent} bold>
        {title}
      </ui.Text>
      {right !== undefined && room >= Math.min(12, cells(right)) && <ui.Text dimColor>{clip(right, room)}</ui.Text>}
    </ui.Box>
  )
}

export function Stat(ui: Kit, label: string, value: string, t: Tone = 'info'): RenderElement {
  return (
    <ui.Box flexDirection="column" marginRight={2}>
      <ui.Text dimColor>{label}</ui.Text>
      <ui.Text color={tone[t]} bold>
        {value}
      </ui.Text>
    </ui.Box>
  )
}

export function Tabs<T extends string>(
  ui: Kit,
  tabs: readonly { id: T; label: string; short: string; hotkey: string }[],
  active: T,
  width: number,
  onPick: (id: T) => void,
): RenderElement {
  const full = tabs.reduce((n, t) => n + cells(t.label) + 6, 0) <= width
  return (
    <ui.Box gap={1} flexWrap="wrap">
      {tabs.map(t => (
        <ui.Button
          key={`tab-${t.id}`}
          label={`${t.id === active ? '▸' : ' '}${full ? t.label : t.short}`}
          hotkey={t.hotkey}
          variant={t.id === active ? 'primary' : 'secondary'}
          onPress={() => onPick(t.id)}
        />
      ))}
    </ui.Box>
  )
}

export function Pager(ui: Kit, page: number, pageSize: number, total: number, noun: string, onPage: (page: number) => void): RenderElement {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const at = Math.min(page, pages - 1)
  const from = at * pageSize + 1
  const to = Math.min(total, from + pageSize - 1)
  return (
    <ui.Box gap={1} flexWrap="wrap">
      <ui.Text dimColor>{`${from}–${to} of ${total} ${noun}`}</ui.Text>
      {at > 0 && <ui.Button key="page-newer" label="Newer" plain onPress={() => onPage(at - 1)} />}
      {at < pages - 1 && <ui.Button key="page-older" label="Older" plain onPress={() => onPage(at + 1)} />}
    </ui.Box>
  )
}

export function Rule(ui: Kit, width: number): RenderElement {
  return <ui.Text dimColor>{'─'.repeat(Math.max(1, width))}</ui.Text>
}

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  const m = Math.floor(s / 60)
  return `${m}m${Math.round(s % 60)}s`
}

export function usd(v: number | null): string {
  return v === null ? 'n/a' : `$${v.toFixed(v < 1 ? 3 : 2)}`
}

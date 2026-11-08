import type {
  BoxProps,
  ButtonProps,
  Color,
  ElementConstructor,
  RasterProps,
  RenderElement,
  TextProps,
} from 'claude-code'

export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Raster?: ElementConstructor<RasterProps>
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

const BARS = '▁▂▃▄▅▆▇█'

export function levelTone(pct: number): Tone {
  if (pct >= 85) return 'bad'
  if (pct >= 60) return 'warn'
  return 'ok'
}

export function bar(pct: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  const full = Math.round((clamped / 100) * width)
  return '█'.repeat(full) + '░'.repeat(Math.max(0, width - full))
}

export function sparkText(values: readonly number[], width: number): string {
  const tail = values.slice(-width)
  if (tail.length === 0) return ''
  const max = Math.max(...tail, 1)
  return tail
    .map(v => BARS.charAt(Math.min(BARS.length - 1, Math.floor((v / max) * (BARS.length - 1)))))
    .join('')
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? B64.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? B64.charAt(n & 63) : '='
  }
  return out
}

const RGB: Record<Tone, number> = {
  ok: 0x4eba65,
  warn: 0xffc107,
  bad: 0xff6b80,
  accent: 0xd77757,
  muted: 0x888888,
  info: 0x5f9ea0,
}

function sparkCells(values: readonly number[], width: number, pctScale: boolean): string {
  const tail = values.slice(-width)
  const max = pctScale ? 100 : Math.max(...tail, 1)
  const words = new Uint32Array(width * 3)
  for (let i = 0; i < width; i += 1) {
    const offset = width - tail.length
    const v = i >= offset ? (tail[i - offset] ?? null) : null
    const glyph = v === null ? ' ' : BARS.charAt(Math.min(BARS.length - 1, Math.floor((v / max) * (BARS.length - 1))))
    words[i * 3] = glyph.codePointAt(0) ?? 0x20
    words[i * 3 + 1] = v === null ? 0x01000000 : RGB[pctScale ? levelTone(v) : 'accent']
    words[i * 3 + 2] = 0x01000000
  }
  return base64(new Uint8Array(words.buffer))
}

export function Spark(
  ui: Kit,
  key: string,
  values: readonly number[],
  width: number,
  opts: { pctScale?: boolean; tone?: Tone } = {},
): RenderElement {
  const w = Math.max(1, Math.min(512, width))
  if (ui.Raster !== undefined) {
    return <ui.Raster key={key} columns={w} rows={1} cells={sparkCells(values, w, opts.pctScale ?? false)} />
  }
  return <ui.Text color={tone[opts.tone ?? 'accent']}>{sparkText(values, w)}</ui.Text>
}

export function Meter(ui: Kit, label: string, pct: number | null, width: number): RenderElement {
  if (pct === null) {
    return (
      <ui.Box>
        <ui.Text dimColor>{label} n/a</ui.Text>
      </ui.Box>
    )
  }
  const t = levelTone(pct)
  return (
    <ui.Box>
      <ui.Text dimColor>{label} </ui.Text>
      <ui.Text color={tone[t]}>{bar(pct, width)}</ui.Text>
      <ui.Text color={tone[t]} bold> {Math.round(pct)}%</ui.Text>
    </ui.Box>
  )
}

export function Heading(ui: Kit, text: string, right?: string): RenderElement {
  return (
    <ui.Box justifyContent="space-between">
      <ui.Text color={tone.accent} bold>
        ◆ {text}
      </ui.Text>
      {right !== undefined && <ui.Text dimColor>{right}</ui.Text>}
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
  tabs: readonly { id: T; label: string; hotkey: string }[],
  active: T,
  onPick: (id: T) => void,
): RenderElement {
  return (
    <ui.Box gap={1}>
      {tabs.map(t => (
        <ui.Button
          key={`tab-${t.id}`}
          label={t.label}
          hotkey={t.hotkey}
          variant={t.id === active ? 'primary' : 'secondary'}
          onPress={() => onPick(t.id)}
        />
      ))}
    </ui.Box>
  )
}

export function Rule(ui: Kit, width: number): RenderElement {
  return <ui.Text dimColor>{'─'.repeat(Math.max(1, width))}</ui.Text>
}

export function duration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  const m = Math.floor(s / 60)
  return `${m}m${Math.round(s % 60)}s`
}

export function usd(v: number | null): string {
  return v === null ? 'n/a' : `$${v.toFixed(v < 1 ? 3 : 2)}`
}

export function clip(text: string, width: number): string {
  if (text.length <= width) return text
  return width <= 1 ? text.slice(0, width) : `${text.slice(0, width - 1)}…`
}

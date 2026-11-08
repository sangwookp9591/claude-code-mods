import type { ClientModule } from 'claude-code'

export type RecProps = { n: number; startedAt: number; now: number; calls: number; current: string }

type RecState = { propsNow: number; elapsed: number }

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const Rec: ClientModule<RecProps, RecState> = (p, surface) => {
  const { Box, Text } = surface.elements
  const st = surface.state
  if (st === undefined) {
    surface.every(500, () => {
      const cur = surface.state
      if (cur !== undefined) surface.setState({ ...cur, elapsed: cur.elapsed + 500 })
    })
    surface.setState({ propsNow: p.now, elapsed: 0 })
  } else if (st.propsNow !== p.now) {
    surface.setState({ propsNow: p.now, elapsed: 0 })
  }
  const elapsed = st !== undefined && st.propsNow === p.now ? st.elapsed : 0
  const isOn = Math.floor(elapsed / 500) % 2 === 0
  return (
    <Box gap={1}>
      <Text color="error" bold>
        {isOn ? '●' : '○'} REC
      </Text>
      <Text color="claude">{clock(p.now + elapsed - p.startedAt)}</Text>
      <Text dimColor>{`turn #${p.n} · ${p.calls} calls`}</Text>
      {p.current !== '' && <Text color="warning">{`▸ ${p.current}`}</Text>}
    </Box>
  )
}

export default Rec

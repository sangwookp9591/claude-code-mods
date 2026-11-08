export type Lane = 'read' | 'edit' | 'run' | 'find' | 'web' | 'agent' | 'other'
export type CallStatus = 'running' | 'ok' | 'error' | 'blocked'

export type Call = {
  id: string
  tool: string
  lane: Lane
  label: string
  startedAt: number
  endedAt: number | null
  status: CallStatus
}

export type Change = {
  id: string
  path: string
  diff: string
  added: number
  removed: number
  at: number
  nth: number
}

export type RuleId = 'rm-rf' | 'force-push' | 'env-write' | 'pipe-sh' | 'reset-hard'

export type Blocked = { at: number; rule: RuleId; label: string }

export type Brief =
  | { status: 'idle' }
  | { status: 'writing' }
  | { status: 'done'; text: string; at: number; changes: number }
  | { status: 'failed'; reason: string }

export type TurnInfo = { n: number; startedAt: number; endedAt: number | null; calls: number }

export type Tab = 'radar' | 'reel' | 'guard' | 'debrief'

declare module 'claude-code' {
  interface PluginState {
    blackbox: {
      calls: Shaped<Call[]>
      changes: Shaped<Change[]>
      rules: Shaped<RuleId[]>
      blocked: Shaped<Blocked[]>
      brief: Shaped<Brief>
      turn: Shaped<TurnInfo>
      tab: Tab
      picked: string
      isBandHidden: boolean
    }
  }
}

export type CallStatus = 'running' | 'ok' | 'error' | 'denied'
export type CallRec = {
  id: string
  tool: string
  label: string
  startedAt: number
  ms: number | null
  status: CallStatus
}
export type TurnRec = {
  n: number
  ms: number
  tools: number
  ctxPct: number | null
  costUsd: number | null
  reason: string
}
export type FileRec = { path: string; reads: number; edits: number }
export type Tab = 'overview' | 'tools' | 'files'
export type Lifetime = { sessions: number; turns: number; toolCalls: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      calls: Shaped<CallRec[]>
      turns: Shaped<TurnRec[]>
      files: Shaped<FileRec[]>
      tab: Tab
      isBandHidden: boolean
    }
  }
}

export type LabGroup = 'ui' | 'data' | 'session' | 'model' | 'prompt' | 'tools' | 'commands' | 'clock' | 'hooks'
export type LabStatus = 'idle' | 'running' | 'pass' | 'fail'
export type LabResult = { status: LabStatus; detail: string; ms: number | null }
export type LabResults = Record<string, LabResult>

declare module 'claude-code' {
  interface PluginState {
    'mods-lab': {
      results: Shaped<LabResults>
      tab: LabGroup
      counter: number
    }
  }
}

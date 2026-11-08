export type Item = { id: string; text: string; at: number }
export type Tab = 'main' | 'about'

declare module 'claude-code' {
  interface PluginState {
    '__MOD__': {
      items: Shaped<Item[]>
      tab: Tab
      isBandHidden: boolean
    }
  }
}

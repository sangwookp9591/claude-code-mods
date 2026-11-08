export type Species = 'minnow' | 'angel' | 'puffer' | 'jelly' | 'whale' | 'crab'

export type Fish = {
  id: string
  name: string
  species: Species
  tool: string
  label: string
  bornAt: number
}

export type Reef = {
  fish: Fish[]
  hatched: number
  calls: number
  fed: number
  errors: number
  turns: number
  lastAt: number
}

declare module 'claude-code' {
  interface PluginState {
    reef: {
      reef: Shaped<Reef>
      isWorking: boolean
      picked: string
    }
  }
}

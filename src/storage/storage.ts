export type PersistenceMode = 'durable' | 'memory'

export interface StorageAdapter {
  readonly persistenceMode?: PersistenceMode
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  compareAndSetItem?(key: string, expectedValue: string, value: string): Promise<boolean>
  compareAndRemoveItem?(key: string, expectedValue: string): Promise<boolean>
}

export class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>()
  readonly persistenceMode = 'memory' as const

  getItem(key: string): Promise<string | null> { return Promise.resolve(this.values.get(key) ?? null) }
  setItem(key: string, value: string): Promise<void> { this.values.set(key, value); return Promise.resolve() }
  removeItem(key: string): Promise<void> { this.values.delete(key); return Promise.resolve() }
  compareAndSetItem(key: string, expectedValue: string, value: string): Promise<boolean> {
    if (this.values.get(key) !== expectedValue) return Promise.resolve(false)
    this.values.set(key, value)
    return Promise.resolve(true)
  }
  compareAndRemoveItem(key: string, expectedValue: string): Promise<boolean> {
    if (this.values.get(key) !== expectedValue) return Promise.resolve(false)
    this.values.delete(key)
    return Promise.resolve(true)
  }
}

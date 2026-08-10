export interface StorageAdapter {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>()

  getItem(key: string): Promise<string | null> { return Promise.resolve(this.values.get(key) ?? null) }
  setItem(key: string, value: string): Promise<void> { this.values.set(key, value); return Promise.resolve() }
  removeItem(key: string): Promise<void> { this.values.delete(key); return Promise.resolve() }
}

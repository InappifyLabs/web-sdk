import type { StorageAdapter } from './storage'
import { MemoryStorage } from './storage'

export class IndexedDbStorage implements StorageAdapter {
  private readonly fallback = new MemoryStorage()
  private disabled = typeof indexedDB === 'undefined'

  constructor(private readonly databaseName = 'inappify-web-sdk', private readonly storeName = 'session') {}

  async getItem(key: string): Promise<string | null> {
    if (this.disabled) return this.fallback.getItem(key)
    try {
      const value = await this.request('readonly', (store) => store.get(key))
      return typeof value === 'string' ? value : null
    } catch {
      this.disabled = true
      return this.fallback.getItem(key)
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.disabled) return this.fallback.setItem(key, value)
    try {
      await this.request('readwrite', (store) => store.put(value, key))
    } catch {
      this.disabled = true
      await this.fallback.setItem(key, value)
    }
  }

  async removeItem(key: string): Promise<void> {
    await this.fallback.removeItem(key)
    if (this.disabled) return
    try {
      await this.request('readwrite', (store) => store.delete(key))
    } catch {
      this.disabled = true
    }
  }

  private async request(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
    const database = await this.open()
    try {
      return await new Promise((resolve, reject) => {
        const request = operation(database.transaction(this.storeName, mode).objectStore(this.storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
      })
    } finally {
      database.close()
    }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) request.result.createObjectStore(this.storeName)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'))
    })
  }
}


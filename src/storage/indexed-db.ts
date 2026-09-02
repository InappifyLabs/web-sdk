import { InAppifyError } from '../errors'
import type { StorageAdapter } from './storage'

export class IndexedDbStorage implements StorageAdapter {
  readonly persistenceMode = 'durable' as const

  constructor(private readonly databaseName = 'inappify-web-sdk', private readonly storeName = 'session') {}

  async getItem(key: string): Promise<string | null> {
    const value = await this.request('readonly', (store) => store.get(key))
    return typeof value === 'string' ? value : null
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.request('readwrite', (store) => store.put(value, key))
  }

  async removeItem(key: string): Promise<void> {
    await this.request('readwrite', (store) => store.delete(key))
  }

  compareAndSetItem(key: string, expectedValue: string, value: string): Promise<boolean> {
    return this.compareAndMutate(key, expectedValue, (store) => store.put(value, key))
  }

  compareAndRemoveItem(key: string, expectedValue: string): Promise<boolean> {
    return this.compareAndMutate(key, expectedValue, (store) => store.delete(key))
  }

  private async request(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
    const database = await this.openStrict()
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.storeName, mode)
        const request = operation(transaction.objectStore(this.storeName))
        let result: unknown
        request.onsuccess = () => { result = request.result }
        request.onerror = () => reject(this.storageError(request.error))
        transaction.oncomplete = () => resolve(result)
        transaction.onerror = () => reject(this.storageError(transaction.error))
        transaction.onabort = () => reject(this.storageError(transaction.error))
      })
    } finally {
      database.close()
    }
  }

  private async compareAndMutate(key: string, expectedValue: string, mutation: (store: IDBObjectStore) => IDBRequest): Promise<boolean> {
    const database = await this.openStrict()
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const read = store.get(key)
        let matched = false
        read.onsuccess = () => {
          if (read.result !== expectedValue) return
          matched = true
          mutation(store)
        }
        read.onerror = () => reject(this.storageError(read.error))
        transaction.oncomplete = () => resolve(matched)
        transaction.onerror = () => reject(this.storageError(transaction.error))
        transaction.onabort = () => reject(this.storageError(transaction.error))
      })
    } finally {
      database.close()
    }
  }

  private async openStrict(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') throw this.storageError()
    try { return await this.open() } catch (error) { throw this.storageError(error) }
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

  private storageError(cause?: unknown): InAppifyError {
    return new InAppifyError({
      kind: 'storage',
      code: 'STORAGE_UNAVAILABLE',
      message: 'Persistent session storage is temporarily unavailable.',
      cause,
    })
  }
}

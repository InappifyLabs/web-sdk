export class EventEmitter<TEvents extends object> {
  private readonly listeners = new Map<keyof TEvents, Set<(payload: never) => void>>()

  on<TKey extends keyof TEvents>(event: TKey, listener: (payload: TEvents[TKey]) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return () => listeners.delete(listener)
  }

  emit<TKey extends keyof TEvents>(event: TKey, payload: TEvents[TKey]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload as never)
  }
}

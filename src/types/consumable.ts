import type { RequestOptions } from './common'

export type ConsumableDeliveryStatus = 'DELIVERY_REQUIRED' | 'CONSUME_REQUIRED' | 'COMPLETED'
export type ConsumableDeliverySource = 'direct' | 'bazar' | 'myket'

export interface ConsumableDelivery {
  deliveryId: number
  status: ConsumableDeliveryStatus
  source: ConsumableDeliverySource
  paymentId: number | null
  transactionId: string | null
  productIdentifier: string
  alreadyDelivered: boolean
  consumeAttempts: number
}

export type ConsumableDeliveryHandler = (delivery: ConsumableDelivery) => void | Promise<void>

export interface ConsumableSyncOptions extends RequestOptions {
  maxBatches?: number | undefined
}

export interface ConsumableSyncResult {
  deliveries: readonly ConsumableDelivery[]
  batches: number
}

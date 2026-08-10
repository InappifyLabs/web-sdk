export interface AppConfiguration {
  app: {
    id: number
    identifier: string
    platform: number
    storePlatform: number
    displayName: string | null
    logo: string | null
    icon: string | null
  }
  authentication: {
    anonymous: boolean
    external: boolean
    inappifyOtp: boolean
    captcha: {
      enabled: boolean
      provider: string
      mode: string | null
      refreshEndpoint: string | null
    }
  }
  features: {
    attributes: boolean
    offerings: boolean
    checkout: boolean
    realPayment: boolean
    freePurchase: boolean
    anonymousPurchase: boolean
    trial: boolean
  }
  attributes: {
    writable: readonly string[]
    writableReserved: readonly import('./customer').ReservedAttributeName[]
  }
}

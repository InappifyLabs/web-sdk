# InAppify Web SDK

Official, framework-agnostic TypeScript SDK for websites and Progressive Web Apps.

> This repository is under private development. Do not use it in production until a release is published.

## Installation

```bash
npm install @inappifylabs/web-sdk
```

## Start here

The usual integration has four steps:

1. Enable the Web App and required features in the InAppify dashboard.
2. Configure the SDK once in the browser.
3. Resolve an offering and render its packages.
4. Send the selected package to `purchase`; the API remains authoritative for price and access.

Before writing code, confirm these dashboard settings:

- The Web App is enabled and its public key belongs to the correct app.
- The website origin is approved for that public key.
- Offerings and checkout are enabled.
- Anonymous purchase is enabled only if guests should be able to buy.
- Custom and reserved attributes are allowlisted only when the website needs to write them.

Never put a project/server API key in frontend code. The Web App key is the only key intended for the browser.

## Complete quick start

```ts
import { InAppify, isInAppifyError } from '@inappifylabs/web-sdk'

const inappify = await InAppify.configure({
  apiKey: 'your_public_web_app_key',
  country: 'IR',
  appVersion: '1.0.0',
})

const offering = await inappify.getCurrentOffering({
  placementIdentifier: 'website_pricing',
})

if (!offering) {
  throw new Error('No offering is available for this customer.')
}

for (const packageItem of offering.packages) {
  const price = packageItem.product.prices[0]
  console.log(packageItem.name, price?.amount, price?.currency)
}

async function buy(packageIdentifier: string) {
  const packageItem = offering.packages.find((item) => item.identifier === packageIdentifier)
  if (!packageItem) return

  try {
    await inappify.purchase({
      offeringIdentifier: offering.identifier,
      packageIdentifier: packageItem.identifier,
      productIdentifier: packageItem.product.identifier,
    })
  } catch (error) {
    if (isInAppifyError(error)) {
      console.error(error.code, error.message)
    }
  }
}
```

`configure` creates or restores a customer session, loads `customerInfo`, and prefetches offerings. Calling `getCurrentOffering` immediately afterward normally uses the prefetched memory cache.

## Features

- Anonymous browser sessions with rotating refresh tokens
- Access tokens kept in memory; refresh tokens persisted in IndexedDB
- Cross-tab refresh serialization through the Web Locks API
- Automatic session restoration and one-time retry after `401`
- Offerings prefetch and in-memory cache
- Customer information and attributes
- External identity tickets and InAppify OTP authentication
- Discount validation
- Idempotent checkout creation, safe payment redirects, and authoritative payment polling
- ESM, CommonJS, TypeScript declarations, and a browser/CDN bundle
- Structured errors, cancellation through `AbortSignal`, request timeouts, and typed events

Paywall UI and native app-store purchase verification are intentionally outside this package.

## Configure

```ts
import { InAppify } from '@inappifylabs/web-sdk'

const inappify = await InAppify.configure({
  apiKey: 'your_public_web_app_key',
})
```

`configure` restores or creates a browser session, loads customer information, and prefetches offerings when enabled. The app key is public and must be restricted to approved origins in InAppify. Never put a server/project secret in browser code.

For development against another API:

```ts
const inappify = await InAppify.configure({
  apiKey: 'public_key',
  baseUrl: 'https://api.example.com/api/web/v1',
  requestTimeoutMs: 15_000,
  offeringsCacheTtlMs: 5 * 60_000,
})
```

## Offerings

Offerings are normally served from the launch-time memory cache:

```ts
const offerings = await inappify.getOfferings()
const current = offerings.current

const fresh = await inappify.getOfferings({ forceRefresh: true })
```

Pricing returned by the API is authoritative. Never calculate the payable amount in browser code.

## Targeting and placements

The SDK evaluates live rules in ascending `sort` order. Every condition in a rule must match. The first matching rule wins.

```ts
const offering = await inappify.getCurrentOffering()

const homeOffering = await inappify.getCurrentOffering({
  placementIdentifier: 'home_banner',
})
```

Resolution order for a placement is:

1. The matching placement offering
2. The rule's placement fallback offering
3. The rule's default offering
4. The project's default offering

The synchronous resolver is also available on a fetched result:

```ts
const offerings = await inappify.getOfferings()
const current = offerings.current
const profile = offerings.getCurrentOffering('profile_paywall')
```

Supported targeting fields are `any_audience`, `country`, `platform`, `custom_attribute`, `app_config`, `app_version`, and `sdk_version`. Rules support `>`, `<`, `>=`, `<=`, `=`, `!=`, `in`, and `not in` as appropriate.

Provide browser runtime values during configuration:

```ts
const inappify = await InAppify.configure({
  apiKey: 'public_key',
  country: 'IR',
  appVersion: '2.4.0',
})
```

If a SPA changes either value at runtime, update the targeting context. This invalidates the offerings cache:

```ts
inappify.setTargetingContext({ country: 'DE', appVersion: '2.5.0' })
const offering = await inappify.getCurrentOffering()
```

Customer attributes used by rules always come from the authoritative customer snapshot. Version comparisons are segment-based, so `1.10.0` correctly sorts after `1.9.9`.

## Customer information and attributes

```ts
const customer = await inappify.getCustomerInfo()

await inappify.updateAttributes({ language: 'fa', theme: 'dark' })
await inappify.deleteAttributes(['theme'])
await inappify.syncAttributes([
  { key: 'language', value: 'fa' },
])
```

Only attributes allowlisted in the project configuration can be written by the browser.

### Reserved attributes

Reserved attributes are denied by default. A project administrator must explicitly enable each field in the Web/PWA app configuration before its helper can be used:

```ts
if (inappify.canSetReservedAttribute('$email')) {
  await inappify.setEmail('user@example.com')
}

await inappify.setDisplayName('A. User')
await inappify.setPhoneNumber('09121234567')
await inappify.setCampaign('summer-2026')
await inappify.setKeyword('landing-page')
await inappify.setFcmToken(webPushToken)
```

Passing an empty value removes the field:

```ts
await inappify.setEmail('')
```

Additional compatibility helpers are `setApnsToken`, `setIdfa`, and `setIdfv`. All helpers still enforce the server allowlist; calling a disabled helper throws `InAppifyError` with code `ATTRIBUTE_NOT_WRITABLE`.

Browser-provided `$email` and `$phoneNumber` values are unverified profile data. They must not be treated as proof of identity. `$ip`, entitlements, and payment state can never be written through the Web SDK.

## Entitlement checks

Use the already loaded customer snapshot for synchronous UI checks:

```ts
if (inappify.hasEntitlement('premium')) {
  showPremiumFeatures()
}

const entitlement = inappify.getEntitlement('premium')
```

For a security-sensitive action, refresh customer information before checking:

```ts
const allowed = await inappify.checkEntitlement('premium')
```

`checkEntitlement` refreshes from the API by default. To use the current snapshot asynchronously:

```ts
const allowed = await inappify.checkEntitlement('premium', {
  forceRefresh: false,
})
```

An entitlement is accepted only when it is active and has no expiration or its expiration is still in the future. Frontend checks are for UI/UX only; your backend must independently authorize protected server resources.

## Authentication

### External identity

When your backend returns a short-lived identity ticket, authenticate the current SDK session with:

```ts
const authentication = await inappify.loginWithIdentityTicket(identityTicket)

console.log(authentication.isAnonymous) // false
console.log(authentication.type) // "Authenticated"
```

`exchangeIdentityTicket` provides the same behavior and can be used instead:

```ts
const authentication = await inappify.exchangeIdentityTicket(identityTicket)
```

`loginWithIdentityTicket` is implemented as a convenience alias:

```ts
async loginWithIdentityTicket(identityTicket: string, options = {}) {
  return this.exchangeIdentityTicket(identityTicket, options)
}
```

Call only one of these methods. Calling both would try to consume the same one-time ticket twice.

Both methods return `AuthResult`, not raw tokens. On success, the SDK automatically replaces the access token, persists the new refresh token, refreshes customer information and, when enabled, offerings, invalidates stale caches, and emits `authenticationChanged`. Applications must not replace or store the tokens themselves.

Identity tickets expire after one minute and can be used only once. Create the ticket immediately before login. Never create identity tickets or embed server credentials in frontend code.

### InAppify OTP

```ts
const challenge = await inappify.requestOtp({ phone: '09121234567' })
await inappify.verifyOtp(challenge.challengeId, '123456')
```

When CAPTCHA is required, `InAppifyError.details` contains the server challenge. A challenge can also be requested explicitly:

```ts
const captcha = await inappify.createOtpCaptcha()
await inappify.requestOtp({
  phone: '09121234567',
  captchaKey: captcha.captchaKey,
  captchaAnswer: userAnswer,
})
```

## Purchase

Use identifiers from the selected offering package; do not build identifiers or prices yourself:

```ts
const checkout = await inappify.purchase({
  offeringIdentifier: 'default',
  packageIdentifier: 'monthly',
  productIdentifier: 'premium_monthly',
  discountCode: 'WELCOME20',
})
```

By default, a redirect checkout navigates to the server-issued InAppify redirect URL. If the application must persist the checkout ID before navigation, use the controlled flow:

```ts
const checkout = await inappify.purchase(params, { redirect: false })

sessionStorage.setItem('inappify_checkout_id', checkout.checkout.id)

if (checkout.nextAction.type === 'redirect' && checkout.nextAction.url) {
  window.location.assign(checkout.nextAction.url)
}
```

After returning from payment, verify the authoritative status rather than trusting callback query parameters:

```ts
const checkoutId = sessionStorage.getItem('inappify_checkout_id')
if (!checkoutId) throw new Error('Checkout ID is missing.')

const result = await inappify.handlePaymentReturn(checkoutId, {
  timeoutMs: 60_000,
  intervalMs: 1_500,
})

if (result.checkout.status === 'Paid') {
  // customerInfo has already been refreshed by the SDK
  sessionStorage.removeItem('inappify_checkout_id')
}
```

Never trust success query parameters from the browser callback.

## Discount validation

```ts
const validation = await inappify.validateDiscountCode('WELCOME20', 'default')
```

## Errors and cancellation

```ts
import { isInAppifyError } from '@inappifylabs/web-sdk'

try {
  await inappify.getOfferings({ forceRefresh: true })
} catch (error) {
  if (isInAppifyError(error)) {
    console.error(error.code, error.status, error.details, error.requestId)
  }
}
```

All network methods accept an `AbortSignal` where applicable.

## Events

```ts
const unsubscribe = inappify.on('customerInfoUpdated', (customerInfo) => {
  console.log(customerInfo.entitlements)
})

unsubscribe()
```

Available events are `customerInfoUpdated`, `offeringsUpdated`, `authenticationChanged`, and `sessionStateChanged`.

`sessionStateChanged` reports only non-sensitive metadata: `state`, an optional error `reason`, and whether the condition is retryable. Possible states are `anonymous`, `authenticated`, `refreshing`, `temporarily-unavailable`, and `recovery-required`.

## SSR frameworks

The SDK is browser-first. Do not create a shared SDK singleton in a Node.js SSR process. IndexedDB belongs to the browser and is unavailable while the server renders HTML.

Keep the page server-rendered, but initialize personalized packages and checkout as a client-side island after hydration:

```text
SSR: page title, product copy, SEO content, package placeholder
Client hydration: configure SDK, restore session, resolve targeting, render prices
```

### Nuxt

Put initialization in a client-only plugin such as `plugins/inappify.client.ts` and render the package component inside `ClientOnly`.

```vue
<ClientOnly>
  <InAppifyPackages />
  <template #fallback><PackagesSkeleton /></template>
</ClientOnly>
```

### Next.js

Keep the pricing page as a Server Component and put SDK initialization in a nested component containing the `'use client'` directive.

If personalized entitlements must be available during SSR itself, use a backend-for-frontend with secure `HttpOnly` cookies and per-request state. Do not serialize refresh tokens into HTML, JavaScript, page props, or `localStorage`.

## API reference

| Method/property | Purpose | Network request |
| --- | --- | --- |
| `InAppify.configure(options)` | Restore/create session and prefetch initial state | Yes |
| `configuration` | Read Web App capabilities and allowlists | No |
| `customerInfo` | Read the latest customer snapshot | No |
| `getCustomerInfo()` | Refresh the customer snapshot | Yes |
| `getOfferings()` | Return cached offerings or fetch them | Usually cached |
| `getCurrentOffering(options)` | Resolve targeting and an optional placement | Usually cached |
| `hasEntitlement(id)` | Check the current snapshot synchronously | No |
| `getEntitlement(id)` | Return an active entitlement from the snapshot | No |
| `checkEntitlement(id)` | Refresh and check access | Yes by default |
| `updateAttributes(values)` | Update allowlisted custom attributes | Yes |
| `deleteAttributes(keys)` | Remove allowlisted attributes | Yes |
| `syncAttributes(operations)` | Apply an idempotent attribute batch | Yes |
| `setEmail`, `setDisplayName`, etc. | Write an allowlisted reserved attribute | Yes |
| `validateDiscountCode(code, offering)` | Validate a code and return server prices | Yes |
| `createCheckout(params)` | Create checkout without automatic navigation | Yes |
| `purchase(params, options)` | Create checkout and normally redirect | Yes |
| `getCheckoutStatus(id)` | Read authoritative payment state | Yes |
| `handlePaymentReturn(id)` | Poll until payment reaches a terminal state | Yes |
| `loginWithIdentityTicket(ticket)` | Exchange a backend-issued identity ticket | Yes |
| `requestOtp`, `verifyOtp` | Authenticate through InAppify OTP | Yes |
| `logout()` | Replace the current identity with a new anonymous session | Yes |

## Browser storage and session behavior

- The access token exists only in memory and disappears on a hard refresh.
- The rotating refresh token is stored in IndexedDB.
- After a hard refresh, `configure` exchanges the stored refresh token for a new token pair.
- Web Locks serialize refresh across tabs to prevent token reuse.
- A temporary network, timeout, rate-limit, server, or storage failure never deletes the persisted session and never silently changes an authenticated customer into an anonymous customer.
- If IndexedDB exists but cannot be opened or committed, `configure` returns the typed `STORAGE_UNAVAILABLE` error. It does not silently fall back to an empty in-memory session.
- In runtimes without IndexedDB, the SDK explicitly uses memory-only storage. Check `inappify.persistenceMode`, which is either `durable` or `memory`; memory sessions do not survive a page reload.
- When an authenticated refresh token is definitively expired, revoked, or reused, the SDK returns `SESSION_RECOVERY_REQUIRED`. Request a new one-time Identity Ticket from your backend and call `loginWithIdentityTicket(ticket)` on a newly configured/recovered SDK flow. Do not store or replace SDK tokens yourself.
- Refresh requests use an internal idempotency key so a retry after a lost rotation response can receive the same token pair safely.
- A custom `StorageAdapter` can be injected for testing or specialized runtimes.

Handle a definitive authenticated-session expiry by creating the replacement anonymous transport session first, then exchanging a newly issued Identity Ticket from your own backend:

```ts
let inappify: InAppify

try {
  inappify = await InAppify.configure({ apiKey: 'your_public_web_app_key' })
} catch (error) {
  if (!(error instanceof InAppifyError) || error.code !== 'SESSION_RECOVERY_REQUIRED') {
    throw error // transient errors should be retried without clearing host login state
  }

  inappify = await InAppify.configure({ apiKey: 'your_public_web_app_key' })
  const identityTicket = await requestIdentityTicketFromYourBackend()
  await inappify.loginWithIdentityTicket(identityTicket)
}
```

Do not show “no subscription” while configuration is temporarily unavailable. Preserve the host application's loading/error state and retry instead.

## Integration rules

- Render prices exactly as returned by InAppify; do not calculate the payable amount in JavaScript.
- Never grant server-side access based only on `hasEntitlement` in the browser.
- Never trust callback query parameters as payment proof; poll the checkout endpoint.
- Keep the checkout ID until the payment flow reaches `Paid`, `Failed`, `Expired`, or `Cancelled`.
- Do not expose server API keys, identity-ticket credentials, refresh tokens, or OTP codes.
- Pin an exact SDK version for production deployments.

## Script tag / CDN

After publication, the browser build is available as `dist/inappify.global.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/@inappifylabs/web-sdk@VERSION/dist/inappify.global.js"></script>
<script>
  const sdk = await InAppifySDK.InAppify.configure({ apiKey: 'public_key' })
</script>
```

Pin an exact version in production. Do not use an unversioned CDN URL.

## Development

Requires Node.js 20+ and npm 10+.

```bash
npm ci
npm run check
```

See [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md), and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Versioning and release

The package follows Semantic Versioning and uses Changesets:

```bash
npm run changeset
npm run pre-enter
npm run version-packages
npm run release:beta
```

## License

Released under the [MIT License](./LICENSE). Copyright © 2026 InAppify.

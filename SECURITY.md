# Security policy

## Browser trust boundary

- The Web App key is public and must be origin-restricted server-side.
- Project/server API keys must never be included in this package, browser storage, examples, logs, or bundles.
- Prices, discounts, payment results, and entitlements are server-authoritative.
- Identity tickets are short-lived, one-time credentials created only by the integrator's backend.
- Reserved customer attributes are denied by default and require an explicit per-app allowlist. Browser-provided email and phone values are unverified. IP, entitlement, and payment state remain server-controlled.

## Token storage

Access tokens exist only in memory. Refresh tokens are stored in IndexedDB by default and rotate on every refresh. IndexedDB does not protect against malicious JavaScript running in the same origin; integrators must deploy a strict Content Security Policy, prevent XSS, and audit third-party scripts.

The fallback storage is memory-only. Consumers may inject a custom `StorageAdapter`, but persistent plaintext browser storage is discouraged.

## Payment navigation

The SDK accepts only HTTP(S) redirect URLs and obtains them from authenticated API responses. Payment success is established only by polling the authoritative checkout endpoint.

## Reporting a vulnerability

Report vulnerabilities privately to the InAppify security contact. Do not open a public issue before a coordinated fix is available.

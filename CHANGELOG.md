# Changelog

This file is managed by Changesets when a release version is prepared.

## 0.1.0

### Initial stable release

- Provide a framework-agnostic SDK for websites and Progressive Web Apps with ESM, CommonJS, TypeScript declarations, and a browser bundle.
- Add durable anonymous and authenticated browser sessions with rotating refresh tokens, IndexedDB persistence, cross-tab coordination, safe retry behavior, and explicit recovery states.
- Support external Identity Tickets, InAppify OTP authentication, allowlisted customer attributes, customer information, and entitlement checks.
- Add cached offerings, targeting rules, placements, discount validation, idempotent checkout creation, safe redirects, and authoritative payment-return polling.
- Add direct-web consumable delivery, acknowledgement, and recovery APIs while keeping Bazaar, Myket, and other native store operations outside the Web SDK.
- Expose gateway-confirmed `amountVariance` on customer transactions while remaining compatible with older API responses that omit the field.
- Fix native browser Fetch invocation in Chromium and preserve structured HTTP and API error metadata.

## 0.1.0-beta.4

### Minor Changes

- Add direct-web consumable fulfillment APIs, typed delivery models, batched recovery synchronization, per-instance single-flight protection, and delivery completion events.
- Document the required idempotent host inventory transaction and keep native store consumption outside the Web SDK.

## 0.1.0-beta.3

### Patch Changes

- Preserve authenticated sessions across transient refresh, HTTP, and storage failures instead of silently replacing them with anonymous sessions.
- Add idempotent refresh retries, compare-and-swap session persistence, strict IndexedDB errors, and safe multi-tab rotation handling.
- Expose non-sensitive session state and persistence mode metadata, with `SESSION_RECOVERY_REQUIRED` for definitive authenticated-session expiry.
- Keep beta.1/beta.2 IndexedDB session records compatible and add regression coverage for response loss, storage failure, and definitive versus transient failures.

## 0.1.0-beta.2

### Patch Changes

- Bind the selected Fetch implementation to the browser global receiver, preventing Chromium `Illegal invocation` failures before network requests begin.
- Add regression coverage for native and injected Fetch implementations and preserve `FETCH_UNAVAILABLE` behavior.

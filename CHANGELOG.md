# Changelog

This file is managed by Changesets when a release version is prepared.

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

# Architecture

## Session lifecycle

1. `configure` reads a rotating refresh token from the configured storage adapter.
2. A valid token is exchanged for a new access/refresh pair; otherwise an anonymous session is created.
3. Access tokens remain in memory and are refreshed shortly before expiration.
4. One `401` response triggers one refresh and one retry.
5. Web Locks serialize refresh across tabs to prevent refresh-token reuse.
6. Login and logout rotate both tokens and invalidate customer/offering caches.

## Caching

Customer information is retained as the latest snapshot. Offerings use an in-memory TTL cache and are prefetched during configuration. Authentication, attribute targeting changes, and successful purchases invalidate relevant caches. Prices are never persisted.

## Targeting

Rules are normalized into typed models and sorted by `sort`. Conditions inside a rule use AND semantics; the first matching rule wins. Placement resolution follows mapping, placement fallback, rule default, and project default order. Missing or malformed references fail closed to the next safe fallback rather than throwing. Country values are normalized, Web platform aliases are supported, custom attributes come from customer information, and versions are compared by numeric segments.

## Checkout

Checkout creation always sends an idempotency key. The API recalculates the price and returns a server-controlled next action. The SDK can navigate to an HTTP(S) redirect, but it never treats callback query parameters as proof of payment. `handlePaymentReturn` polls the session-scoped checkout resource until it reaches a terminal state.

## Runtime support

The package has no runtime dependency. It targets modern browsers/PWAs with Fetch, AbortController, URL, Promise, and IndexedDB. Consumers can inject Fetch and storage implementations for tests or non-browser runtimes.

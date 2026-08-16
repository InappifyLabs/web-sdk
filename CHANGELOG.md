# Changelog

This file is managed by Changesets when a release version is prepared.

## 0.1.0-beta.2

### Patch Changes

- Bind the selected Fetch implementation to the browser global receiver, preventing Chromium `Illegal invocation` failures before network requests begin.
- Add regression coverage for native and injected Fetch implementations and preserve `FETCH_UNAVAILABLE` behavior.

# Contributing

## Workflow

1. Branch from `master`.
2. Make a focused change with tests.
3. Run `npm run check`.
4. Add a changeset with `npm run changeset` for every user-visible change.
5. Open a merge request; never publish from a feature branch.

## Compatibility

- Keep public methods and exported types backward-compatible within a release line.
- Treat token handling, identity, checkout, redirects, discounts, and entitlement refresh as security-sensitive.
- Do not log tokens, API keys, identity tickets, OTP codes, customer PII, or complete gateway URLs.
- Do not add runtime dependencies without documenting the bundle-size and security impact.

## Commit scope

Do not commit `dist`, `coverage`, IDE settings, credentials, local environment files, or generated tarballs.


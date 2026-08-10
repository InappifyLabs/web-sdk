# Changesets

Every user-visible change must include a changeset:

```bash
npm run changeset
```

Use `patch` for fixes, `minor` for backward-compatible features, and `major`
for breaking changes. While the SDK is in beta, releases are published with the
`beta` npm dist-tag.


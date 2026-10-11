# Changesets

Every user-visible change must include a changeset:

```bash
npm run changeset
```

Use `patch` for fixes, `minor` for backward-compatible features, and `major`
for breaking changes. Stable releases are published with the npm `latest`
dist-tag. Use prerelease mode and the `beta` tag only for an intentional test
release.


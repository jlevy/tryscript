# npm Trusted Publishing Runbook Template

> Replace `OWNER`, `REPOSITORY`, `PACKAGE`, and `X.Y.Z` before adopting this template.
> Align every command with the repository’s package manager, branch protection, and
> release workflow.

This pattern uses Changesets for versioning and a tag-triggered GitHub Actions workflow
for npm trusted publishing.
OIDC provides a short-lived publish identity, so the repository does not store a
long-lived npm write token.

## Preconditions

- The package already exists on npm.
  A maintainer performs the initial publish through an interactive,
  two-factor-authenticated session.
- The repository uses GitHub-hosted runners.
- The release runtime satisfies npm’s current trusted-publishing requirements.
- Dependency scripts are disabled unless each required script has been reviewed and
  allowlisted.
- Every third-party action is pinned to a reviewed full commit SHA outside the
  repository’s dependency cool-off window.

Use the authoritative
[npm trusted-publishing guide](https://docs.npmjs.com/trusted-publishers/) when
configuring or troubleshooting this workflow.

## npm Configuration

Configure the package’s trusted publisher with:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `OWNER` |
| Repository | `REPOSITORY` |
| Workflow filename | `release.yml` |
| Environment | The protected release environment, or empty |
| Allowed action | `npm publish` |

After testing OIDC publishing, require two-factor authentication and disallow
traditional write tokens in the package settings.

## Workflow Requirements

The release job needs the OIDC permission and only the repository permissions required
for its release artifacts:

```yaml
permissions:
  contents: write # Use read when a separate job creates the GitHub release.
  id-token: write
```

The workflow should:

1. check out the tagged commit;
2. install the frozen lockfile;
3. run formatting, lint, type, build, package, test, and audit gates;
4. publish `PACKAGE` through OIDC; and
5. create a GitHub release from the version’s changelog entry.

GitHub documents the meaning of
[`id-token: write`](https://docs.github.com/en/actions/reference/security/oidc#required-permission).

## Prepare a Release

```bash
git switch main
git pull --ff-only
git status --short
pnpm changeset
pnpm changeset version
git diff
pnpm verify
```

Confirm the SemVer bump, consumed changesets, package manifest, and changelog before
committing the release preparation.
Push it directly only when repository policy allows; otherwise merge it through the
normal pull-request process.

## Tag and Publish

After the version commit is present on the remote default branch:

```bash
git fetch origin main --tags
git tag --list vX.Y.Z
git tag -a vX.Y.Z -m "PACKAGE vX.Y.Z"
git push origin vX.Y.Z
gh run list --workflow release.yml --limit 3
gh run watch <run-id> --exit-status
```

The tag-list command must return no existing tag.
Never move a tag for a package version that may have been published.

## Verify

```bash
npm view PACKAGE@X.Y.Z version dist.integrity dist.tarball
gh release view vX.Y.Z --repo OWNER/REPOSITORY
```

Confirm the npm provenance record and compare the GitHub release notes with the matching
changelog section.

## Failure Rules

- Fix verification failures before publishing.
- If npm publishing succeeded, keep the version and tag immutable.
- If only GitHub release creation failed, repair the release for the existing tag.
- If the version already exists on npm, prepare a new patch release.
- If OIDC fails, compare every trusted-publisher field, workflow filename, runner type,
  allowed action, and permission with npm’s current guide.

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->

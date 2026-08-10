# Publishing tryscript

Tryscript uses Changesets for package versioning and a tag-triggered GitHub Actions
workflow for npm publishing.
The workflow verifies the repository, publishes through npm trusted publishing, and
creates the GitHub release from the generated changelog.

## Release Contract

- Release preparation happens on `main` in a clean checkout.
- `pnpm version-packages` consumes pending changesets, updates
  `packages/tryscript/package.json`, and writes `packages/tryscript/CHANGELOG.md`.
- A `v*` tag triggers `.github/workflows/release.yml`.
- A read-only job runs `pnpm verify`, uses `npm pack` to create one publisher-compatible
  tarball, and uploads that verified artifact.
- A dependent publish job downloads the tarball and receives npm OIDC authority; it does
  not install dependencies, execute repository build code, or receive repository write
  permission.
- The workflow verifies that both the source manifest and packed manifest match the
  pushed tag before publication.
- A final job receives repository write permission to create the GitHub release; it has
  no npm OIDC authority.
- npm authentication uses a short-lived OpenID Connect (OIDC) identity.
  The repository does not store an `NPM_TOKEN`.
- A published version and its Git tag are immutable.
  A correction receives a new patch version.

See the [Changesets documentation](https://github.com/changesets/changesets) for the
versioning model and
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the registry
authentication model.

## Trusted Publisher Configuration

The npm package settings must authorize this exact GitHub Actions identity:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `jlevy` |
| Repository | `tryscript` |
| Workflow filename | `release.yml` |
| Environment | Empty unless the workflow adopts a protected environment |
| Allowed action | `npm publish` |

Only the artifact-publishing job grants `id-token: write`, which lets GitHub mint the
short-lived OIDC token; the permission does not itself grant repository write access.
See
[GitHub’s OIDC permission reference](https://docs.github.com/en/actions/reference/security/oidc#required-permission).

After trusted publishing is configured, npm publishing access should require two-factor
authentication and disallow traditional write tokens.
npm documents this as its recommended configuration.
The release workflow uses GitHub-hosted runners and Node.js 24, matching npm’s current
trusted-publishing requirements.

## Prepare a Release

### 1. Start From Clean `main`

```bash
git switch main
git pull --ff-only
git status --short
```

Stop if the checkout has uncommitted changes or local commits not present on the remote.

### 2. Review Pending Changesets

```bash
ls .changeset/*.md
git log "$(git describe --tags --abbrev=0)"..HEAD --oneline
```

Each user-visible change needs one accurate Changeset summary.
Do not add a duplicate when the merged pull request already supplied one.
If a release has no appropriate changeset, create one non-interactively:

```bash
pnpm changeset:add minor 0.2.0 "Add validation APIs and harden CLI test results"
```

Choose the bump from the public compatibility impact:

| Bump | Use for |
| --- | --- |
| `patch` | Compatible fixes and documentation corrections |
| `minor` | Backward-compatible features |
| `major` | Breaking public API or file-format changes |

The version argument to `changeset:add` documents the intended target; Changesets
calculates the actual version from the package state and all pending changesets.

### 3. Apply the Version

```bash
pnpm version-packages
git diff -- packages/tryscript/package.json packages/tryscript/CHANGELOG.md .changeset
```

Confirm that:

- the package version is the intended SemVer version;
- consumed changeset files were removed;
- the changelog describes user-visible behavior in present tense; and
- fixes that can turn a false pass into a real failure are called out explicitly.

The verification gate must also confirm that the tarball contains the repository MIT
license, both declaration formats compile for a strict v0.1.7 consumer, and the pinned
v0.1.7 corpus differs only in reviewed tryscript CLI snapshots.

### 4. Verify and Commit

```bash
pnpm verify
pnpm --filter tryscript test:coverage
git add packages/tryscript/package.json packages/tryscript/CHANGELOG.md .changeset
git commit -m "chore: release tryscript v0.2.0"
git push
```

If branch protection requires a pull request, push a release branch, merge it through
the normal review process, then update the local `main` checkout before tagging.

## Publish the Release

Create the tag only after the version commit is on `origin/main`:

```bash
git fetch origin main --tags
git status --short --branch
git tag --list v0.2.0
git tag -a v0.2.0 -m "tryscript v0.2.0"
git push origin v0.2.0
```

The `git tag --list` command must return no existing tag.
The push starts the release workflow, which:

1. installs the frozen lockfile with dependency scripts disabled;
2. runs the release-quality verification gate;
3. packs and transfers the verified tarball between jobs with SHA-pinned official
   artifact actions;
4. confirms that the tag and packed package version match;
5. publishes that tarball through npm OIDC without rebuilding it; and
6. creates a GitHub release from the matching changelog section in a job without OIDC
   authority.

Watch the specific run through completion:

```bash
gh run list --workflow release.yml --limit 3
gh run watch <run-id> --exit-status
```

## Verify the Published Release

```bash
npm view tryscript@0.2.0 version dist.integrity dist.tarball
gh release view v0.2.0 --repo jlevy/tryscript
```

Also confirm that the npm page shows provenance and that the GitHub release notes match
the `0.2.0` changelog section.

## Failure Recovery

- **Verification failed before publish:** Fix the version commit on `main`. If the tag
  has not been pushed, tag the corrected commit.
  If it has been pushed, inspect the run before changing any reference.
- **Publish succeeded but release creation failed:** Keep the immutable tag and npm
  version. Repair or create the GitHub release from the existing tag.
- **The npm version already exists:** Never overwrite it.
  Prepare a new patch release.
- **OIDC authentication failed:** Confirm the npm trusted-publisher fields, the
  `id-token: write` permission, the GitHub-hosted runner, and the allowed `npm publish`
  action against the
  [npm troubleshooting guidance](https://docs.npmjs.com/trusted-publishers/#troubleshooting).
- **The first publish of a new package is required:** A maintainer must establish the
  package on npm before configuring its trusted publisher.
  This does not apply to the existing `tryscript` package.

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->

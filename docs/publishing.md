# Publishing tryscript

Tryscript versions its single published package by hand and publishes through a
tag-triggered GitHub Actions workflow.
The workflow verifies the repository, publishes through npm trusted publishing, and
creates the GitHub release from the changelog section matching the tag.

## Release Contract

- Release preparation happens on `main` in a clean checkout.
- Release preparation bumps the version in `packages/tryscript/package.json` and adds
  the matching `## X.Y.Z` section to `packages/tryscript/CHANGELOG.md`.
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

The repository publishes one package, so versioning is a single decision per release
rather than a per-pull-request declaration.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the
registry authentication model.

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

### 2. Review the Commits Since the Last Tag

```bash
git log "$(git describe --tags --abbrev=0)"..HEAD --oneline
```

Read the commit subjects and the diffs behind anything user-visible.
The changelog describes the difference between the last released version and this one,
not the path taken to get there: a defect introduced and fixed on a branch since the
last tag never reached users and is part of the change that introduced it, not a
separate fix.

Choose the bump from the public compatibility impact:

| Bump | Use for |
| --- | --- |
| `patch` | Compatible fixes and documentation corrections |
| `minor` | Backward-compatible features |
| `major` | Breaking public API or file-format changes |

### 3. Set the Version and Write the Changelog

Set the new version in `packages/tryscript/package.json`, then head
`packages/tryscript/CHANGELOG.md` with the matching section:

```markdown
## 0.2.1

### Features

- ...

### Fixes

- ...
```

Rename an existing `## Unreleased` heading to the release version rather than adding a
second section. The heading must read exactly `## X.Y.Z`, because the release workflow
extracts that section verbatim for the GitHub release.

Confirm that:

- the package version is the intended SemVer version and matches the changelog heading;
- the changelog describes user-visible behavior in present tense; and
- fixes that can turn a false pass into a real failure are called out explicitly.

The verification gate must also confirm that the tarball contains the repository MIT
license, both declaration formats compile for a strict v0.1.7 consumer, and the pinned
v0.1.7 corpus differs only in reviewed tryscript CLI snapshots.

### 4. Verify and Commit

```bash
pnpm verify
pnpm --filter tryscript test:coverage
git add packages/tryscript/package.json packages/tryscript/CHANGELOG.md
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

### Tagging From a Proxied Agent Session

A remote agent session routes `git push` through a ref-scoped credential broker: pushes
to `refs/heads/*` succeed, and pushes to `refs/tags/*` are refused with HTTP 403 at
receive-pack. `git push --dry-run` passes for a tag the broker then refuses, so it does
not detect this, and the session proxy records no egress failure.

That 403 is not an egress denial and must not be reported as one.
A GitHub-host 403 carrying no `x-github-request-id` header came from the mediation
layer, not GitHub. Confirm the direct channel, then create the tag through it:

```bash
export NO_PROXY="api.github.com,github.com,release-assets.githubusercontent.com,objects.githubusercontent.com,codeload.github.com,raw.githubusercontent.com,uploads.github.com${NO_PROXY:+,$NO_PROXY}"
export no_proxy="$NO_PROXY"
gh auth status

SHA=$(git rev-parse origin/main)
TAG_SHA=$(gh api repos/jlevy/tryscript/git/tags -f tag=v0.2.0 \
  -f message="tryscript v0.2.0" -f object="$SHA" -f type=commit --jq '.sha')
gh api repos/jlevy/tryscript/git/refs -f ref=refs/tags/v0.2.0 -f sha="$TAG_SHA"
```

Those two calls are the annotated tag that `git tag -a` would have created, and creating
the ref starts the release workflow exactly as pushing the tag would.
See `tbd shortcut setup-github-cli` for the full channel model.

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

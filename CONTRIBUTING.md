# Contributing

This repository follows a simplified [Gitflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow) —
without intermediate `release/*` branches — combined with [SemVer](https://semver.org/)
versioning. The Atlassian article is background reading only: everything you
need to actually do the three common workflows (feature, release, hotfix) is
below.

> **Note on repository history:** the branching rules below take effect only
> after the manual setup checklist (last section) has been completed. Until
> then, `develop` does not exist yet and this very document was merged
> directly into `main`.

## Branches

| Branch | Branches from | Merges into | Notes |
| --- | --- | --- | --- |
| `main` | — | — | Production state only. No direct commits. Every commit on `main` that represents a release is tagged `vX.Y.Z`. |
| `develop` | `main` | — | Integration branch, the default branch of the repository. All features land here first. |
| `feature/CTLDD-<N>-short-slug` | `develop` | `develop` | Any feature, chore, or the release-preparation commit (see the release checklist). Merged back with `--no-ff`. |
| `hotfix/CTLDD-<N>-short-slug` | `main` | `main` **and** `develop` | Urgent fix for production. Merged into both with `--no-ff`. |

There is no dedicated branch type for releases: preparing a release (bumping
the version, closing the changelog) is just another `feature/*` branch, keyed
to a tracker issue like everything else.

Branch names use the tracker issue key in upper case followed by a
kebab-case slug, matching the project's commit convention
(`<ISSUE-ID>: <imperative summary>`), e.g.:

```
feature/CTLDD-42-add-dark-mode
hotfix/CTLDD-57-fix-sync-crash
```

## Working on a feature

```bash
git switch develop
git pull

git switch -c feature/CTLDD-42-add-dark-mode
# ...commit your changes, one or more commits...
git push -u origin feature/CTLDD-42-add-dark-mode
```

Open a pull request into `develop`. Merge it using **"Create a merge
commit"** (`--no-ff`) — do not squash or rebase-merge — so the feature
branch is preserved as a single mergeable unit in history. Delete the
branch after merging.

## Quality gates

- `npm run lint` and `npm run build` must pass before merging.
- The local pre-commit hook (`.husky/pre-commit` → `npx lint-staged` →
  `npm run format`) reformats staged files on every commit — this is
  expected and not something to fight (see ADR-0013). Commit the result.

## Versioning

- The project follows [SemVer](https://semver.org/): `MAJOR.MINOR.PATCH`.
  - `MAJOR` — breaking changes.
  - `MINOR` — backwards-compatible features.
  - `PATCH` — backwards-compatible fixes, including hotfixes.
- Git tags `vX.Y.Z` are only ever created on commits in `main`.
- `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/) and
  is maintained by hand. Ongoing changes accumulate under
  `## [Unreleased]`; a release closes that section into a dated,
  versioned one.

## Release checklist

A release is a PR from `develop` into `main` — there is no `release/*`
branch. Bumping the version and closing the changelog happen on a regular
`feature/*` branch first, because `develop` is expected to have branch
protection (no direct pushes) once the manual setup below is done.

1. `git switch develop && git pull`
2. Decide the next version per SemVer (`X.Y.Z`).
3. `git switch -c feature/CTLDD-<N>-release-vX.Y.Z`
4. Bump `"version"` in `package.json` (and the two matching `version`
   fields in `package-lock.json`: the top-level one and
   `packages[""].version`) to `X.Y.Z`.
5. In `CHANGELOG.md`, rename `## [Unreleased]` to
   `## [X.Y.Z] - YYYY-MM-DD` and add a fresh, empty `## [Unreleased]`
   section above it.
6. Commit: `git commit -am "CTLDD-<N>: release vX.Y.Z"`.
7. Push and open a PR into `develop`, merge with `--no-ff`.
8. Open a PR from `develop` into `main`, merge with `--no-ff`.
9. `git switch main && git pull`
10. `git tag -a vX.Y.Z -m "vX.Y.Z"`
11. `git push origin vX.Y.Z`

If you have permission to bypass branch protection on `develop`, you may
commit the version bump and changelog edit (steps 4–6) directly to
`develop` instead of going through a `feature/*` branch and PR — steps 7
and everything after are unchanged either way.

## Hotfix checklist

A hotfix is for a bug in production that cannot wait for the next regular
release.

1. `git switch main && git pull`
2. `git switch -c hotfix/CTLDD-<N>-short-slug`
3. Fix the bug, commit.
4. Bump the `PATCH` version in `package.json` and `package-lock.json` (same
   two fields as in the release checklist) and add an entry under a new
   `## [X.Y.Z] - YYYY-MM-DD` section in `CHANGELOG.md`.
5. Push and open a PR into `main`, merge with `--no-ff`.
6. `git switch main && git pull`, then tag and push:
   `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`.
7. **Open a second PR merging the hotfix back into `develop`** (either
   directly from the hotfix branch, or from `main` into `develop`), and
   merge it with `--no-ff`.

Step 7 is mandatory: skipping it means the fix is silently lost the next
time `develop` is released into `main`, because `main` and `develop` would
otherwise diverge.

## Manual GitHub setup checklist

The following steps cannot be done by editing files in this repository and
must be performed once by a repository admin:

- [ ] Create the `develop` branch from `main`:
      `git switch -c develop main && git push -u origin develop`.
- [ ] Make `develop` the repository's default branch (Settings → Branches →
      Default branch). After this, pull requests opened by the CodePipe
      agent will target `develop` instead of `main`.
- [ ] Enable branch protection on both `main` and `develop`: disallow direct
      pushes, require a pull request before merging. After this is in
      place, even the release version bump must go through a branch and PR
      as described above (unless you have bypass permission).
- [ ] Tag the current commit on `main` as `v0.1.0` (the starting version
      introduced alongside this document):
      `git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0`.

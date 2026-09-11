#!/usr/bin/env bash
# Determines the release mode and next version for .github/workflows/release.yml.
#
# Modes:
#   bootstrap - no "v*" tag exists yet. Ship whatever version is currently
#               in package.json as the first release.
#   auto      - package.json's version equals the latest tag's version,
#               i.e. nobody manually bumped it since the last release.
#               The caller must supply RESOLVED_VERSION_FROM_DRAFTER (the
#               release-drafter dry-run output) in this mode.
#   manual    - package.json's version already differs from the latest tag,
#               meaning it was bumped by hand in this push. That value is
#               respected as-is; nothing here overwrites it.
#   skip      - the target tag (v<next_version>) already exists. Nothing
#               new to release (e.g. a re-run on the same commit).
#
# Usage: decide-version.sh
# Reads: package.json (via node -p), git tags in the current repo.
# Env:   RESOLVED_VERSION_FROM_DRAFTER (required only for mode=auto)
# Prints KEY=VALUE lines to stdout: mode, next_version, latest_tag.
set -euo pipefail

latest_tag="$(git tag --list 'v*' --sort=-v:refname | head -n1 || true)"
latest_version="${latest_tag#v}"
pkg_version="$(node -p "require('./package.json').version")"

if [ -z "$latest_tag" ]; then
  mode="bootstrap"
  next_version="$pkg_version"
elif [ "$pkg_version" = "$latest_version" ]; then
  mode="auto"
  next_version="${RESOLVED_VERSION_FROM_DRAFTER:-}"
  if [ -z "$next_version" ]; then
    echo "decide-version.sh: mode=auto but RESOLVED_VERSION_FROM_DRAFTER is empty" >&2
    exit 1
  fi
else
  mode="manual"
  next_version="$pkg_version"
fi

if git rev-parse -q --verify "refs/tags/v${next_version}" >/dev/null 2>&1; then
  mode="skip"
fi

echo "mode=${mode}"
echo "next_version=${next_version}"
echo "latest_tag=${latest_tag}"

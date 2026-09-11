#!/usr/bin/env bash
# Prepends a new CHANGELOG.md entry summarizing commits since the latest
# "v*" tag, and writes that same entry standalone to a second file (for use
# as GitHub Release notes via `gh release create --notes-file`).
#
# Content comes entirely from `git log`, read at run time — never from a
# GitHub Actions ${{ }} expression spliced into this script's text. Commit
# subjects (potentially attacker-influenced free text) only ever flow
# through git's own stdout into a file redirect, so they can't be
# interpreted as shell syntax the way an untrusted ${{ }} value embedded
# directly in a run: block could be.
#
# Usage: generate-changelog.sh <next_version> <entry_output_file>
set -euo pipefail

next_version="${1:?usage: generate-changelog.sh <next_version> <entry_output_file>}"
entry_file="${2:?usage: generate-changelog.sh <next_version> <entry_output_file>}"

latest_tag="$(git tag --list 'v*' --sort=-v:refname | head -n1 || true)"
release_date="$(date -u +%Y-%m-%d)"

{
  echo "## v${next_version} (${release_date})"
  echo
  if [ -n "$latest_tag" ]; then
    git log "${latest_tag}..HEAD" --pretty=format:'- %s (%h)' --no-merges
  else
    git log --pretty=format:'- %s (%h)' --no-merges
  fi
  echo
} > "$entry_file"

if [ -f CHANGELOG.md ] && [ "$(head -n1 CHANGELOG.md)" = "# Changelog" ]; then
  # Keep the top-level "# Changelog" header first, insert the new entry
  # right after it, then the rest of the existing file (skipping the
  # header line and one following blank line, if present).
  {
    echo "# Changelog"
    echo
    cat "$entry_file"
    echo
    tail -n +2 CHANGELOG.md | sed '/./,$!d'
  } > CHANGELOG.md.new
elif [ -f CHANGELOG.md ]; then
  # Existing file without our expected header: prepend above it as-is.
  cat "$entry_file" <(echo) CHANGELOG.md > CHANGELOG.md.new
else
  { echo "# Changelog"; echo; cat "$entry_file"; } > CHANGELOG.md.new
fi
mv CHANGELOG.md.new CHANGELOG.md

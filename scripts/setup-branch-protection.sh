#!/usr/bin/env bash
# Enable classic branch protection for a branch (default: main) through the GitHub API.
#
# It requires a pull request plus the CI checks defined in .github/workflows/ci.yml
# before anything can land on the branch, and blocks force pushes and deletions.
#
# Requires: gh CLI authenticated as a user with admin access to the repository, and jq.
# Inspect the payload first with: ./scripts/setup-branch-protection.sh --dry-run
set -euo pipefail

BRANCH="main"
REPO=""
APPROVALS="0"
ENFORCE_ADMINS="true"
DRY_RUN="false"

# Job names as declared in .github/workflows/ci.yml — must match exactly.
CHECKS=(
  "Backend · typecheck / lint / build / unit / e2e"
  "Frontend · build"
)

usage() {
  cat <<'USAGE'
Usage: scripts/setup-branch-protection.sh [options]

Protect a branch with a required pull request and the CI status checks.

Options:
  --repo <owner/name>   Repository to configure (default: parsed from the origin remote)
  --branch <name>       Branch to protect (default: main)
  --approvals <n>       Required approving reviews (default: 0, so you can merge your own PR)
  --no-enforce-admins   Let repository admins bypass the rule
  --dry-run             Print the JSON payload and exit without calling the API
  -h, --help            Show this help

Examples:
  ./scripts/setup-branch-protection.sh --dry-run
  ./scripts/setup-branch-protection.sh
USAGE
}

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      [ -n "$REPO" ] || die "--repo needs an owner/name value"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      [ -n "$BRANCH" ] || die "--branch needs a branch name"
      shift 2
      ;;
    --approvals)
      APPROVALS="${2:-}"
      case "$APPROVALS" in
        ''|*[!0-9]*) die "--approvals needs a non-negative integer" ;;
      esac
      shift 2
      ;;
    --no-enforce-admins)
      ENFORCE_ADMINS="false"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1 (use --help)"
      ;;
  esac
done

resolve_repo() {
  local url
  url="$(git remote get-url origin 2>/dev/null)" || return 0
  url="${url%.git}"
  case "$url" in
    git@github.com:*) printf '%s\n' "${url#git@github.com:}" ;;
    ssh://git@github.com/*) printf '%s\n' "${url#ssh://git@github.com/}" ;;
    https://github.com/*) printf '%s\n' "${url#https://github.com/}" ;;
    *) printf '\n' ;;
  esac
}

build_payload() {
  command -v jq >/dev/null 2>&1 || die "jq is required (e.g. apt install jq / brew install jq)"
  local checks
  checks="$(printf '%s\n' "${CHECKS[@]}" | jq -R . | jq -s .)"
  jq -n \
    --argjson checks "$checks" \
    --argjson approvals "$APPROVALS" \
    --argjson enforce_admins "$ENFORCE_ADMINS" \
    '{
      required_status_checks: { strict: true, contexts: $checks },
      enforce_admins: $enforce_admins,
      required_pull_request_reviews: { required_approving_review_count: $approvals },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false
    }'
}

[ -n "$REPO" ] || REPO="$(resolve_repo)"
[ -n "$REPO" ] || die "cannot detect the repository; pass --repo <owner/name>"

payload="$(build_payload)"

if [ "$DRY_RUN" = "true" ]; then
  printf '%s\n' "$payload"
  exit 0
fi

command -v gh >/dev/null 2>&1 || die "gh CLI is required: https://cli.github.com"
gh auth status --hostname github.com >/dev/null 2>&1 ||
  die "gh is not authenticated; run: gh auth login --hostname github.com"

if ! admin="$(gh api "repos/$REPO" --jq '.permissions.admin // false' 2>/dev/null)"; then
  die "cannot read $REPO through the API; check that gh is authenticated with the repo scope and the repository exists"
fi
if [ "$admin" != "true" ]; then
  die "the authenticated GitHub user is not an admin of $REPO"
fi

printf 'Enabling branch protection on %s (%s)...\n' "$BRANCH" "$REPO"
printf '%s' "$payload" |
  gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input - >/dev/null

gh api "repos/$REPO/branches/$BRANCH/protection" \
  --jq '"Protected: pull request required, checks: \(.required_status_checks.contexts | join(" | ")), strict=\(.required_status_checks.strict), force-push allowed=\(.allow_force_pushes.enabled)"'

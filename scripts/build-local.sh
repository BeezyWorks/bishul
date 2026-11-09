#!/usr/bin/env bash
# Builds the iOS app on this machine with `eas build --local` (no EAS build credits) and submits the
# .ipa to TestFlight. Modelled on the Siddur's script, iOS only.
#
# EAS stays the source of truth for signing credentials and build numbers (appVersionSource:
# remote + autoIncrement), so local and cloud builds never diverge.
#
# Like the Siddur, it only builds semver release tags (vX.Y.Z), from a throwaway git worktree, so
# your working tree (dirty or not) is never touched and every build in TestFlight maps back to an
# exact commit and changelog entry. CI cuts the tag after a push to main (semantic-release bumps
# package.json, which app.config.ts uses as the app version); `git pull --tags`, then ship.
#
# Usage: scripts/build-local.sh [options]        (or: pnpm ship)
#   --ref <vX.Y.Z>  semver release tag to build (default: latest)
#   --profile <n>   EAS build profile (default: production; others skip submit)
#   --no-submit     build only; leave the .ipa in .build-local/
#   --keep          keep the worktree afterwards (for debugging)
#   --interactive   let EAS prompt (Apple login, capability sync). Needed the first time, to create
#                   the App Store Connect record; afterwards put its id in eas.json as
#                   submit.production.ios.ascAppId so submits run unattended.
set -euo pipefail

PROFILE="production"
REF=""
SUBMIT=1
KEEP=0
INTERACTIVE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift ;;
    --ref) REF="$2"; shift ;;
    --no-submit) SUBMIT=0 ;;
    --keep) KEEP=1 ;;
    --interactive) INTERACTIVE=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

REPO="$(git rev-parse --show-toplevel)"
OUT="$REPO/.build-local"
EAS=(npx --yes eas-cli)
mkdir -p "$OUT"
die() { echo "error: $*" >&2; exit 1; }

# Only production builds are store-bound.
[[ "$PROFILE" != "production" ]] && SUBMIT=0

# EAS asks for the Apple Team ID on every iOS build; answer it from the environment or eas.json.
if [[ -z "${EXPO_APPLE_TEAM_ID:-}" ]]; then
  EXPO_APPLE_TEAM_ID="$(grep -oE '"appleTeamId": *"[A-Z0-9]{10}"' "$REPO/eas.json" | head -1 | grep -oE '[A-Z0-9]{10}' || true)"
  [[ -n "$EXPO_APPLE_TEAM_ID" ]] && export EXPO_APPLE_TEAM_ID
fi

# --- preflight -------------------------------------------------------------
command -v pnpm >/dev/null || die "pnpm not found"
command -v xcodebuild >/dev/null || die "Xcode command line tools missing"
command -v pod >/dev/null || die "CocoaPods missing (brew install cocoapods)"
command -v fastlane >/dev/null || die "fastlane missing (brew install fastlane), required by eas build --local"
"${EAS[@]}" whoami >/dev/null 2>&1 || die "not logged in to EAS (run: npx eas-cli login, or set EXPO_TOKEN)"
if [[ $SUBMIT -eq 1 && $INTERACTIVE -eq 0 ]] && ! grep -q '"ascAppId"' "$REPO/eas.json"; then
  die "no ascAppId in eas.json: run 'pnpm ship --interactive' once to create the App Store Connect record, then add its id"
fi

# --- source tree -----------------------------------------------------------
WORKTREE=""
cleanup() {
  if [[ -n "$WORKTREE" && $KEEP -eq 0 ]]; then
    git -C "$REPO" worktree remove --force "$WORKTREE" 2>/dev/null || true
  fi
}
trap cleanup EXIT

git -C "$REPO" fetch --tags --quiet || echo "warning: could not fetch tags, using local ones"
if [[ -z "$REF" ]]; then
  REF="$(git -C "$REPO" tag --list 'v*' --sort=-v:refname | head -1)"
  [[ -n "$REF" ]] || die "no release tag found (CI creates vX.Y.Z after a push to main)"
fi
[[ "$REF" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "--ref must be a semver tag like v0.2.0 (got '$REF')"
git -C "$REPO" rev-parse -q --verify "refs/tags/$REF" >/dev/null || die "tag $REF does not exist"
SHA="$REF"
WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/tavshil-build.XXXXXX")"
echo "==> Building $REF in $WORKTREE"
git -C "$REPO" worktree add --detach "$WORKTREE" "$SHA" >/dev/null
VERSION="$(node -p "require('$WORKTREE/package.json').version")"
[[ "v$VERSION" == "$REF" ]] || die "package.json version ($VERSION) does not match tag $REF"
# The calendar engine is a submodule (packages/engine).
git -C "$WORKTREE" submodule update --init --recursive --quiet
(cd "$WORKTREE" && pnpm install --frozen-lockfile)

# --- build + submit --------------------------------------------------------
NI="--non-interactive"
[[ $INTERACTIVE -eq 1 ]] && NI=""
ARTIFACT="$OUT/tavshil-${SHA}-ios-$(date +%Y%m%d-%H%M%S).ipa"

echo "==> building ($PROFILE)"
(cd "$WORKTREE" && "${EAS[@]}" build --platform ios --profile "$PROFILE" --local $NI --output "$ARTIFACT")
echo "==> artifact: $ARTIFACT"

if [[ $SUBMIT -eq 1 ]]; then
  echo "==> submitting to TestFlight"
  (cd "$WORKTREE" && "${EAS[@]}" submit --platform ios --profile "$PROFILE" --path "$ARTIFACT" $NI)
fi
echo "==> Done. Artifacts in $OUT"

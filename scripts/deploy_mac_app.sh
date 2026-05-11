#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT_DIR="$REPO_ROOT/TimeScapeMac/TimeScape Planner Pro"
PROJECT_FILE="$PROJECT_DIR/TimeScape Planner Pro.xcodeproj"
PBXPROJ_FILE="$PROJECT_FILE/project.pbxproj"
SCHEME="TimeScape Planner Pro"

DERIVED_DATA_DIR="$REPO_ROOT/.build/TimeScapePlannerPro"
BUILT_APP="$DERIVED_DATA_DIR/Build/Products/Release/TimeScape Planner Pro.app"
INSTALL_APP="/Applications/TimeScape Planner Pro.app"

BUNDLE_ID="TimeScapesViewss.TimeScape-Planner-Pro"
LEGACY_DATA_FILE="$HOME/Library/Application Support/TimeScapePlannerPro/planner-state.json"
SANDBOX_DATA_FILE="$HOME/Library/Containers/$BUNDLE_ID/Data/Library/Application Support/TimeScapePlannerPro/planner-state.json"
BACKUP_DIR="$HOME/Library/Application Support/TimeScapePlannerPro/backups"

BUMP_KIND="build"
EXPLICIT_VERSION=""
EXPLICIT_BUILD=""
DRY_RUN=0
LAUNCH_APP=1

usage() {
  cat <<'EOF'
Usage: scripts/deploy_mac_app.sh [options]

Builds and installs the macOS app to /Applications, while preserving user data.

Options:
  --bump <build|patch|minor|major|none>  Version bump strategy (default: build)
  --version <x.y.z>                       Set MARKETING_VERSION explicitly
  --build <n>                             Set CURRENT_PROJECT_VERSION explicitly
  --dry-run                               Print planned actions, do not change files
  --no-launch                             Do not open the app after install
  --help                                  Show this help

Examples:
  scripts/deploy_mac_app.sh
  scripts/deploy_mac_app.sh --bump patch
  scripts/deploy_mac_app.sh --version 1.2.0 --build 14
  scripts/deploy_mac_app.sh --bump minor --dry-run
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump)
      BUMP_KIND="${2:-}"
      shift 2
      ;;
    --version)
      EXPLICIT_VERSION="${2:-}"
      shift 2
      ;;
    --build)
      EXPLICIT_BUILD="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-launch)
      LAUNCH_APP=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

case "$BUMP_KIND" in
  build|patch|minor|major|none) ;;
  *)
    echo "Invalid --bump value: $BUMP_KIND"
    exit 1
    ;;
esac

if [[ ! -f "$PBXPROJ_FILE" ]]; then
  echo "Could not find project file: $PBXPROJ_FILE"
  exit 1
fi

if [[ -n "$EXPLICIT_VERSION" ]] && [[ ! "$EXPLICIT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid --version value. Expected x.y.z"
  exit 1
fi

if [[ -n "$EXPLICIT_BUILD" ]] && [[ ! "$EXPLICIT_BUILD" =~ ^[0-9]+$ ]]; then
  echo "Invalid --build value. Expected integer"
  exit 1
fi

current_version="$(grep -m1 'MARKETING_VERSION = ' "$PBXPROJ_FILE" | sed -E 's/.*MARKETING_VERSION = ([^;]+);/\1/')"
current_build="$(grep -m1 'CURRENT_PROJECT_VERSION = ' "$PBXPROJ_FILE" | sed -E 's/.*CURRENT_PROJECT_VERSION = ([0-9]+);/\1/')"

if [[ -z "$current_version" || -z "$current_build" ]]; then
  echo "Unable to read current MARKETING_VERSION or CURRENT_PROJECT_VERSION."
  exit 1
fi

IFS='.' read -r current_major current_minor current_patch <<< "$current_version"

next_version="$current_version"
next_build="$current_build"

if [[ -n "$EXPLICIT_VERSION" ]]; then
  next_version="$EXPLICIT_VERSION"
else
  case "$BUMP_KIND" in
    patch)
      next_version="$current_major.$current_minor.$((current_patch + 1))"
      ;;
    minor)
      next_version="$current_major.$((current_minor + 1)).0"
      ;;
    major)
      next_version="$((current_major + 1)).0.0"
      ;;
    build|none)
      next_version="$current_version"
      ;;
  esac
fi

if [[ -n "$EXPLICIT_BUILD" ]]; then
  next_build="$EXPLICIT_BUILD"
else
  case "$BUMP_KIND" in
    none)
      next_build="$current_build"
      ;;
    *)
      next_build="$((current_build + 1))"
      ;;
  esac
fi

print_step() {
  echo ""
  echo "==> $1"
}

run_or_print() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] '
    printf '%q ' "$@"
    echo ""
  else
    "$@"
  fi
}

print_step "Version plan"
echo "Current version/build: $current_version ($current_build)"
echo "Next version/build:    $next_version ($next_build)"

print_step "Backing up user data"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] mkdir -p $BACKUP_DIR"
  if [[ -f "$SANDBOX_DATA_FILE" || -f "$LEGACY_DATA_FILE" ]]; then
    [[ -f "$SANDBOX_DATA_FILE" ]] && echo "[dry-run] cp $SANDBOX_DATA_FILE $BACKUP_DIR/planner-state-sandbox-<timestamp>.json"
    [[ -f "$LEGACY_DATA_FILE" ]] && echo "[dry-run] cp $LEGACY_DATA_FILE $BACKUP_DIR/planner-state-legacy-<timestamp>.json"
  else
    echo "No planner data file found yet; backup will be skipped."
  fi
else
  mkdir -p "$BACKUP_DIR"
  ts="$(date +%Y%m%d-%H%M%S)"
  backed_up=0
  if [[ -f "$SANDBOX_DATA_FILE" ]]; then
    sandbox_backup="$BACKUP_DIR/planner-state-sandbox-$ts.json"
    cp "$SANDBOX_DATA_FILE" "$sandbox_backup"
    echo "Backup created: $sandbox_backup"
    backed_up=1
  fi
  if [[ -f "$LEGACY_DATA_FILE" ]]; then
    legacy_backup="$BACKUP_DIR/planner-state-legacy-$ts.json"
    cp "$LEGACY_DATA_FILE" "$legacy_backup"
    echo "Backup created: $legacy_backup"
    backed_up=1
  fi
  if [[ "$backed_up" -eq 0 ]]; then
    echo "No planner data file found yet; backup skipped."
  else
    [[ -f "$SANDBOX_DATA_FILE" ]] && echo "Source data: $SANDBOX_DATA_FILE"
    [[ -f "$LEGACY_DATA_FILE" ]] && echo "Source data: $LEGACY_DATA_FILE"
  fi
fi

print_step "Updating project version/build"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] Update all MARKETING_VERSION = ...; -> $next_version"
  echo "[dry-run] Update all CURRENT_PROJECT_VERSION = ...; -> $next_build"
else
  pbx_backup="$PBXPROJ_FILE.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$PBXPROJ_FILE" "$pbx_backup"
  echo "Project backup: $pbx_backup"

  perl -0pi -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $next_version;/g" "$PBXPROJ_FILE"
  perl -0pi -e "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = $next_build;/g" "$PBXPROJ_FILE"
fi

print_step "Building Release"
run_or_print xcodebuild \
  -project "$PROJECT_FILE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -derivedDataPath "$DERIVED_DATA_DIR" \
  build

if [[ "$DRY_RUN" -eq 0 ]] && [[ ! -d "$BUILT_APP" ]]; then
  echo "Build completed but app not found at: $BUILT_APP"
  exit 1
fi

print_step "Closing running app"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] osascript -e 'tell application \"TimeScape Planner Pro\" to quit'"
else
  osascript -e 'tell application "TimeScape Planner Pro" to quit' >/dev/null 2>&1 || true
  for _ in {1..10}; do
    if ! pgrep -f 'TimeScape Planner Pro.app/Contents/MacOS/TimeScape Planner Pro' >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
  if pgrep -f 'TimeScape Planner Pro.app/Contents/MacOS/TimeScape Planner Pro' >/dev/null 2>&1; then
    pkill -f 'TimeScape Planner Pro.app/Contents/MacOS/TimeScape Planner Pro' >/dev/null 2>&1 || true
    sleep 1
  fi
fi

print_step "Installing to /Applications"
run_or_print sudo rm -rf "$INSTALL_APP"
run_or_print sudo ditto "$BUILT_APP" "$INSTALL_APP"

if [[ "$LAUNCH_APP" -eq 1 ]]; then
  print_step "Launching installed app"
  run_or_print open "$INSTALL_APP"
fi

print_step "Done"
echo "Installed app: $INSTALL_APP"
echo "User data file (sandbox): $SANDBOX_DATA_FILE"
echo "User data file (legacy):  $LEGACY_DATA_FILE"
echo "Backups: $BACKUP_DIR"

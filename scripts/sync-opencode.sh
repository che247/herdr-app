#!/usr/bin/env bash
# Syncs the OpenCode plugin that feeds Herdr's agent cards (model, effort, HP).
#   ./scripts/sync-opencode.sh export   copy from ~/.config/opencode into this repo
#   ./scripts/sync-opencode.sh install  copy from this repo into ~/.config/opencode
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)/opencode"
live="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"

case "${1:-}" in
  export)
    mkdir -p "$repo/herdr-cards"
    cp "$live/herdr-cards/tui.js" "$repo/herdr-cards/tui.js"
    cp "$live/cli.json" "$repo/cli.json"
    echo "Exported OpenCode files into $repo"
    ;;
  install)
    mkdir -p "$live/herdr-cards"
    cp "$repo/herdr-cards/tui.js" "$live/herdr-cards/tui.js"
    if [ -f "$live/cli.json" ] && ! cmp -s "$repo/cli.json" "$live/cli.json"; then
      cp "$live/cli.json" "$live/cli.json.bak-$(date +%Y%m%d%H%M%S)"
    fi
    cp "$repo/cli.json" "$live/cli.json"
    # cli.json loads the plugin by absolute path; point it at this machine's folder.
    sed -i "s#\"[^\"]*/herdr-cards\"#\"$live/herdr-cards\"#" "$live/cli.json"
    echo "Installed OpenCode files into $live"
    ;;
  *)
    echo "usage: $0 export|install" >&2
    exit 1
    ;;
esac

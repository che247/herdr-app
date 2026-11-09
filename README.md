# Herdr Traveler setup

My personal Herdr app configuration: the **Traveler** layout (dusk navy and gold, pixel-art sprites), numbered tabs with `Ctrl+B` → number navigation, and agent cards that show `<space>: <tab>`, the model and effort, and remaining usage this cycle as an HP meter.

## What's here

| Path | What it is |
|---|---|
| `layouts/traveler.json` | The Traveler window layout |
| `layouts/user-main.json` | Personal variant of the main layout |
| `themes/traveler-dusk.json` | The Traveler color theme |
| `mods/traveler-*`, `mods/user-*`, `mods/inbox` | Personal mods: tabs, spaces, agent cards, chrome, pane header, prefix keys |
| `keys.json`, `settings.json`, `wsl-shell.toml` | Keys, preferences, WSL shell |
| `opencode/` | OpenCode plugin that feeds the agent cards (lives in `~/.config/opencode`) |
| `scripts/sync-opencode.sh` | Copies the OpenCode files between this repo and `~/.config/opencode` |

Herdr's own state (`view.json`, `shared.json`, `data/`, `layouts/.state/`, …) and its shipped layouts and mods are ignored; Herdr recreates them.

## Restore on a new machine

1. Clone this repo into `~/.config/herdr-app` (Windows: `C:\Users\<you>\.config\herdr-app`), or copy its files there.
2. From WSL (or wherever OpenCode runs): `./scripts/sync-opencode.sh install`
3. Switch to the layout: `herdr-app do layout.switch --name traveler`

## Saving changes

After editing the OpenCode plugin, run `./scripts/sync-opencode.sh export` first, then commit as usual.

# Herdr configurations for macOS and Windows/WSL

My personal Herdr app configuration: the **Traveler** layout (dusk navy and gold, pixel-art sprites), numbered tabs with `Ctrl+B` → number navigation, and agent cards that show `<space>: <tab>`, the model and effort, and remaining usage this cycle as an HP meter.

## What's here

| Path | What it is |
|---|---|
| `layouts/traveler.json` | The Traveler window layout |
| `layouts/user-main.json` | Personal variant of the main layout |
| `themes/traveler-dusk.json` | The Traveler color theme |
| `mods/traveler-*`, `mods/user-*` | Personal mods: tabs, spaces, agent cards, chrome, pane header, prefix keys |
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

## macOS and Windows/WSL compatibility

Both personal layouts live in the same repository. Select `traveler` on the
Windows/WSL machine and `pixel-art` on the Mac:

```sh
herdr-app do layout.switch --name traveler
# On macOS:
herdr-app do layout.switch --name pixel-art
```

The shared key file preserves Windows/WSL shortcuts and the Traveler and
user-main prefix handlers. Command shortcuts are also available for macOS.
The pixel layout overrides conflicting Control and Option keys, including
Control+number for spaces and Option+arrow for shell word navigation.
Layout selection, pane names, session metadata and window state stay local
and are ignored by Git. The Windows WSL shell file remains available; do not
apply it as a shell configuration on the Mac.

The pixel layout includes custom program and space icons, pane naming,
named new tabs, confirmation before killing a pane, and Codex quota meters.
Its optional Codex reader requires Python 3 and finds `hc` on PATH, falling
back to `~/.local/bin/hc`. It reads local cached sessions and terminal footers;
remote terminals do not receive guessed local usage. When Python or the core
is unavailable, the cards show usage as unavailable.

Run `bash scripts/sync-opencode.sh install` on the machine where OpenCode runs
(inside WSL for the Windows setup). The installer requires Python 3, backs up
an existing differing CLI configuration, and rewrites the plugin path for that
machine. It supports macOS and Linux without GNU sed. On export, the plugin
path may be machine-specific; install rewrites it again at the destination.

## Validation

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/test_agent_tiles.cjs
bash -n scripts/sync-opencode.sh
```

Check each personal mod with `herdr-app check mods/<name>` in the native app
environment. Then test both layouts in the app: prefix navigation in Traveler,
Command shortcuts and Control+B chords in the pixel layout, naming dialogs,
pane close confirmation, splits and agent cards. Automated checks do not
replace a native UI check on each operating system.

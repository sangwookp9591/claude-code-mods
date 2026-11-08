# Blackbox

A flight recorder for Claude Code. Blackbox watches every tool call of the session and gives you four views of it in a pane beside the chat, a recording band above the prompt, and a one-line impact card under every edit.

- **Radar.** A live radar of the last 90 seconds. Each tool call lands as a blip in its lane (read, find, edit, run, web, agent). Running calls pulse, failures show `✗`, blocked calls show `⊘`, and a sweep line moves across. Click a blip or use the arrow keys to inspect it; an edit shows its diff right there.
- **Reel.** Every Edit, Write and MultiEdit as a replayable diff. Step through them with `p` and `n`.
- **Guard.** Rules that run before every tool call: recursive force delete, force push, `git reset --hard`, piping a download into a shell, and writing `.env` files. A match is denied and Claude is told which rule stopped it. Toggle each rule; your choice is kept across sessions.
- **Debrief.** One press asks Haiku to read the diffs, failures and blocks and write what changed, what to watch out for, and the next step. It costs a few cents and runs only when you press it.

While a turn runs the band shows `● REC 01:02 · turn #3 · 15 calls ▸ Bash npm test` with a live clock. When it ends it sums the turn up: duration, calls, `+9 −3 in 2 files`, failures and blocks.

## Install

At the prompt of a terminal session:

```
/plugin install blackbox --marketplace sangwookp9591/claude-code-mods
```

From a shell: `claude plugin install blackbox --marketplace sangwookp9591/claude-code-mods`. Answer `y` to add the marketplace, then pick a scope.

## Use

- `/blackbox` opens or closes the pane. It also opens by itself in an interactive session.
- `1` to `4` switch tabs while the pane has focus. Click the radar to give it focus for the arrow keys. Clicks need the fullscreen layout (`/tui fullscreen`).
- `×` on the band hides it; `Show band` in the pane brings it back.
- `/blackbox-reset` and `/clear` clear the recording. Guard rules stay as you set them.

## Surfaces

The radar and the live band clock are `Client` modules, drawn on the terminal and the desktop app. VS Code and mobile get a list of recent calls and a static band. The edit card is drawn on every surface.

## Develop

```
claude plugin validate ./mods/blackbox
claude plugin test ./mods/blackbox
claude --plugin-dir ./mods/blackbox
```

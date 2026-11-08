# cockpit

A session dashboard for Claude Code, built as a mod.

- **Pane** (`/cockpit` toggles it): three tabs. Overview shows context, cost and session totals as of the last finished turn, and graphs of context and turn time. Tools lists recent tool calls with their outcome and duration, page by page. Files lists the files Claude read and edited with real counts (`3e 2r` is 3 edits and 2 reads).
- **Band above the prompt** (terminal and desktop): what the current turn is doing, or how the last one ended, with a button that opens the pane. Context joins it only when it passes 60%. `Hide` removes the band, and `Show band` in the pane brings it back, as does `/cockpit-reset`.
- **Status line**: `ctx 42% · $0.31`, updated after each turn.
- **Toast** when a finished turn took longer than 90 seconds.
- **All-time totals** (sessions, tool calls) kept across sessions in the mod's store.

`/cockpit-reset` clears this session's history; `/clear` does too.

## Reading it

Context is measured when a turn finishes, so it is the value as of that turn, not a live reading. Below 60% it reads `roomy`, from 60% `filling`, and from 85% `nearly full`.

In the Tools tab, `✓` is ok, `✗` failed, `⊘` was denied by a permission rule or hook, and `◐` is still running. The list keeps the latest 300 calls. Session totals keep counting past that, and the tab says how many older calls are no longer listed.

The number keys 1 to 3 switch tabs while the pane has focus. Typing them at the prompt types digits.

Panes draw on every surface, with the same graphs and colors. The band and the status line depend on what each surface supports.

## Install

At the prompt of a terminal session:

```
/plugin install cockpit --marketplace sangwookp9591/claude-code-mods
```

During development: `claude --plugin-dir ./cockpit`.

## Develop

```
claude plugin validate ./cockpit
claude plugin test ./cockpit
```

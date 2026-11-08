# cockpit

A live session dashboard for Claude Code, built as a mod.

- **Pane** (`/cockpit` toggles it): three tabs. Overview shows a context meter, cost, turn and tool counts, and two sparklines (context per turn, turn duration). Tools lists every tool call with its outcome (running, ok, error, denied) and duration. Files ranks the files Claude read and edited, with an edit heat bar.
- **Band above the prompt**: context %, cost, and the last turn's duration and tool count, with a button to open the pane.
- **Status line**: `ctx 42% · $0.31` after each turn.
- **Toast** when a turn runs longer than 90 seconds.
- **All-time totals** (sessions, tool calls) kept across sessions in the mod's store.

`/cockpit-reset` clears this session's history; `/clear` does too.

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

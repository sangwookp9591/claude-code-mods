# mods-lab

A test bench for Claude Code mods. Each probe calls one mods API (`$.ui.toast`, `$.fs.read`, `$.model.complete` and the rest) and records whether this build answered it, with the detail it answered or the exact error text. Use it to see which mods features work in your build before you design a mod around them.

## Install

At the prompt of a terminal session:

```
/plugin install mods-lab --marketplace sangwookp9591/claude-code-mods
```

From a shell: `claude plugin install mods-lab --marketplace sangwookp9591/claude-code-mods`. Answer `y` to add the marketplace, then pick a scope.

## Use

- `/lab` opens the pane. Pick a group with its tab (hotkeys 1 to 9), then press a probe row to run it. The glyph shows the result: `·` not run, `◐` running or waiting, `✓` pass, `✗` fail.
- `Run all` runs every probe that needs neither you nor tokens. `Run tab` does the same for the open tab. `Reset` clears the results.
- `/lab run` runs the same set and prints the results into the transcript, so a headless `claude -p "/lab run"` reports them too.

Three probes need you. `model.complete` costs a few tokens, so Run all skips it. `ui.notice` arms itself and fires on the next tool call's permission dialog. The band probe draws a band above the prompt and passes when you press its `band ok` button.

The Hooks tab records events as they happen: a tool call, a prompt you send, a turn ending, a conversation row being appended, and the model calling the mod's `echo` tool (`mcp__mods-lab__echo`).

## Test

```
claude plugin validate .
claude plugin test .
```

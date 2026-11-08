# Reef

A living ASCII aquarium that sits beside the chat in Claude Code. Claude's work keeps it alive.

- Every successful tool call drops a food pellet. The nearest fish chases it and eats it.
- The first three calls each hatch a fish, then one more hatches every 4 calls. The species follows the tool: `><>` minnows for reads and searches, `><((°>` angelfish for edits, `<(°)>` pufferfish for shell commands, `{@}` jellyfish for web and MCP calls, `><===°>` whales for subagents, `/(°°)\` crabs for everything else.
- A failed call sinks a red `✗` wreck to the sand.
- Each finished turn grows the seaweed.
- After 45 quiet seconds the lights dim and the fish fall asleep.
- Click the water to drop food yourself. Click a fish to see its name and the tool call it hatched from. Clicks need the fullscreen layout (`/tui fullscreen`). On the default layout, use the Feed button.
- The reef is saved when a turn ends, so your fish are still there next session.

## Commands

- `/reef` opens or closes the aquarium pane.
- `/reef-reset` releases every fish and starts over.

## Install

```
/plugin install reef --marketplace sangwookp9591/claude-code-mods
```

The tank animates in the terminal and the desktop app. Other surfaces show the fish as a list.

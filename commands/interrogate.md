---
description: Set how much Claude asks before implementing - lite, full, ultra or off (saved for all sessions). No argument shows the current mode.
argument-hint: "[lite|full|ultra|off]"
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/interrogate.js" set $ARGUMENTS`

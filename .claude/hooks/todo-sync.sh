#!/bin/bash
# TodoSync Hook: Remind Claude to align with TODO.md
# What: After TodoWrite, reminds Claude to check TODO.md for priorities
# Why: TODO.md is the source of truth - Claude's internal list should match it
#
# This hook doesn't modify TODO.md automatically.
# Instead, it prompts Claude to manually update TODO.md when appropriate.

set -e

# Read the hook input
HOOK_INPUT=$(cat)

# Extract todos from tool_input using jq
TODOS=$(echo "$HOOK_INPUT" | jq -r '.tool_input.todos // empty')

if [ -z "$TODOS" ] || [ "$TODOS" = "null" ]; then
  exit 0
fi

# Count in_progress and completed items
IN_PROGRESS=$(echo "$TODOS" | jq -r '[.[] | select(.status == "in_progress")] | length')
COMPLETED=$(echo "$TODOS" | jq -r '[.[] | select(.status == "completed")] | length')

# Only show reminder if there are items worth syncing
if [ "$IN_PROGRESS" -gt 0 ] || [ "$COMPLETED" -gt 0 ]; then
  echo "" >&2
  echo "REMINDER: Sync your work with TODO.md" >&2
  echo "  - $IN_PROGRESS in progress, $COMPLETED completed" >&2
  echo "  - Update TODO.md if these represent real project progress" >&2
  echo "" >&2
fi

exit 0

#!/bin/bash
# Stop Hook: Ensure TODO.md is maintained before stopping
# What: Checks that TODO.md reflects session work
# Why: Prevents losing track of progress or leaving stale items
#
# Checks:
#   1. Too many completed items (>7) - should move to README.md

TODO_FILE="$CLAUDE_PROJECT_DIR/TODO.md"

# If no TODO file, nothing to check
if [ ! -f "$TODO_FILE" ]; then
  exit 0
fi

ERRORS=""

# Check: Too many completed items in TODO.md (should document in README)
COMPLETED_COUNT=$(grep -c "^\- \[x\]" "$TODO_FILE" 2>/dev/null || echo "0")
if [ "$COMPLETED_COUNT" -gt 7 ]; then
  ERRORS="${ERRORS}\n- $COMPLETED_COUNT completed items in TODO.md"
  ERRORS="${ERRORS}\n  Move production-ready features to README.md"
fi

# If there are errors, block the stop
if [ -n "$ERRORS" ]; then
  echo "" >&2
  echo "TODO.md CLEANUP NEEDED:" >&2
  echo -e "$ERRORS" >&2
  echo "" >&2
  echo "Flow: TODO.md → README.md (when production-ready)" >&2
  echo "" >&2
  exit 2
fi

exit 0

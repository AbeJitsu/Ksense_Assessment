#!/bin/bash
# UserPromptSubmit Hook: Testing Reminder
# What: Shows brief reminder when test-related keywords are detected
# Why: Gentle nudge to run tests before committing, without being verbose

set -e

USER_PROMPT=$(cat)

# Check for testing-related keywords (case-insensitive)
if echo "$USER_PROMPT" | grep -qiE '\b(test|spec|e2e|playwright|a11y|vitest)\b'; then
  echo "Testing detected - run tests before committing (see CLAUDE.md)" >&2
fi

exit 0

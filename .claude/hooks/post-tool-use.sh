#!/bin/bash
# PostToolUse Hook: Auto-lint TypeScript files after edits
# What: Automatically runs ESLint with --fix on edited .ts/.tsx files
# Why: Ensures code style consistency and catches linting issues immediately
# How: Parses tool usage JSON, filters for Edit/Write on TypeScript files, runs lint

# Read JSON input from stdin
INPUT=$(cat)

# Extract tool name and file path using jq
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.parameters.file_path // .parameters.path // empty')

# Only process Edit and Write tools
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

# Only process .ts and .tsx files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip if file is not in the app/ directory
if [[ ! "$FILE_PATH" =~ /app/ ]]; then
  exit 0
fi

# Skip node_modules and build artifacts
if [[ "$FILE_PATH" =~ node_modules|\.next|dist|build ]]; then
  exit 0
fi

# Skip if node_modules not installed (cloud environments)
if [[ ! -d "$CLAUDE_PROJECT_DIR/app/node_modules" ]]; then
  exit 0
fi

# Convert absolute path to relative path from app/ directory
RELATIVE_PATH=$(echo "$FILE_PATH" | sed "s|^.*/app/||")

# Run ESLint with --fix on the specific file
# cd into app/ directory and run npm command
# Use || true to prevent hook failures from blocking Claude
cd "$CLAUDE_PROJECT_DIR/app" && npm run lint -- --fix "$RELATIVE_PATH" &>/dev/null || true

exit 0

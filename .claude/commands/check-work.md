---
description: Check current work status and git context
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read(**/*), Grep(*), Glob(*)
---

# Check Work Status

Get a quick overview of what's being worked on—perfect for understanding progress from another Claude Code instance.

## Your Task

1. **Run git commands to gather context:**
   - `git status` - See staged and unstaged changes
   - `git diff --stat` - Summary of what changed
   - `git diff` - Full diff of unstaged changes
   - `git diff --staged` - Full diff of staged changes
   - `git log --oneline -10` - Last 10 commits to understand the pattern

2. **Analyze what's happening:**
   - What feature or fix is being worked on?
   - What files are being touched?
   - Is the work staged and ready to commit, or still in progress?
   - How does this fit with recent commits?

3. **Check for context clues:**
   - Look at TODO.md to see what was planned
   - Check if tests were added alongside feature changes
   - Look at commit messages to understand the direction

4. **Present findings in this format:**

### Summary
- Current branch and status
- Brief overview of what's in progress
- Key changes being made

### Staged Changes
- List what's ready to commit
- Any screenshots, tests, or other artifacts?

### Unstaged Changes
- What still needs to be added/fixed?

### Recent Commits
- Show the trajectory of work
- Identify patterns or themes

### Next Steps (your analysis)
- What logically comes next?
- What tests should run?
- Any blocking issues?

## Tips

- Be conversational and friendly in your analysis
- Use the context to help anticipate what needs doing next
- Flag any concerns (failing tests, incomplete features, etc.)
- Look at recent commits to understand the coding style and priorities
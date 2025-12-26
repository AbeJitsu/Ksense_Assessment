---
description: Set up screenshot test file for current branch
---

# Screenshot Setup for Current Branch

Detects which screenshot branch you're on and creates the appropriate test file.

## What This Does

1. Detects current branch name
2. Creates test file based on branch:
   - `screenshot-desktop-light` → creates `screenshots-desktop-light.spec.ts`
   - `screenshot-desktop-dark` → creates `screenshots-desktop-dark.spec.ts`
   - `screenshot-mobile-light` → creates `screenshots-mobile-light.spec.ts`
   - `screenshot-mobile-dark` → creates `screenshots-mobile-dark.spec.ts`

3. Test file includes:
   - All 27 pages (13 public + 2 dashboard + 13 admin)
   - Correct viewport configuration
   - Dark mode toggle (for dark branches)
   - Authentication helpers

## Usage

```bash
# Switch to branch
git checkout screenshot-desktop-light

# Run skill
/screenshot-setup
```

Run this ONCE per branch when you first switch to it.

## Implementation

When this skill is invoked:

1. Get current branch name using `git branch --show-current`
2. Validate it's one of the screenshot branches
3. Determine viewport (desktop: 1280×720 or mobile: 390×844)
4. Determine theme (light or dark)
5. Create test file with:
   - 13 public page tests
   - 2 dashboard tests (user + admin)
   - 13 admin page tests
   - Correct viewport configuration
   - Dark mode helper (if dark branch)
6. Report success with test file location

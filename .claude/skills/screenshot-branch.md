---
description: Create all 4 screenshot branches and set up shared infrastructure
---

# Screenshot Branch Setup

Creates all 4 screenshot branches and sets up shared Playwright config and helpers.

## What This Does

1. Creates 4 branches from dev:
   - screenshot-desktop-light
   - screenshot-desktop-dark
   - screenshot-mobile-light
   - screenshot-mobile-dark

2. On screenshot-desktop-light:
   - Updates playwright.config.ts to enable mobile project
   - Adds authentication helpers to e2e/helpers.ts
   - Commits shared infrastructure

3. Cherry-picks shared infrastructure to other 3 branches

## Usage

```
/screenshot-branch
```

Run this ONCE at the start of the project.

## Implementation

When this skill is invoked:

1. Check current branch is `dev`
2. Create all 4 branches from dev
3. Switch to screenshot-desktop-light
4. Update playwright.config.ts to enable mobile project
5. Add loginAsAdmin, loginAsUser, waitForPageReady helpers to e2e/helpers.ts
6. Commit shared changes
7. Cherry-pick to other 3 branches
8. Report success with branch list

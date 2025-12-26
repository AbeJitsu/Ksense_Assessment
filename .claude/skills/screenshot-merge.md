---
description: Merge all 4 screenshot branches into dev
---

# Merge Screenshot Branches

Merges all 4 screenshot branches into dev in the correct order.

## What This Does

1. Switches to dev branch
2. Merges branches in order:
   - screenshot-desktop-light
   - screenshot-desktop-dark
   - screenshot-mobile-light
   - screenshot-mobile-dark
3. Resolves any merge conflicts
4. Verifies final folder structure

## Usage

```
/screenshot-merge
```

Run this ONCE when all 4 branches are complete.

Expected result: Each page folder has all 4 variants (desktop-light.png, desktop-dark.png, mobile-light.png, mobile-dark.png)

## Implementation

When this skill is invoked:

1. Verify all 4 screenshot branches exist
2. Switch to dev branch
3. Merge screenshot-desktop-light
4. Merge screenshot-desktop-dark
5. Merge screenshot-mobile-light
6. Merge screenshot-mobile-dark
7. Verify final structure:
   - Check that e2e/visual-regression/ exists
   - Verify sample page has all 4 variants (e.g., public/home/)
8. Report success with folder location

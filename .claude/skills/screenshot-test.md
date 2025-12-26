---
description: Run screenshot tests for current branch
---

# Run Screenshot Tests

Runs Playwright tests for the current screenshot branch.

## What This Does

1. Detects current branch
2. Runs appropriate test file with `--update-snapshots`
3. Shows test results and screenshot locations

## Usage

```
/screenshot-test
```

Expected output:
```
🔍 Detected branch: screenshot-desktop-light
📸 Running: npm run test:e2e -- screenshots-desktop-light.spec.ts --update-snapshots

✅ 27 tests passed
📁 Screenshots saved to: e2e/visual-regression/
```

Run this after creating or updating test files.

## Implementation

When this skill is invoked:

1. Get current branch name
2. Validate it's a screenshot branch
3. Determine test file name from branch:
   - `screenshot-desktop-light` → `screenshots-desktop-light.spec.ts`
   - `screenshot-desktop-dark` → `screenshots-desktop-dark.spec.ts`
   - `screenshot-mobile-light` → `screenshots-mobile-light.spec.ts`
   - `screenshot-mobile-dark` → `screenshots-mobile-dark.spec.ts`
4. Run: `npm run test:e2e -- <test-file> --update-snapshots`
5. Report test results and screenshot location

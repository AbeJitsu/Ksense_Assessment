---
description: View screenshots for a specific page or all pages
---

# View Screenshots

Opens screenshot folder to view captured screenshots.

## What This Does

1. If page name provided: Opens specific page folder
2. If no page name: Opens root visual-regression folder

## Usage

```bash
# View specific page
/screenshot-view pricing

# View all screenshots
/screenshot-view
```

Opens in Finder (Mac) or Explorer (Windows).

## Implementation

When this skill is invoked:

1. Check if page name argument provided
2. If page name:
   - Map page name to folder path:
     - `pricing` → `e2e/visual-regression/public/pricing`
     - `products` → `e2e/visual-regression/admin/products`
     - `dashboard` → `e2e/visual-regression/dashboard/user`
   - Open that specific folder
3. If no page name:
   - Open `e2e/visual-regression/` folder
4. Use `open` command on Mac or `start` on Windows
5. Report what folder was opened

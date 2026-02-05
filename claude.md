# Claude.md - Project Context & Knowledge Base

## Project Overview

Shopify store automation toolkit for **Oil Slick Pad** (oilslickpad.com / oil-slick-pad.myshopify.com). Manages product collections, navigation menus, product imports, inventory, and catalog organization for a cannabis accessories e-commerce store.

### Vendors

| Vendor | Description | Product Count |
|--------|-------------|---------------|
| **Oil Slick** | Extraction materials, non-stick products (FEP, PTFE, silicone pads) | Original products |
| **What You Need** | Smokeshop/headshop products (bongs, rigs, pipes, accessories) | ~751 products |
| **Cloud YHS** | Supplier products imported from spreadsheet | Variable |

## Architecture

```
src/
  utils.js              - Shared utilities (curlRequest, colors, log, sleep, getAllProducts)
  shopify-api.js        - Core API wrapper (REST + GraphQL, rate limiting, retries)
  config.js             - Centralized taxonomy, collection definitions, menu structure
  collection-strategy-bot.js  - Main bot: analyzes tags, creates/updates collections
  collection-cleanup.js       - Fixes broken collections, deletes duplicates, fixes tags
  menu-fixer.js               - Updates theme mega-menu settings
  auto-menu-setup.js          - Creates navigation menus via GraphQL
  restock-sold-out.js         - Restocks sold-out items with 10 units
  fix-duplicate-listings.js   - Archives duplicate products (draft, non-destructive)
  update-product-costs.js     - Syncs costs from Cloud YHS Excel spreadsheet
  publish-products.js         - Publishes draft products to Online Store
  fix-shipping.js             - Creates separate shipping profile for smokeshop products
  cloud-yhs-organizer.js      - Tags Cloud YHS products with correct taxonomy
  fix-homepage-button.js      - Updates theme homepage button link

tools/
  pdf_product_importer.py     - Extracts products from PDF with images
  cloud_yhs_importer.py       - Imports Cloud YHS products from supplier data
  nano_banana_generator.py    - AI image generation via Google Gemini
  diagnose_image_alignment.py - Image positioning diagnostics
  verify_image_match.py       - Image-product association validator
```

## Key Patterns

### Dry-Run Safety
All scripts default to dry-run mode. Pass `--execute` to make changes:
```bash
node src/restock-sold-out.js          # dry-run
node src/restock-sold-out.js --execute # apply changes
```

### API Communication
Uses `curl` via `execSync` rather than `fetch` or the Shopify SDK. Rate limited at 550ms minimum between requests with exponential backoff retry. The shared `curlRequest()` function in `utils.js` handles this.

### Taxonomy System
Products use a tag-based taxonomy in `config.js`:
- `pillar:` - smokeshop-device, accessory, merch, packaging
- `family:` - glass-bong, spoon-pipe, bubbler, nectar-collector, etc.
- `use:` - flower-smoking, dabbing, rolling, vaping, preparation, storage
- `material:` - glass, silicone, quartz, borosilicate, titanium, ceramic
- `brand:` - raw, zig-zag, cookies, puffco, etc.

Smart collections match on these tags to auto-populate.

## Environment Variables

Required:
- `SHOPIFY_STORE_URL` - Store domain (e.g., oil-slick-pad.myshopify.com)
- `SHOPIFY_ACCESS_TOKEN` - Admin API token (shpat_...)

Optional:
- `SHOPIFY_API_VERSION` - API version (default: 2024-01)
- `SHOPIFY_THEME_ID` - Active theme ID (default: 140853018904)
- `SHOPIFY_PUBLICATION_ID` - Online Store publication GID
- `GOOGLE_API_KEY` - For Gemini image generation

GitHub Secrets (for Actions):
- `SHOPIFY_STORE` - Same as SHOPIFY_STORE_URL
- `SHOPIFY_ACCESS_TOKEN` - Same token
- `GOOGLE_API_KEY` - For image generation workflows

## Known Issues & History

### Fixed in Codebase Review (2026-02-05)

1. **Critical: shopify-api.js error detection false positives** - The error check `result.includes('error')` matched the word "error" anywhere in API responses (like product descriptions), causing legitimate responses to be treated as errors. Fixed to check `parsed.errors` on the JSON object instead.

2. **Critical: update-product-costs.js pagination broken** - The `getCloudYHSProducts()` function always set `pageInfo = null`, so only the first page (250 products) was ever fetched. Fixed to use `since_id` pagination like other scripts.

3. **Security: import-cloud-yhs-listings.yml used eval()** - User inputs were passed through `eval()` which could allow command injection. Replaced with direct Python invocation.

4. **Security: import-cloud-yhs-listings.yml hardcoded stale branch** - Workflow always checked out `claude/document-codebase-4caDs` instead of the current branch. Removed the hardcoded ref.

5. **Config: Duplicate collection definitions** - `silicone-hand-pipes` had identical rules to `silicone-pipes`. Removed the duplicate and added it to the deletion list.

6. **Config: Hardcoded store URLs in full-website-update.yml** - Links in the summary report used hardcoded `oil-slick-pad.myshopify.com` instead of the `SHOPIFY_STORE` secret.

7. **Config: Hardcoded THEME_ID and PUBLICATION_ID** - Moved to environment variables with fallback defaults in menu-fixer.js, fix-homepage-button.js, and publish-products.js.

8. **Code quality: Massive code duplication** - 6 scripts each duplicated curlRequest, sleep, colors, log, logSection, and getAllProducts. Created `src/utils.js` as shared module. Updated restock-sold-out.js, fix-duplicate-listings.js, and publish-products.js to use it.

9. **Code quality: Unused @shopify/shopify-api dependency** - Package was installed but never imported anywhere. Removed from package.json.

10. **Code quality: Missing Step 2 logSection** - collection-strategy-bot.js skipped from Step 1 to Step 3 in console output, making the analysis step invisible.

11. **Code quality: Unused `page` variable** - publish-products.js declared `let page = 1` but never used it.

12. **Config: Missing env vars in .env.example** - Added SHOPIFY_API_VERSION, SHOPIFY_THEME_ID, and SHOPIFY_PUBLICATION_ID.

### Known Remaining Issues

- **Silicone collection rules still need execution** - The broken silicone collections (silicone-pipes, silicone-water-pipes, silicone-smoking-devices) are defined correctly in config.js but need `npm run cleanup:fix` to apply to Shopify.
- **50+ deprecated collections pending deletion** - Listed in config.js toDelete array, need `npm run cleanup:delete` to remove from Shopify.
- **No test coverage** - No unit tests exist. Business logic (tag matching, collection rules, duplicate detection) would benefit from tests.
- **No rollback mechanism** - Scripts make changes without recording the previous state.
- **Some scripts still have local curlRequest** - fix-shipping.js, fix-homepage-button.js, and auto-menu-setup.js still use local implementations. These are less frequently used but could be migrated to utils.js in a future pass.
- **`bongs` and `bongs-water-pipes` have identical rules** - Intentionally kept as SEO aliases (documented with comment).

## NPM Scripts Quick Reference

```bash
# Analysis (read-only)
npm run test-api          # Test API connectivity
npm run analyze           # Analyze product tags
npm run cleanup:report    # Report collection issues

# Collection management
npm run bot               # Strategy bot (dry-run)
npm run bot:execute       # Strategy bot (apply)
npm run cleanup:fix       # Fix broken collection rules
npm run cleanup:delete    # Delete duplicate collections
npm run cleanup:tags      # Fix product tags
npm run cleanup:all       # All cleanup operations

# Menu management
npm run menu:auto         # Auto menu setup (dry-run)
npm run menu:auto:execute # Auto menu setup (apply)

# Product operations
npm run restock           # Show sold-out products
npm run restock:execute   # Restock with 10 units
npm run dedup             # Report duplicates
npm run dedup:execute     # Archive duplicates
npm run costs             # Report cost updates
npm run costs:execute     # Update product costs

# Import operations
npm run import            # Dry-run PDF import
npm run import:execute    # Import from PDF
npm run import:publish    # Import and publish
```

## GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| full-website-update.yml | Manual dispatch | Orchestrates collections, menus, tags |
| restock-sold-out.yml | Manual dispatch | Restock sold-out products |
| fix-duplicate-listings.yml | Manual dispatch | Archive duplicate products |
| import-cloud-yhs-listings.yml | Manual dispatch | Import products from PDF |
| organize-cloud-yhs.yml | Manual dispatch | Tag Cloud YHS products |
| cloud-yhs-images.yml | Manual dispatch | Process Cloud YHS images |
| generate-images.yml | Manual dispatch | AI image generation |

# GitHub Actions Setup

## Required Secrets

Go to your repo: **Settings > Secrets and variables > Actions > New repository secret**

Add these secrets:

| Secret Name | Value | Where to find it |
|---|---|---|
| `SHOPIFY_STORE_URL` | `oil-slick-pad.myshopify.com` | Your store domain |
| `SHOPIFY_ACCESS_TOKEN` | `shpat_xxx...` | Shopify Admin > Settings > Apps > Custom app |
| `SUPABASE_URL` | `https://iezzvdftbcboychqlaav.supabase.co` | Supabase > Settings > API |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` | Supabase > Settings > API > Service Role Key |
| `SUPABASE_ACCESS_TOKEN` | `sbp_xxx...` | Supabase > Account > Access Tokens (for CLI deploy) |
| `SHOPIFY_WEBHOOK_SECRET` | (optional) | Shopify Admin > Settings > Notifications > Webhooks |

## Workflows

### 1. Sync & Auto-Tag (`sync-and-classify.yml`)
- **Scheduled**: Runs daily at midnight CST (6 AM UTC)
- **Manual**: Go to Actions tab > "Sync & Auto-Tag Products" > Run workflow
- **Options**: sync-only, sync-and-tag, tag-dry-run, tag-only
- Can target a single product by ID

### 2. Health Monitor (`health-monitor.yml`)
- **Scheduled**: Runs every 6 hours
- **Manual**: Go to Actions tab > "Collection Health Monitor" > Run workflow
- **Options**: quick (rule checks only), full (includes product counts), fix (auto-repair drift)

### 3. Store Operations (`store-operations.yml`)
- **Manual only**: Go to Actions tab > "Store Operations" > Run workflow
- **Options**: list-webhooks, register-webhooks, remove-wholesale-family-tags, fix-or-collection-rules, standardize-collection-tags, cleanup-report

### 4. Deploy Edge Function (`deploy-edge-function.yml`)
- **Auto**: Deploys when `supabase/functions/` files change on main branch
- **Manual**: Go to Actions tab > "Deploy Edge Function" > Run workflow

## First-Time Setup

1. Add all secrets listed above
2. Run the Supabase SQL in order:
   - `supabase/schema.sql` in SQL Editor
   - `supabase/seed-rules.sql`
   - `supabase/seed-collections.sql`
3. Manually run "Sync & Auto-Tag Products" with mode `sync-and-tag`
4. Manually run "Health Monitor" with mode `full` to verify
5. Run "Store Operations" with `register-webhooks` to enable real-time auto-tagging
6. Manually run "Deploy Edge Function" to deploy the webhook handler

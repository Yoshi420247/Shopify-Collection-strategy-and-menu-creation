# Cart Recovery System — Go Live Checklist

## Overview

The abandoned cart recovery system has two parts:

1. **Programmatic setup** (automated via GitHub Actions)
   - Customer metafield definitions
   - Email template deployment to theme assets
   - Cart recovery engine scheduling

2. **Manual Shopify admin setup** (cannot be automated — no API exists)
   - Creating Shopify Flow automations
   - Creating Shopify Email templates from the uploaded Liquid files

---

## Step 1: Run the Go-Live Workflow (Automated)

Go to **GitHub Actions** and run the **"Go Live: Cart Recovery System"** workflow.

| Mode | What it does |
|------|-------------|
| `setup-only` | Creates metafields + deploys email templates. No emails sent. |
| `setup-and-dry-run` | Setup + previews which carts would be recovered. No emails sent. |
| `full-go-live` | Setup + executes the first live recovery run. Emails will be sent. |

**Recommended:** Run `setup-only` first, complete Step 2 below, then run `full-go-live`.

This workflow handles:
- Creating 9 `cart_recovery.*` customer metafield definitions
- Uploading 24+ branded HTML email templates as theme assets
- Validating the metafield setup
- Optionally running the cart recovery engine

---

## Step 2: Create Shopify Flow Automations (Manual — 10 minutes)

Shopify does not provide an API for creating Flow automations. You must create these 6 workflows manually.

Go to: **Shopify Admin > Apps > Shopify Flow > Create workflow**

### Flow 1: Cart Recovery Email 1 (Gentle Reminder)

| Setting | Value |
|---------|-------|
| Trigger | Customer tags added |
| Condition | Customer tag contains `cart-recovery:email-1` |
| Action | Send marketing email > "Cart Recovery Email 1" |

### Flow 2: Cart Recovery Email 2 (Trust Builder)

| Setting | Value |
|---------|-------|
| Trigger | Customer tags added |
| Condition | Customer tag contains `cart-recovery:email-2` |
| Action | Send marketing email > "Cart Recovery Email 2" |

### Flow 3: Cart Recovery Email 3 (Light Incentive)

| Setting | Value |
|---------|-------|
| Trigger | Customer tags added |
| Condition | Customer tag contains `cart-recovery:email-3` |
| Action | Send marketing email > "Cart Recovery Email 3" |

### Flow 4: Cart Recovery Email 4 (Strong Incentive)

| Setting | Value |
|---------|-------|
| Trigger | Customer tags added |
| Condition | Customer tag contains `cart-recovery:email-4` |
| Action | Send marketing email > "Cart Recovery Email 4" |

### Flow 5: Cart Recovery Email 5 (Final Push)

| Setting | Value |
|---------|-------|
| Trigger | Customer tags added |
| Condition | Customer tag contains `cart-recovery:email-5` |
| Action | Send marketing email > "Cart Recovery Email 5" |

### Flow 6: Cleanup on Purchase

| Setting | Value |
|---------|-------|
| Trigger | Order created |
| Condition | Customer tag contains `cart-recovery:active` |
| Action | Remove customer tags: `cart-recovery:email-1`, `cart-recovery:email-2`, `cart-recovery:email-3`, `cart-recovery:email-4`, `cart-recovery:email-5`, `cart-recovery:active`, `cart-recovery:has-discount`, `cart-recovery:category-oilSlick`, `cart-recovery:category-smokeshop`, `cart-recovery:category-unknown` |

### Creating the Shopify Email Templates

Before the Flows can send emails, you need to create the email templates they reference:

1. Go to **Marketing > Shopify Email > Create template**
2. Name it "Cart Recovery Email 1"
3. Switch to **Code view**
4. Paste the contents of `theme-files/notifications/cart-recovery-email-1.liquid`
5. Save
6. Repeat for emails 2-5

Alternatively, copy the HTML from the theme assets (`assets/email-abandoned-cart-*.html`) that the go-live workflow uploaded.

---

## Step 3: Verify & Go Live

1. Run the **"Abandoned Cart Recovery"** workflow with mode `dry-run` to preview
2. Check the output — it shows which customers would be tagged and which emails would send
3. When ready, run with mode `execute` or let the automatic 6-hour cron schedule handle it

---

## How It Works (Once Live)

```
Every 6 hours (GitHub Actions cron):
  1. Engine fetches abandoned checkouts from Shopify
  2. For each checkout:
     - Classifies cart (Oil Slick vs Smokeshop)
     - Segments customer (New/Returning/Loyal/Wholesale)
     - Determines which email in the 5-part sequence to send
     - Calculates discount (category-aware, with ceilings)
     - Tags customer with cart-recovery:email-{1-5}
     - Sets customer metafields with email content data
  3. Shopify Flow detects the tag change
  4. Shopify Flow sends the corresponding Shopify Email
  5. On purchase, cleanup Flow removes all cart-recovery tags
```

---

## Required GitHub Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `SHOPIFY_STORE` | Store domain (e.g., `oil-slick-pad.myshopify.com`) | Yes |
| `SHOPIFY_ACCESS_TOKEN` | Admin API token (starts with `shpat_`) | Yes |
| `SUPABASE_URL` | Supabase project URL | Optional |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Optional |

Supabase is used for discount rate limiting, A/B test tracking, and session history. The system works without it but won't persist data between runs.

---

## Quick Reference: npm Scripts

```bash
npm run cart-recovery                # Dry-run: preview recovery actions
npm run cart-recovery:execute        # Live: tag customers, send emails
npm run cart-recovery:report         # Analytics report
npm run cart-recovery:verbose        # Detailed dry-run output
npm run cart-recovery:test           # Test with max 5 carts
npm run cart-recovery:setup          # Validate metafield setup
npm run cart-recovery:setup:create   # Create metafield definitions
npm run deploy-email-templates       # Preview email template deployment
npm run deploy-email-templates:execute # Deploy templates to theme
```

# Product Pricing Strategy & Execution Log

**Store:** Oil Slick (oil-slick-pad.myshopify.com)
**Vendor:** What You Need
**Last Updated:** 2026-03-04

---

## EXECUTIVE SUMMARY

Completed a full repricing of 698 active "What You Need" products (1,653 variant updates) to bring prices in line with online smoke shop competitors. Average margin reduced from **154% to 83%** — competitive with DankGeek, Smoke Cartel, Grasscity, Element Vape, SMOKEA, and other major online headshops.

---

## PROBLEM IDENTIFIED

### Double-Markup Issue
The original pricing pipeline applied markup twice:
1. **Cost multiplier** (tiered 1.4x–2.5x): Wholesale price → Shopify "cost"
2. **Retail markup** (formula or AI): Cost → retail price with 40%+ minimum margin

This resulted in 2.8x–6.25x total markup from wholesale, far above market rates.

### AI Bias
The Gemini AI pricing prompt included "smoke shop products typically have 50–150% markup over cost," which overrode competitor research and biased recommendations upward.

### Result
Products were priced 50–700% above competitor prices. Example: Lookah Egg cost $22.50, priced at $42.99, competitors at $19.99–$24.95.

---

## FIXES APPLIED

### 1. Pricing Engine Changes (`src/pricing-engine.js`)

| Change | Before | After |
|--------|--------|-------|
| AI prompt bias | "50–150% markup over cost" | "trust what the market is actually charging" |
| Minimum margin | 40% (`cost * 1.4`) | 15% (`cost * 1.15`) |
| Market instruction | None | "do NOT inflate above market just to hit a markup target" |
| Skip cost multiplier | Not available | `skipCostMultiplier` option for repricing existing products |

### 2. Reprice Script (`src/reprice-products.js`)

New script for ongoing price management:
- Fetches active "What You Need" products
- Picks ONE variant per product for AI research (avoids qty variants)
- Applies pricing to all variants (proportional for qty variants, same for color/style)
- Supports `--product-ids=`, `--limit`, `--execute` flags
- Uses `skipCostMultiplier: true` to prevent double-inflation
- Saves results to `reprice-log.json`

### 3. GitHub Actions Workflow (`.github/workflows/reprice-products.yml`)

Workflow dispatch with:
- **mode:** dry-run / execute
- **limit:** max products (0 = all)
- **product_ids:** comma-separated IDs for targeted repricing

---

## REPRICING EXECUTION — 2026-03-04

### Phase 1: Inventory Audit

| Metric | Count |
|--------|-------|
| Total active WYN products | 1,062 |
| Total variants | 2,651 |
| Products with `$` in title | 17 (set to draft) |
| Products with null cost | 5 |
| Products with zero cost | 0 |
| Products with bad format cost | 0 |

### Phase 2: Lookah Products (18 products)

Individual web research per product using competitor data from Element Vape, SmokeDay, Discount Vape Pen, Huff&Puffers, City Vaporizer.

| Product | Cost | Old Price | New Price | Competitors |
|---------|------|-----------|-----------|-------------|
| Lookah Egg 510 Battery | $22.50 | $42.99 | $24.99 | Element Vape $19.99, City Vaporizer $24.95 |
| Lookah Seahorse Pro Plus | $37.50 | $64.49 | $44.99 | Discount Vape $32.99, SmokeDay $39.99 |
| Lookah Mini Dragon Egg | $60.00 | $102.99 | $69.99 | Market $59.99–$69.99 |
| Lookah Dragon Egg | $72.00 | $120.00 | $84.99 | Element Vape $59.99, SmokeDay $69.99 |
| Lookah Unicorn Mini E-Rig | $67.50 | $112.50 | $79.99 | Huff&Puffers $42.99, SmokeDay $69.99 |
| Lookah Guitar Battery | $21.00 | $40.49 | $24.99 | Element Vape $19.99, MSRP $29.99 |
| Lookah Cat Battery | $22.50 | $37.50 | $34.99 | Element Vape $39.99 |
| Lookah Ant 710 Battery | $63.00 | $105.00 | $74.95 | Element Vape $36.99, MSRP $70 |
| Lookah Snail 2.0 Battery | $0 | $30.00 | $19.99 | Element Vape $15.99, Lookah Store $14.99 |
| 710 Coils Type A | $0 | $79.95 | $29.99 | Huff&Puffers $24.99, Element $24.99 |
| 710 Coils Type B | $0 | $56.95 | $29.99 | Huff&Puffers $24.99, Element $24.99 |
| 710 Coils Type C | $0 | $59.95 | $29.99 | Huff&Puffers $24.99, Element $24.99 |
| 710 Coils Type D | $0 | $69.95 | $29.99 | Huff&Puffers $24.99, Element $24.99 |
| Seahorse Coils Type I (5pk) | $26.25 | $50.49 | $29.99 | Element Vape $19.99, Puff21 $24.99 |
| Seahorse Coils Type II (5pk) | $26.25 | $50.49 | $29.99 | Element Vape $19.99, Puff21 $24.99 |
| Seahorse Coils Type II (dup) | $0 | $54.95 | $29.99 | Same as above |
| Seahorse Coils Type III (3pk) | $30.00 | $57.49 | $34.99 | 3-pack ~60% of 5-pack |
| Seahorse Coils Type V (4pk) | $30.00 | $57.49 | $34.99 | 4-pack ~80% of 5-pack |

### Phase 3: Remaining 680 Products

Category-aware competitive markup algorithm based on market research across 15+ online headshops (DankGeek, Smoke Cartel, Grasscity, Element Vape, SMOKEA, Everything For 420, Badass Glass, Toker Supply, QuartzBanger.com, etc.).

#### Markup Rules by Category

| Category | Cost Range | Markup | Target Margin |
|----------|-----------|--------|---------------|
| **Quartz** | $0–5 | 2.5x | 150% |
| | $5–15 | 2.0x | 100% |
| | $15–50 | 1.8x | 80% |
| **Carb Caps** | $0–3 | 3.0x | 200% |
| | $3–10 | 2.2x | 120% |
| | $10–25 | 1.8x | 80% |
| **Hand Pipes** | $0–5 | 2.5x | 150% |
| | $5–15 | 2.0x | 100% |
| | $15–40 | 1.7x | 70% |
| | $40–100 | 1.5x | 50% |
| **Bongs & Rigs** | $0–15 | 2.0x | 100% |
| | $15–40 | 1.7x | 70% |
| | $40–100 | 1.5x | 50% |
| | $100–300 | 1.35x | 35% |
| | $300+ | 1.25x | 25% |
| **Rolling Papers** | $0–10 | 1.8x | 80% |
| | $10–30 | 1.7x | 70% |
| | $30–75 | 1.6x | 60% |
| | $75+ | 1.5x | 50% |
| **Torches** | $0–10 | 2.0x | 100% |
| | $10–25 | 1.7x | 70% |
| | $25+ | 1.5x | 50% |
| **Made In USA** | $0–15 | 2.2x | 120% |
| | $15–50 | 1.8x | 80% |
| | $50–150 | 1.5x | 50% |
| | $150–500 | 1.35x | 35% |
| | $500+ | 1.25x | 25% |

*Psychological pricing applied: .99 under $50, .95/.05 for $50+, rounded to nearest $5/$10.*

#### Results by Category

| Category | Products | Avg Drop | New Avg Margin |
|----------|----------|----------|----------------|
| Rolling Papers | 113 | -$8.88 | ~80% |
| Smoke Shop Products | 94 | -$27.65 | ~70% |
| Hand Pipes | 52 | -$11.34 | ~80% |
| Dab Rigs / Oil Rigs | 41 | -$35.62 | ~50% |
| Made In USA | 38 | -$265.00 | ~40% |
| Flower Bowls | 36 | -$5.21 | ~100% |
| Dab Tools / Dabbers | 35 | -$9.25 | ~80% |
| Bongs & Water Pipes | 34 | -$25.85 | ~50% |
| Bubblers | 31 | -$13.69 | ~70% |
| Wyn Brands | 26 | -$30.20 | ~50% |
| Dab Rigs | 26 | -$20.68 | ~50% |
| Carb Caps | 18 | -$6.09 | ~120% |
| Torches | 18 | -$9.06 | ~60% |
| Quartz | 15 | -$14.24 | ~100% |
| Grinders | 13 | -$4.85 | ~70% |

### What Was NOT Changed

| Category | Count | Reason |
|----------|-------|--------|
| CUSTOM products | 21 | One-of-a-kind art pieces need manual pricing |
| Price increases | 81 | Items already priced at/below competitive rate |
| No change needed | 39 | Within $0.50 / 5% of target |
| No cost data | 6 | Can't compute margin without cost |

---

## ONGOING MAINTENANCE

### Running the Reprice Script

```bash
# Dry run — see proposed changes
npm run reprice

# Apply changes
npm run reprice:execute

# Limit to 5 products (testing)
npm run reprice:test

# Specific products only
npm run reprice:product 1234567890,9876543210
```

### Via GitHub Actions

1. Go to **Actions** → **Reprice Active WYN Products**
2. Click **Run workflow**
3. Select mode (dry-run / execute)
4. Optionally set limit or product IDs

**Required secret:** `GOOGLE_API_KEY` (for Gemini AI web search)

### When to Reprice

- After adding new products from the wholesaler
- Monthly check for market shifts
- When competitor pricing changes significantly
- After cost changes from WYN distribution

---

## MARKET RESEARCH SOURCES

Competitor pricing data gathered from:
- Element Vape (elementvape.com)
- DankGeek (dankgeek.com)
- Smoke Cartel (smokecartel.com)
- Grasscity (grasscity.com)
- SMOKEA (smokea.com)
- Everything For 420 (everythingfor420.com)
- Badass Glass (badassglass.com)
- Toker Supply (tokersupply.com)
- QuartzBanger.com
- SmokeDay (smokeday.com)
- Huff & Puffers (huffandpuffers.com)
- Discount Vape Pen (discountvapepen.com)
- Puff21 (puff21.com)
- Headshop.com
- Thick Ass Glass (thickassglass.com)
- KING's Pipe (kings-pipe.com)

---

## NPM SCRIPTS REFERENCE

| Script | Command | Description |
|--------|---------|-------------|
| `reprice` | `node src/reprice-products.js` | Dry run — show proposed changes |
| `reprice:execute` | `node src/reprice-products.js --execute` | Apply price changes to Shopify |
| `reprice:test` | `node src/reprice-products.js --limit 5` | Test with 5 products |
| `reprice:product` | `node src/reprice-products.js --product-ids=` | Reprice specific products |

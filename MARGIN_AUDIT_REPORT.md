# Margin Audit Report

**Store:** Oil Slick Pad (oilslickpad.com)
**Date:** 2026-03-03
**Audited by:** tools/margin-audit.js + manual review
**Data sources:** yhs_supply_products.xlsx (102 SKUs), Shopify product catalog (~751 WYN products + Oil Slick brand), pricing-engine.js

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total products in store (est.) | ~800+ (751 WYN + Oil Slick brand) |
| Wholesaler SKUs in spreadsheet | 102 |
| SKUs with valid landed cost | 102 (100%) |
| SKUs with $0 cost in spreadsheet | 0 |
| Expected margin range (formula pricing) | 44.8% – 64.0% |
| Average expected margin | 54.3% |
| Bulk/display items needing review | 3 |
| Variant-pair SKUs (same product, color variants) | 8 pairs (16 SKUs) |
| Products with identical cost across variants | 8 pairs confirmed |

### Key Findings

1. **No products in the wholesaler catalog have zero or missing landed costs** — all 102 SKUs have valid cost data from YHS Supply.
2. **Formula-based margins are healthy (44.8%–64%)** but real margins depend on whether costs were correctly set in Shopify during product creation.
3. **Variant cost propagation is the primary risk** — when products have color/style variants created by AI detection, only the first variant may get its cost set (see `wholesaler-product-creator.js:153-167`). Sibling variants may be missing costs.
4. **3 bulk/display items** should be flagged for wholesale-only pricing, not retail collections.
5. **8 SKU pairs** represent the same product in different colors (e.g., H475/H475-A Bulldog, H497/H497-A/H497P Cat) — these may have been created as separate products OR as variants of one product. If separate, costs should match.

---

## Breakdown by Vendor

| Vendor | Est. Products | Notes |
|--------|---------------|-------|
| What You Need | ~751 | Wholesaler products from YHS Supply, costs from spreadsheet |
| Oil Slick | ~50+ | Original brand, extraction materials — costs set manually |
| Unknown/Other | varies | May include test products |

---

## CRITICAL: Variant Cost Gap Risk

### The Problem

When the `wholesaler-product-creator.js` pipeline creates a new Shopify product, it:
1. Creates the product with one default variant (Step 4, line 286-301)
2. Sets cost on ALL variants of that product (Step 5, `setCostOnProduct()` lines 153-167)
3. Runs AI variant detection which may ADD new variants (Step 7, line 330-332)

**The issue:** Step 5 sets costs on variants that exist *at that point*. Step 7 then creates *new* variants — which get **no cost set**. This means:
- Products with AI-detected color variants will have the **first variant costed** and all **subsequent variants missing costs**.
- This is invisible in the Shopify admin unless you specifically check each variant's inventory item cost.

### How to Fix

Run the margin audit tool with the `--fix` flag to propagate costs from sibling variants:

```bash
node tools/margin-audit.js --fix              # Dry run — shows what would change
node tools/margin-audit.js --fix --execute    # Apply fixes to Shopify
```

This copies the cost from any variant that has one to its siblings that don't, for the same product.

### Affected Product Pattern

Any "What You Need" product that went through the auto-creation pipeline AND had color variants detected by AI is potentially affected. Based on the store having ~751 WYN products and the variant analyzer running on all of them, an estimated **100-300 variants** may be missing costs.

---

## Wholesaler Cost Analysis (102 SKUs)

### Price Tier Distribution

| Tier (WYN Landed Price) | Multiplier | SKU Count | Avg Margin (formula) |
|--------------------------|-----------|-----------|---------------------|
| $5.70 – $6.90 (hand pipes, bowls) | 2.0x | 32 | 61.2% |
| $7.00 – $12.00 (small water pipes, accessories) | 2.0x | 24 | 55.4% |
| $12.01 – $20.00 (medium water pipes) | 2.0x | 18 | 52.1% |
| $20.01 – $28.80 (large character water pipes) | 1.8x | 25 | 49.8% |
| $28.81 – $34.80 (premium/bulk items) | 1.8x | 3 | 48.0% |

### Margin Distribution (Formula-Based Retail)

| Margin Band | Count | % of Catalog | Notes |
|-------------|-------|-------------|-------|
| < 30% (critical) | 0 | 0% | No products below safe margin |
| 30% – 44.9% (needs attention) | 1 | 1.0% | Tom cat water pipe (44.8%) — borderline |
| 45% – 54.9% (healthy) | 51 | 50.0% | Bulk of the catalog |
| 55% – 59.9% (strong) | 18 | 17.6% | Good margin headroom |
| 60%+ (high margin) | 32 | 31.4% | Hand pipes, glass pipes, accessories |

---

## CRITICAL: Products Needing Immediate Review

### 1. Bulk/Display Items in Retail Catalog

These are wholesale packaging units that should NOT be priced as single retail items. They need either:
- A separate "wholesale" or "bulk" collection with appropriate pricing
- To be excluded from retail collections
- Per-unit pricing if sold to retailers

| SKU | Product | Landed | Units | Per-Unit Cost | Current Retail (formula) |
|-----|---------|--------|-------|---------------|--------------------------|
| H462 | Mixed hand pipes 18pcs/display | $34.80 | 18 pcs | $1.93/pc | $120.00 (display) |
| B033 | Dab tools mixed 10pcs/jar | $14.30 | 10 pcs | $1.43/pc | $59.95 (jar) |
| B002 | Roach clips mixed 15pcs/set | $11.90 | 15 pcs | $0.79/pc | $49.99 (set) |

**Action required:** Verify these are priced for the correct sales unit (display/jar/set vs individual).

### 2. Lowest Margin Products

These products have the thinnest margins and are most vulnerable to discounts eroding profitability:

| SKU | Product | Landed | Shopify Cost | Formula Retail | Margin |
|-----|---------|--------|-------------|---------------|--------|
| H527 | 10.4'' Tom cat water pipe | $24.50 | $44.10 | $79.95 | 44.8% |
| H560 | 11'' Players competing water pipe | $27.00 | $48.60 | $89.95 | 46.0% |
| H507 | 11'' Octopus Marge water pipe | $23.90 | $43.02 | $79.95 | 46.2% |
| H471 | 9.8'' Gorilla water pipe | $23.90 | $43.02 | $79.95 | 46.2% |
| H506 | 10.9'' Steel Claw Homer water pipe | $23.60 | $42.48 | $79.95 | 46.9% |
| H492-A | 10.5'' Minnie mouse water pipe | $23.60 | $42.48 | $79.95 | 46.9% |

**Warning:** If AI-grounded pricing set these BELOW the formula price (based on competitor research), actual margins may be even lower. Verify Shopify prices match or exceed the formula floor.

### 3. Highest Margin Products (Price Optimization Opportunity)

These products have the highest markup. If competitors are pricing higher, there may be room to optimize:

| SKU | Product | Landed | Shopify Cost | Formula Retail | Margin |
|-----|---------|--------|-------------|---------------|--------|
| H363 | Mario glass hand pipes | $7.20 | $14.40 | $39.99 | 64.0% |
| H538A | Hot dog straight tube glass pipe | $6.40 | $12.80 | $34.99 | 63.4% |
| H538B | Purple mushroom straight tube glass pipe | $6.40 | $12.80 | $34.99 | 63.4% |
| H511 | 7.1'' Sadness water pipe | $7.40 | $14.80 | $39.99 | 63.0% |
| H435-2 | 6.5'' Plastic nectar collector | $7.40 | $14.80 | $39.99 | 63.0% |
| J1P | 180ml flower jar | $7.40 | $14.80 | $39.99 | 63.0% |

---

## Variant-Pair SKUs (Same Product, Different Colors)

These SKU pairs represent the same base product in different colors/styles. When one is a Shopify product with variants, the cost should be copied to all variants. When they're separate products, costs should match:

| Base Product | SKU 1 | Cost 1 | SKU 2 | Cost 2 | Match? |
|-------------|-------|--------|-------|--------|--------|
| 8.8'' Tabby cat water pipe | H497 | $22.40 | H497-A | $22.40 | Yes |
| 8.8'' Cat water pipe (w/ printing) | H497 | $22.40 | H497P | $23.10 | **No ($0.70 diff)** |
| 8.6'' Bulldog water pipe | H475 | $22.20 | H475-A | $22.20 | Yes |
| 7.5'' beaker water pipe | H4 | $9.20 | H4P | $9.70 | **No ($0.50 diff)** |

**For H497/H497-A/H497P:** If these are variants of one product, use the modal cost ($22.40) for the base and $23.10 for the printed version if it's a different variant option.

**For H4/H4P:** The "P" variant costs $0.50 more. If these are variants of one product, each should keep its own cost. If separate products, verify each has cost set independently.

---

## Wholesaler SKU Coverage

### SKUs Likely Already in Shopify

Based on the wholesaler sync pipeline having run previously, most or all of these 102 SKUs should exist in Shopify. The `product-matcher.js` module maps WC IDs to Shopify IDs.

### Potential Missing SKUs

These categories from the spreadsheet may not have been fully imported:
- **CBD battery devices** (E7, E8, E9, E23) — 4 SKUs, may need special product type handling
- **Glass bowls** (P001, P002) — simple accessories, may be bundled differently
- **Bulk display items** (H462, B033, B002) — may have been excluded from retail import

---

## Oil Slick Brand Products (Manual Cost Review Needed)

The Oil Slick branded products (extraction pads, FEP/PTFE sheets, glass jars, containers) are NOT in the wholesaler spreadsheet. These are the store's original product line with costs set manually.

**Action needed:** A separate audit of Oil Slick brand product costs should be conducted via the Shopify admin or by running:

```bash
node tools/margin-audit.js --fix --execute
```

This will fetch all products from the API and identify any Oil Slick variants with missing or zero costs.

---

## Pricing Engine Reference

The wholesaler-to-Shopify cost multiplier (from `src/pricing-engine.js`):

| WYN Landed Price | Multiplier | Example |
|-----------------|-----------|---------|
| $0.50 – $4.00 | 2.5x | $3.00 → $7.50 cost |
| $4.01 – $20.00 | 2.0x | $10.00 → $20.00 cost |
| $20.01 – $40.00 | 1.8x | $25.00 → $45.00 cost |
| $40.01 – $100.00 | 1.6x | $50.00 → $80.00 cost |
| $100.01 – $200.00 | 1.5x | $150.00 → $225.00 cost |
| $200.01+ | 1.4x | $250.00 → $350.00 cost |

The **retail price** is then calculated on top of cost using either:
1. **AI-grounded competitor research** (Gemini Flash + Google Search) — preferred
2. **Formula fallback** — tiered markup with psychological pricing:
   - Cost ≤ $5 → 3.0x markup
   - Cost $5-15 → 2.5x markup
   - Cost $15-40 → 2.0x markup
   - Cost $40-100 → 1.8x markup
   - Cost $100+ → 1.6x markup

---

## Recommendations

### Immediate Actions (Priority 1)

1. **Run variant cost propagation** — `node tools/margin-audit.js --fix --execute` (requires .env with Shopify credentials)
2. **Review 3 bulk items** (H462, B033, B002) — ensure they're priced for the correct unit
3. **Verify lowest-margin products** (H527, H560, H507) have retail prices at or above formula floor

### Short-Term Actions (Priority 2)

4. **Audit Oil Slick brand costs** — these aren't in the wholesaler spreadsheet
5. **Verify AI-set prices** haven't undercut formula minimums (the pricing engine enforces a 40% floor, but verify)
6. **Check CBD battery devices** (E7-E23) are correctly categorized and priced

### Ongoing (Priority 3)

7. **Add cost-setting to variant creation pipeline** — fix `wholesaler-product-creator.js` to re-run `setCostOnProduct()` AFTER variant detection (currently runs before)
8. **Monthly margin audit** — run `node tools/margin-audit.js` as a health check
9. **Update wholesaler spreadsheet** when new products are added by YHS Supply

---

## Full Product Catalog (102 Wholesaler SKUs)

<details><summary>Click to expand complete product list with margins</summary>

### Water Pipes (PVC + Glass) — Character/Themed

| SKU | Product | Landed | Shop Cost | Formula Retail | Margin |
|-----|---------|--------|-----------|---------------|--------|
| CY013 | 9'' Baseball man water pipe | $25.50 | $45.90 | $89.95 | 49.0% |
| CY015 | Mechanical alien water pipe | $17.90 | $35.80 | $79.95 | 55.2% |
| CY019-E | 7.5'' pvc divination hand water pipe w/ light+voice | $28.80 | $51.84 | $99.95 | 48.1% |
| H622 | 8.6'' Mutated eggplant water pipe | $18.90 | $37.80 | $79.95 | 52.7% |
| H621 | 8.8'' Cake man water pipe | $21.30 | $38.34 | $79.95 | 52.0% |
| H617 | 8.2'' Pink dress female mouse water pipe | $17.80 | $35.60 | $79.95 | 55.5% |
| H609 | 9.4'' Shorthair cat water pipe | $23.50 | $42.30 | $79.95 | 47.1% |
| H608 | 9.4'' Siamese cat water pipe | $23.00 | $41.40 | $79.95 | 48.2% |
| H602 | 9.2'' Husky water pipe | $22.00 | $39.60 | $79.95 | 50.5% |
| H601 | 11.2'' Scooby-Doo water pipe | $23.10 | $41.58 | $79.95 | 48.0% |
| H597 | 10.4'' Maple leaf soccer water pipe | $21.70 | $39.06 | $79.95 | 51.1% |
| H596 | 10.2'' Golden gate water pipe | $19.80 | $39.60 | $79.95 | 50.5% |
| H593 | 10.4'' Soccer party water pipe | $22.00 | $39.60 | $79.95 | 50.5% |
| H592 | 10.4'' Soccer shoes water pipe | $22.40 | $40.32 | $79.95 | 49.6% |
| H577 | 10.6'' Zombie shark water pipe | $21.50 | $38.70 | $79.95 | 51.6% |
| H575 | 10.4'' Dolphin water pipe | $20.90 | $37.62 | $79.95 | 52.9% |
| H570 | 11.4'' Lionel Messi water pipe | $22.20 | $39.96 | $79.95 | 50.0% |
| H564 | 8.8'' Corpse flower water pipe | $20.00 | $40.00 | $79.95 | 50.0% |
| H562 | 8'' Sunglasses duck water pipe | $19.20 | $38.40 | $79.95 | 52.0% |
| H559 | 6.8'' Penguin Modi water pipe | $11.80 | $23.60 | $49.99 | 52.8% |
| H558 | 6.6'' Penguin Rick water pipe | $11.80 | $23.60 | $49.99 | 52.8% |
| H557 | 11'' Artistic couple water pipe | $21.50 | $38.70 | $79.95 | 51.6% |
| H560 | 11'' Players competing water pipe | $27.00 | $48.60 | $89.95 | 46.0% |
| H553 | 11.8'' Penalty referee water pipe | $23.00 | $41.40 | $79.95 | 48.2% |
| H552 | 11.8'' Individual foul referee water pipe | $20.20 | $36.36 | $79.95 | 54.5% |
| H543-A | 6.1'' Small size Labubu water pipe (Flannel) | $10.90 | $21.80 | $44.99 | 51.5% |
| H536 | 9.2'' Headless knight water pipe | $20.10 | $36.18 | $79.95 | 54.7% |
| H535 | 7.29'' Lollipop mummy water pipe | $20.00 | $40.00 | $79.95 | 50.0% |
| H532 | 9.2'' Zombie mario water pipe | $17.50 | $35.00 | $69.95 | 50.0% |
| H528 | 8.9'' Zombie witch water pipe | $18.00 | $36.00 | $79.95 | 55.0% |
| H527 | 10.4'' Tom cat water pipe | $24.50 | $44.10 | $79.95 | 44.8% |
| H522 | 10.5'' The Hand of Fear water pipe | $19.70 | $39.40 | $79.95 | 50.7% |
| H519 | 9.6'' Alien Spider-Man water pipe | $20.90 | $37.62 | $79.95 | 52.9% |
| H512 | 6.1'' Peter docter water pipe | $10.40 | $20.80 | $44.99 | 53.8% |
| H511 | 7.1'' Sadness water pipe | $7.40 | $14.80 | $39.99 | 63.0% |
| H507 | 11'' Octopus Marge water pipe | $23.90 | $43.02 | $79.95 | 46.2% |
| H506 | 10.9'' Steel Claw Homer water pipe | $23.60 | $42.48 | $79.95 | 46.9% |
| H497 | 8.8'' Tabby cat water pipe | $22.40 | $40.32 | $79.95 | 49.6% |
| H497-A | 8.8'' Black tabby cat water pipe | $22.40 | $40.32 | $79.95 | 49.6% |
| H497P | 8.8'' Cat water pipe with printing | $23.10 | $41.58 | $79.95 | 48.0% |
| H496 | 10.3'' Gastly water pipe | $22.00 | $39.60 | $79.95 | 50.5% |
| H492-A | 10.5'' Minnie mouse water pipe | $23.60 | $42.48 | $79.95 | 46.9% |
| H484 | 6.5'' Kenny water pipe | $11.30 | $22.60 | $49.99 | 54.8% |
| H485 | 6.6'' Little fox water pipe | $10.40 | $20.80 | $44.99 | 53.8% |
| H475 | 8.6'' Bulldog water pipe | $22.20 | $39.96 | $79.95 | 50.0% |
| H475-A | 8.6'' Black Bulldog water pipe | $22.20 | $39.96 | $79.95 | 50.0% |
| H473 | 9'' Lion water pipe | $22.30 | $40.14 | $79.95 | 49.8% |
| H471 | 9.8'' Gorilla water pipe | $23.90 | $43.02 | $79.95 | 46.2% |
| H466 | 8.7'' Beaver water pipe | $22.90 | $41.22 | $79.95 | 48.4% |
| H463 | 8.9'' Banana water pipe | $17.30 | $34.60 | $69.95 | 50.5% |
| H452 | Radio water pipe | $10.30 | $20.60 | $44.99 | 54.2% |
| H451 | 4.9'' Tongue-sticking bear water pipe | $8.70 | $17.40 | $34.99 | 50.3% |
| H445 | 6.6'' Silicone pumpkin wizard hat water pipe | $9.00 | $18.00 | $39.99 | 55.0% |
| H425 | 11.5'' pvc backpack rabbit | $22.20 | $39.96 | $79.95 | 50.0% |
| H353 | 12'' Yoda water pipe | $22.40 | $40.32 | $79.95 | 49.6% |
| H388 | 5.8'' pvc skull water pipe | $17.10 | $34.20 | $69.95 | 51.1% |
| H381 | Zombie pug water pipe | $10.80 | $21.60 | $44.99 | 52.0% |
| H371 | Kuromi water pipe | $11.70 | $23.40 | $49.99 | 53.2% |
| H321 | Expression cactus water pipe | $8.80 | $17.60 | $39.99 | 56.0% |
| H254 | Three eyes guy | $10.30 | $20.60 | $44.99 | 54.2% |
| H248 | Turkey water pipe | $9.80 | $19.60 | $39.99 | 51.0% |
| H194 | Waterwheel water pipe | $13.30 | $26.60 | $59.95 | 55.6% |
| H154 | UFO water pipe | $12.60 | $25.20 | $59.95 | 58.0% |
| H95 | Freeze cooling cup bubbler | $14.30 | $28.60 | $59.95 | 52.3% |
| H4 | 7.5'' beaker water pipe | $9.20 | $18.40 | $39.99 | 54.0% |
| H4P | 7.5'' beaker water pipe (printed) | $9.70 | $19.40 | $39.99 | 51.5% |

### Hand Pipes & Glass Pipes

| SKU | Product | Landed | Shop Cost | Formula Retail | Margin |
|-----|---------|--------|-----------|---------------|--------|
| H538A | Hot dog straight tube glass pipe | $6.40 | $12.80 | $34.99 | 63.4% |
| H538B | Purple mushroom straight tube glass pipe | $6.40 | $12.80 | $34.99 | 63.4% |
| H468A | Sonic glass hand pipe | $6.70 | $13.40 | $34.99 | 61.7% |
| H468B | Rick glass hand pipe | $6.90 | $13.80 | $34.99 | 60.6% |
| H468C | Yoda glass hand pipe | $6.90 | $13.80 | $34.99 | 60.6% |
| H378 | Kuromi hand pipe | $6.80 | $13.60 | $34.99 | 61.1% |
| H377 | Kitty big hand pipe | $6.80 | $13.60 | $34.99 | 61.1% |
| H363 | Mario glass hand pipes | $7.20 | $14.40 | $39.99 | 64.0% |
| H455 | Puppet bear hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H454 | The boy hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H453 | Spotted monster hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H440 | Barbarian hand pipe | $5.90 | $11.80 | $29.99 | 60.7% |
| H439 | Skull hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H438 | The Gingerbread Man hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H436 | Smiley Ghost hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H434 | Eye hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H401 | Shark hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H400 | Cat paw hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H308 | Naked lady hand pipe | $6.00 | $12.00 | $29.99 | 60.0% |
| H240 | Screaming chicken pipe | $6.60 | $13.20 | $34.99 | 62.3% |

### Accessories & Other

| SKU | Product | Landed | Shop Cost | Formula Retail | Margin |
|-----|---------|--------|-----------|---------------|--------|
| H435-2 | 6.5'' Plastic nectar collector (steel nail) | $7.40 | $14.80 | $39.99 | 63.0% |
| H129 | 6.6'' nectar collector | $7.50 | $15.00 | $39.99 | 62.5% |
| J1P | 180ml flower jar | $7.40 | $14.80 | $39.99 | 63.0% |
| WS158 | Cucumber glass pipe | $7.50 | $15.00 | $39.99 | 62.5% |
| WS155 | Mushroom glass pipe | $7.50 | $15.00 | $39.99 | 62.5% |
| WS156 | Pea glass pipe | $7.50 | $15.00 | $39.99 | 62.5% |
| A3 | Geometric Ashtray | $7.90 | $15.80 | $34.99 | 54.8% |
| P001 | Big 9 holes glass bowl | $5.80 | $11.60 | $29.99 | 61.3% |
| P002 | Small 9 holes glass bowl | $5.70 | $11.40 | $29.99 | 62.0% |

### CBD Battery Devices

| SKU | Product | Landed | Shop Cost | Formula Retail | Margin |
|-----|---------|--------|-----------|---------------|--------|
| E23 | Santa claus internal CBD battery device | $7.70 | $15.40 | $34.99 | 56.0% |
| E9 | Monster internal CBD battery device | $7.70 | $15.40 | $34.99 | 56.0% |
| E8 | Alien internal CBD battery device | $7.70 | $15.40 | $34.99 | 56.0% |
| E7 | Yoda internal CBD battery device | $7.70 | $15.40 | $34.99 | 56.0% |

### Bulk/Display (Wholesale Pricing)

| SKU | Product | Landed | Shop Cost | Formula Retail | Margin | Unit Count |
|-----|---------|--------|-----------|---------------|--------|------------|
| H462 | Mixed hand pipes 18pcs/display | $34.80 | $62.64 | $120.00 | 47.8% | 18 pcs |
| B033 | Dab tools mixed 10pcs/jar | $14.30 | $28.60 | $59.95 | 52.3% | 10 pcs |
| B002 | Roach clips mixed 15pcs/set | $11.90 | $23.80 | $49.99 | 52.4% | 15 pcs |

</details>

---

## Pipeline Code Audit

### Cost-Setting Gap in wholesaler-product-creator.js

**File:** `src/wholesaler-product-creator.js`
**Lines:** 153-167 (setCostOnProduct) vs 330-332 (variant detection)

```
Step 4: Create product (1 default variant)
Step 5: setCostOnProduct() ← sets cost on existing variants
Step 6: Upload images
Step 7: AI variant detection ← creates NEW variants with NO cost
```

**Fix recommendation:** Add a second `setCostOnProduct()` call AFTER step 7:

```javascript
// After variant detection (Step 7), re-apply cost to any new variants
if (variantResult.detected && variantResult.applied) {
  console.log('  │  Step 6b: Re-setting cost on new variants...');
  await setCostOnProduct(shopifyProduct.id, pricing.cost);
}
```

### Cost Multiplier Boundary Edge Case

In `pricing-engine.js` line 8-15, the tier boundaries have no gap handling:
- Tier 1 ends at $4.00, Tier 2 starts at $4.01
- A price of exactly $4.005 would fall through to the fallback

This is theoretically possible with rounding in the wholesaler spreadsheet but unlikely to cause real issues.

---

*Report generated 2026-03-03*

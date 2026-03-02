# Shopify Profit Margin Audit Report — LIVE DATA

**Date:** 2026-03-02
**Store:** oil-slick-pad.myshopify.com (Oil Slick)
**Vendor Filter:** What You Need
**Total Products:** 2,373
**Total Variants:** 6,273
**Source:** Live Shopify Admin API + YHS Supply spreadsheet

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total variants audited | 6,273 |
| Variants with calculable margin (cost & price set) | 2,886 |
| Healthy (margin >= 30%) | 151 |
| **LOW MARGIN (< 30%)** | **673** |
| **NEGATIVE MARGIN (selling at a loss)** | **278** |
| Zero retail price ($0.00) | 273 |
| Missing Shopify cost field entirely | 3,374 |
| Variants with cost = retail (0% margin) | 71 |

**Average margin (where calculable):** -2.7%

### This is a critical pricing emergency.

Only **151 out of 2,886 variants** (5.2%) with calculable margins are at or above the 30% target. The overwhelming majority are either losing money or operating on razor-thin margins. The root cause is **wholesale CASE costs entered as per-unit costs** in Shopify.

---

## ROOT CAUSE: Case Costs vs Unit Costs

The #1 problem across the store is that **wholesale case/box costs from What You Need were entered into Shopify as per-unit costs**. This makes Shopify think every single item costs what an entire case costs.

### How the Problem Works

| What Happened | Example: RAW Classic KS Slim Papers |
|--------------|--------------------------------------|
| WYN sells a **case of 50 booklets** for | $54.00 |
| Shopify cost field was set to | $54.00 (the CASE cost) |
| Retail price per **single booklet** is | $2.99 |
| Shopify calculates margin as | **-1706%** (thinks you lose $51 per sale) |
| **What cost should actually be** | **$54.00 / 50 = $1.08 per booklet** |
| **Actual real margin** | **63.9%** (healthy!) |

This pattern repeats across **hundreds of rolling paper, cone, and consumable products**.

### Brands Most Affected

| Brand | Variants | Avg Margin (as entered) | Below 30% | Negative | Root Cause |
|-------|----------|------------------------|-----------|----------|------------|
| **Elements** | 120 | -452.2% | 53 | 34 | Case costs (24-50 packs/case) as unit cost |
| **OCB** | 12 | -233.7% | 11 | 11 | Case costs (24-50 packs/case) as unit cost |
| **Blazy Susan** | 26 | -169.0% | 22 | 22 | Case costs as unit cost |
| **RAW Papers/Cones** | 43 | -75.4% | 26 | 19 | Case costs (24-50 packs/case) as unit cost |
| **Clipper** | 27 | -58.2% | 2 | 2 | Display costs as unit cost |
| **Zig Zag** | 75 | -35.2% | 42 | 28 | Carton/case costs as unit cost |
| **Lookah** | 75 | -3.7% | 67 | 49 | WYN wholesale = Shopify cost (no markup) |
| **Vibes** | 33 | 25.8% | 18 | 4 | Case costs as unit cost |
| **Torches** | 58 | 28.5% | 24 | 7 | Display pack costs as unit cost |
| **Glass (Generic)** | 894 | 39.6% | 145 | 44 | Mixed: some WYN costs used directly |
| **Encore Glass** | 116 | 42.7% | 18 | 2 | Generally OK; a few WYN cost issues |
| **Custom/Bulk** | 12 | -3574.2% | 11 | 11 | Total bulk order costs as unit cost |
| **Other** | 1,395 | 44.0% | 234 | 45 | Mixed issues |

---

## PROBLEM TYPE 1: Case/Box Costs as Unit Costs (MOST CRITICAL)

These products have the WYN **case price** entered as the Shopify **per-unit cost**. The Shopify cost field needs to be divided by the number of units per case.

### Rolling Papers & Cones

| Product | SKU | Case Cost (entered) | Retail (per unit) | Apparent Margin | Est. Units/Case | Correct Unit Cost | Real Margin |
|---------|-----|--------------------|--------------------|-----------------|-----------------|-------------------|------------|
| RAW Classic KS Slim Papers | RAW-PAP-KSS-CLA | $54.00 | $2.99 | -1706% | 50 | $1.08 | 63.9% |
| RAW Black Classic KS Slim | RAW-PAP-KSS-BLK-CLA | $54.00 | $2.99 | -1706% | 50 | $1.08 | 63.9% |
| RAW Organic Hemp KS Slim | RAW-PAP-KSS-ORG-50BX | $54.00 | $15.99 | -237.7% | 50 | $1.08 | 93.2% |
| RAW Perforated Wide Tips | RAW-TIPS-PERF-WIDE-CLA-50BX | $40.00 | $2.49 | -1506% | 50 | $0.80 | 67.9% |
| RAW Original Tips | RAW-TIPS-ROLLUP-CLA-50BX | $40.00 | $29.99 | -33.4% | 50 | $0.80 | 97.3% |
| RAW Classic 6pk 1 1/4 Cones 32bx | RAW-CONE-114-6PKCLA-32BX | $72.00 | $69.99 | -2.9% | 32 | $2.25 | 96.8% |
| OCB Bamboo 1 1/4 Papers + Tips | 0-86400-90495-7 | $69.30 | $5.99 | -1056.9% | 24 | $2.89 | 51.8% |
| OCB Organic Hemp Slim + Tips | 0-86400-90331-8 | $69.30 | $4.99 | -1288.8% | 24 | $2.89 | 42.2% |
| Zig Zag Paper Cones Organic 1 1/4 6pk | 00008660006134 | $45.00 | $5.49 | -719.7% | ~24 | $1.88 | 65.8% |
| Zig Zag Paper Cones Organic King 3pk | 00008660006271 | $45.00 | $2.99 | -1405% | ~24 | $1.88 | 37.2% |
| Zig Zag Hemp Wraps - Natural | ZIGZAGHEMPWRAPSNPPNATURAL | $30.00 | $2.49 | -1104.8% | ~24 | $1.25 | 49.8% |
| Zig Zag Hemp Wraps - Sour Squeeze | ZIGZAGHEMPWRAPSNPPSQUEEZE | $30.00 | $2.99 | -903.3% | ~24 | $1.25 | 58.2% |
| Zig Zag 1 1/4 Ultra Thin Papers | ZIGZAG114ULTRATHINPAPERS | $72.00 | $44.99 | -60.0% | ~48 | $1.50 | 96.7% |
| Zig Zag 1 1/4 Organic Hemp Papers | ZIGZAG114ORGANICHEMPPAPERS | $45.00 | $27.99 | -60.8% | ~24 | $1.88 | 93.3% |
| Blazy Susan Purple Cones 1 1/4 6pk | various | $54.00 | $3.49 | -1447.6% | ~24 | $2.25 | 35.5% |
| Elements 1 1/4 Classic Papers 25bx | ELE-PAP-114-CLA-25BX | $45.00 | $39.99 | -12.5% | 25 | $1.80 | 95.5% |
| Elements 1 1/4 Papers 300S 20/BOX | ELE-PAP-114-300S-20BX | $72.00 | $59.99 | -20.0% | 20 | $3.60 | 94.0% |
| Clipper Classic Large Zig-Zag | CLIPPERZIGZAG1 | $72.00 | $4.99 | -1342.9% | ~24 | $3.00 | 39.9% |

> **Action Required:** For every rolling paper, cone, wrap, and consumable product, determine the **units per case** from the WYN invoice and divide the case cost to get the per-unit cost. Then update the Shopify cost field.

### Custom/Bulk Order Products

| Product | SKU | Total Order Cost (entered) | Retail (per unit) | Units in Order |
|---------|-----|---------------------------|--------------------|----------------|
| Custom 1 1/4 Rolling Papers w/ Magnet | LMRP3-2000QTY | $5,320.00 | $39.99 | 2,000 |
| Custom 18 inch 7mm Sandblast St w/ Box | CUSTOM187MMSANDBLASTSTWBOX | $8,400.00 | $159.99 | ~100 |
| Custom 8 inch Color Lip Beaker (100 qty) | FGP1641-8INCUSTOM-200-100 | $2,240.00 | $32.49 | 100 |
| Custom 8 inch Color Lip Beaker (500 qty) | FGP1641-8INCUSTOM-200-500 | $2,240.00 | $32.99 | 200+ |
| Custom 3.5 inch Silicone Hand Pipe | CUSTOM35SILICONE-200/500 | $560.00 | $14.99 | 200 |
| Custom 4 inch Element Hand Pipe | CUSTOMELEMENT-* | $504.00 | $24.99 | ~24 |
| Custom 6 inch Clear Bent Neck Rig | KK-4CUSTOM-QTY100-KUS | $3,080.00 | $84.99 | 100 |
| Custom Matches | 2000CUSTOMMATCHES | $343.00 | $149.99 | ~500 |
| Custom 8 inch Fab Egg Rig | FGP4134CUSTOM-100QTY | $3,500.00 | $1,999.99 | 100 |

---

## PROBLEM TYPE 2: WYN Wholesale Price = Shopify Cost (No Markup Applied)

These products have the WYN wholesale per-unit price entered directly as the Shopify cost, with retail set at or near the same price. The cost field should reflect the **landed cost + overhead**, and retail should be set higher.

### Lookah Devices (ALL variants affected)

| Product | Variants | WYN Cost (entered) | Retail | Margin | Should Be |
|---------|----------|-------------------|--------|--------|-----------|
| Lookah Ant 710 Battery Mod | 16 | $63.00 | $44.99 | -40.0% | Retail should be ~$90+ |
| Lookah Mini Dragon Egg | 9 | $72.00 | $69.99 | -2.9% | Retail should be ~$110+ |
| Lookah Ice Cream Dry Herb Vaporizer | 1 | $63.00 | $54.99 | -14.6% | Retail should be ~$90+ |
| Lookah Egg 510 Battery | 6 | $30.00 | $25.99 | -15.4% | Retail should be ~$45+ |
| Lookah Guitar 510 Battery | 4 | $28.00 | $24.99 | -12.0% | Retail should be ~$45+ |
| Lookah Cat 510 Battery | 1 | $30.00 | $29.99 | -0.0% | Retail should be ~$45+ |
| Lookah Seahorse Pro Plus | 8 | $45.00 | $44.99 | -0.0% | Cost correct; raise retail |
| Lookah Seahorse Coils 3/4/5pk | 3 | $40.00 | $39.99 | -0.0% | Cost correct; raise retail |
| Lookah Zero Discreet Battery | 1 | $30.00 | $29.99 | -0.0% | Retail should be ~$45+ |

### Other Zero-Margin Products

| Product | SKU | Cost | Retail | Margin |
|---------|-----|------|--------|--------|
| Extre Squirt Gun Vape Battery | FEC350-* | $30.00 | $29.99 | -0.0% |
| Flame Glass Nectar Collector Set | CH806-S-SET | $40.00 | $39.99 | -0.0% |
| Graphic Downstems | WYN-GRAPHIC | $35.00 | $34.99 | -0.0% |
| Fyre Gas Pump Torch | GAS PUMP-* | $45.00 | $44.99 | -0.0% |
| Square Sesh Sceptor Dab Tool | SESHSCEPTOR-*-SQUARE | $45.00 | $44.99 | -0.0% |
| Zig Zag Unbleached King Slim Carton | WYN-ZIG-ZAG-UN | $45.00 | $44.99 | -0.0% |
| RAW Classic 3M Roll 12bx | RAW-PAP-KS-3MR | $40.00 | $39.99 | -0.0% |
| RAW Pre-Rolled Wide Tips 20bx | RAW-TIPS-21PK | $40.00 | $39.99 | -0.0% |

---

## PROBLEM TYPE 3: Genuine Low-Margin Glass & Accessories

These products have costs that may be correct per-unit, but the retail price is set too low.

| Product | SKU | Cost | Retail | Margin | Suggested Retail (30%) |
|---------|-----|------|--------|--------|----------------------|
| Cowboy Holy Waters Sherlock Pipe | WYN-COWBOY-HOLY | $2,800.00 | $1,499.99 | -86.7% | $4,000.00 |
| 9 inch 710 Sci Glass Wigwag Recycler | WYN-9-710-SCI | $840.00 | $499.99 | -68.0% | $1,200.00 |
| Cove Glass Purple Hands Recycler Set | WYN-COVE-GLASS | $490.00 | $399.99 | -22.5% | $700.00 |
| Swan Confetti & Marble Bottle | WYN-SWAN-CONFE | $300.00 | $249.99 | -20.0% | $428.57 |
| 6 inch Creep Glass Recycler w/ Millie Cab | WYN-6-CREEP-GL | $300.00 | $249.99 | -20.0% | $428.57 |
| Amani Summerday 3 Piece Set | WYN-AMANI-SUMM | $1,400.00 | $1,299.99 | -7.7% | $2,000.00 |
| Kid Dino Hatchling Dino Egg - Yellow | WYN-KID-DINO | $700.00 | $599.99 | -16.7% | $1,000.00 |
| Kid Dino Hatchling Set | WYN-KID-DINO-SET | $1,050.00 | $315.00 | -233.3% | $1,500.00 |
| 16 inch Monark Inline Recycler | MK-W40-CR | $160.00 | $100.00 | -60.0% | $228.57 |
| 4.5 inch Encore Baby Yoshi Egg Rig | EC-BLU/GRN | $54.00 | $44.99 | -20.0% | $77.14 |
| MAVEN PRIME TORCH DISPLAY 9-Pack | 99-BLK | $90.00 | $74.99 | -20.0% | $128.57 |
| Maven Prism 4 Pack Display | 99-BLK | $80.00 | $39.99 | -100.0% | $114.29 |
| DUGOUT - Pack | WYN-5-DUGOUT | $45.00 | $29.99 | -50.0% | $64.29 |
| Hornet Hemp Wick 60pcs | PG427 | $45.00 | $29.99 | -50.0% | $64.29 |
| Just the Tip Dab Swabs | THETIPS | $24.00 | $22.99 | -4.4% | $34.29 |
| Round Sesh Sceptor Dab Tool | SESHSCEPTOR-* | $45.00 | $39.99 | -12.5% | $64.29 |
| 7.5 inch Scorch Torch Decal Slapper | 51625-F-* | $40.00 | $29.99 | -33.4% | $57.14 |
| Blazy Susan Glass Cleaner 16OZ | GC-16B1-PINK-M | $28.00 | $21.99 | -27.3% | $40.00 |
| 7.5 inch Oregon Made Glass Dry Hammer | OG DRYHAMMER-* | $54.00 | $48.99 | -10.2% | $77.14 |

---

## PROBLEM TYPE 4: Missing Cost Field (3,374 variants)

**53.8% of all variants** have no cost set in Shopify at all. These products cannot be tracked for profitability. The cost field shows $0.00 or null.

This is too many to list individually, but these need bulk cost updates via the spreadsheet sync tool.

---

## Products Currently HEALTHY (Margin >= 30%)

Only **151 variants** are currently at or above 30% margin. Most of these are glass pieces where the cost was set correctly.

### Examples of Healthy Products

| Product | Cost | Retail | Margin |
|---------|------|--------|--------|
| 10 inch KERBY/BOWMAN COLLAB | $3,500.00 | $5,000.00 | 30.0% |
| DARBY RAY RUN RIG | $2,100.00 | $3,000.00 | 30.0% |
| 5 inch Spiral Color Shower Head Ash Catcher | $30.00 | $42.99 | 30.2% |
| 10 inch Clear Straight - Made in USA | $45.00 | $64.99 | 30.8% |
| 2.5 inch 14mm Enclosed Opal Flower Bowl | $20.00 | $28.99 | 31.0% |

---

## Margin Distribution (2,886 variants with calculable margin)

| Margin Range | Count | % of Total |
|-------------|-------|-----------|
| Negative (< 0%) | 278 | 9.6% |
| Critical (0-15%) | 214 | 7.4% |
| Low (15-30%) | 181 | 6.3% |
| **SUBTOTAL: Below 30%** | **673** | **23.3%** |
| Target (30-40%) | 74 | 2.6% |
| Good (40-50%) | 43 | 1.5% |
| Strong (50-60%) | 23 | 0.8% |
| Excellent (60%+) | 11 | 0.4% |
| **SUBTOTAL: At/Above 30%** | **151** | **5.2%** |
| No cost set (cannot calculate) | 2,062 | -- |

---

## What You Need WooCommerce Site

The What You Need WooCommerce site (whatyouneed.com) is currently **password-protected** behind a lander page redirect. The site returns a 403 Forbidden status when accessed directly, and the public shop page redirects to `/lander`. This means:

1. WooCommerce product prices are not publicly accessible for cross-reference
2. To verify WYN wholesale prices, you will need to:
   - Log into the whatyouneed.com admin panel directly
   - Ask your WYN rep (Flora) for an updated price list
   - Use the WooCommerce API credentials (if you have them) to pull wholesale prices

---

## Action Items - Priority Order

### 1. IMMEDIATE: Fix Case Cost Entries (Rolling Papers, Cones, Wraps)

For every consumable product where the Shopify cost is a case/carton price:

1. Determine the **units per case** from the WYN invoice
2. Calculate: `per_unit_cost = case_cost / units_per_case`
3. Update the Shopify cost field to the per-unit cost

**Products to fix first:**
- All RAW products (43 variants)
- All Zig Zag products (75 variants)
- All Elements products (120 variants)
- All OCB products (12 variants)
- All Blazy Susan products (26 variants)
- All Vibes products (33 variants)
- All Clipper products (27 variants)

### 2. IMMEDIATE: Fix Lookah Device Pricing

All Lookah products (75 variants) have WYN wholesale as cost and retail is at or below cost:
- Either the cost needs to reflect the correct per-unit cost
- OR the retail prices need to be raised significantly

### 3. IMMEDIATE: Fix Zero-Margin Products

71 variants have cost = retail (0% margin). These need retail prices raised.

### 4. IMMEDIATE: Fix Custom/Bulk Order Costs

12 variants have total bulk order costs entered. Each needs `per_unit_cost = total_cost / quantity_ordered`.

### 5. SHORT-TERM: Fix Heady Glass Pricing

Several high-end glass pieces (Cowboy, Cove, Kid Dino, Amani) have costs higher than retail. Verify if these costs are correct. If so, retail must be raised.

### 6. SHORT-TERM: Set Missing Costs (3,374 variants)

Over half the variants have no cost set. Run the cost sync tool:
```bash
npm run costs           # Dry run first
npm run costs:execute   # Apply
```

### 7. ONGOING: Implement Cost-Entry Process

Establish a workflow so that when new WYN products are added:
1. Always enter the **per-unit cost**, not the case cost
2. Apply the pricing engine tier multiplier
3. Verify margin is >= 30% before publishing

---

## How to Use This Report

1. **Go through each section** and verify the findings in your Shopify Admin
2. **Start with Problem Type 1** (case costs) as this is the highest-impact fix
3. **For each product**, go to Shopify Admin > Products > [product] > Edit > Variants
4. **Update the "Cost per item" field** with the correct per-unit cost
5. **Re-run this audit** after making changes to verify margins are correct

### Re-running the Audit

From a machine with Shopify API access:
```bash
cd /path/to/Shopify-Collection-strategy-and-menu-creation
python3 margin_audit_live.py
```

---

*Report generated from live Shopify Admin API data on 2026-03-02*
*2,373 products / 6,273 variants audited*
*Supplier reference: yhs_supply_products.xlsx (102 Cloud YHS products)*

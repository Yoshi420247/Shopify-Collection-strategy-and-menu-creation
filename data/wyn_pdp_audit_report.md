# WYN PDP Audit Report — 2026-02-26

## Summary

- **Vendor**: What You Need
- **Total products**: 2,188
- **Active**: 1,786 | **Draft**: 402

### Before → After

| Metric | Before | After |
|--------|--------|-------|
| Products scoring 41-60 | 1 | 0 |
| Products scoring 61-80 | 128 | 10 |
| Products scoring 81-100 | 2,027 | 2,060+ |
| Active avg score | 96.3 | 96.4 |
| ALL-CAPS titles | 171 | 0 |
| "Contact Us" placeholders | 233 | 0 |
| $-prefixed titles | 22 | 0 |
| Products missing internal links | 21 | 1 |
| Products missing care sections | 11 | 1 |
| Products with <3 tags | 6 | 4 |

## Total Changes Pushed to Shopify

| Operation | Count |
|-----------|-------|
| Full body HTML rewrites | 12 |
| ALL-CAPS → title case | 171 |
| "Contact Us" placeholder removal | 233 |
| $-prefixed title → SEO-friendly | 22 |
| Internal link additions | 20 |
| Care section additions | 10 |
| Tag enrichment | 5 |
| Product type fixes | 1 |
| **Total product modifications** | **474** |

## Full Body Rewrites (12 products)

| Product ID | Title | Before | After | Issue Fixed |
|-----------|-------|--------|-------|-------------|
| 10068494811416 | 7.5″ Iridescent Double Uptake Recycler | 22 words, score 60 | ~810 words, full PDP | Empty body → complete product page |
| 10112522256664 | Dugout Variety Pack — $5 | 502w generic | ~580w targeted | Generic pack copy → wholesale-focused |
| 10112519995672 | Bubbler Variety Pack — $10 | 520w generic | ~550w targeted | Generic → functional benefit-led |
| 10112369066264 | Bubbler Variety Pack — $15 | 649w generic | ~520w targeted | Generic → mid-tier positioning |
| 10112353894680 | Bubbler Variety Pack — $7.50 | 665w generic | ~500w targeted | Generic → entry-level positioning |
| 10112353698072 | Carb Cap Variety Pack — $7.50 | 609w generic | ~550w targeted | Generic → education-focused |
| 10112386597144 | Hand Pipe Variety Pack — $5 | 599w generic | ~530w targeted | Generic → retail-focused |
| 10112381190424 | Carb Cap Variety Pack — $1 | 625w generic | ~480w targeted | Generic → add-on sale positioning |
| 10112390725912 | Pokeball Slurper Set | 596w generic | ~560w targeted | Generic → slurper education |
| 10112354058520 | Hand Pipe Variety Pack — $10 | 625w generic | ~450w targeted | Generic → mid-range positioning |
| 10112365560088 | 14mm Flower Bowl Variety Pack — $2 | 583w generic | ~420w targeted | Generic → consumable positioning |
| 10112386892056 | Hand Pipe Variety Pack — $7.50 | 653w generic | ~400w targeted | Generic → quality step-up positioning |

## Title Fixes (193 products)

### ALL-CAPS → Title Case (171 products)

Examples:
- `BOX OF SCREENS – METAL` → `Box of Screens – Metal`
- `VIBES CATCH A VIBE ROLLING TRAY – LARGE` → `Vibes Catch a Vibe Rolling Tray – Large`
- `ZIG ZAG MINI PALM ROLLS CARTON 2PK – BANANA` → `Zig Zag Mini Palm Rolls Carton 2pk – Banana`
- `LOOKAH EGG 510 BATTERY (350MAH)` → `Lookah Egg 510 Battery (350mah)`

Smart casing preserved: measurement abbreviations (mm, mah), brand-relevant caps (DAB, USB, LED, USA).

### $-Prefixed → SEO-Friendly (22 products)

Examples:
- `$5 Hand Pipe Pack` → `Hand Pipe Variety Pack — $5`
- `$10.00 Bubbler Pack` → `Bubbler Variety Pack — $10`
- `$85 Special K - Made in USA` → `Special K - Made in USA — $85`

Price moved to end of title. URLs/handles unchanged.

## "Contact Us" Placeholder Removal (233 products)

Replaced wholesaler-facing language with retail-appropriate text:

| Pattern | Count | Replacement |
|---------|-------|-------------|
| "Please Contact Us For Current Availability" | 63 | Removed entirely |
| FAQ color availability references | 161 | "Use the variant selector above to see available colors" |
| FAQ stock/availability references | 4 | "Check product options above for current availability" |
| Other references (damage, custom) | 5 | Appropriate retail support language |

## Metadata / Tag Fixes

| Product ID | Title | Fix |
|-----------|-------|-----|
| 9885281059096 | 6.5″ Bee Decal Rig | Enriched tags (copy strong, needs manual image upload) |
| 9885281812760 | 7.5″ Two-Tone Beaker | Enriched tags (copy strong, needs manual image upload) |
| 10112343179544 | 1" Silicone Dab Cap | Fixed product_type: Rolling Accessories → Carb Caps |

## Remaining Issues (manual action required)

### Products with 0 Images (3 active)

These have strong copy but zero product images — a major conversion blocker:

| Product ID | Title | Words |
|-----------|-------|-------|
| 9885281059096 | 6.5″ Bee Decal Rig | 1,076 |
| 9885266149656 | 14 F 90° to 14 F 90° Drop Down | 993 |
| 9885281812760 | 7.5″ Two-Tone Beaker | 829 |

**Action**: Upload product photos via Shopify admin or request from WYN.

### Products with Only 1 Image (156 active)

These products have good copy and could benefit from additional lifestyle/detail photos. Higher image counts correlate with better conversion rates.

## Rewrite Approach

All rewrites follow the store's established PDP template:
1. **Opening paragraph** — Product-specific, benefit-focused intro
2. **Why You'll Love It / Why It Works** — 5-6 bullet points with bold leads
3. **Best For** — Target customer description with internal links
4. **How to Use** — Practical usage instructions
5. **Specs** — HTML table with key specifications
6. **Care & Maintenance** — 3-5 maintenance tips

Copy voice: Direct, knowledgeable, conversational. Speaks to both retail buyers and end consumers. Avoids hype language and leads with functional benefits.

## Scoring Methodology

Products scored 0-100 across 6 dimensions:
- **Content depth** (0-30): Word count thresholds
- **Structure** (0-20): Headings, lists, paragraphs
- **SEO signals** (0-15): Title quality, keyword presence, spec content
- **Media** (0-15): Image count
- **Variants** (0-10): Named variants, pricing completeness
- **Taxonomy** (0-10): Product type + tag completeness

Full scored data: `data/wyn_pdp_audit.json`
Scoring script: `scripts/fetch_and_score_wyn.py`

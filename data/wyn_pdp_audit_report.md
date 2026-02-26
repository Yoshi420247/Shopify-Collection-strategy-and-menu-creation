# WYN PDP Audit Report — 2026-02-26

## Summary

- **Vendor**: What You Need
- **Total products**: 2,156
- **Active**: 1,755 | **Draft**: 401
- **Overall avg score**: 95.2 / 100
- **Active avg score**: 96.3 / 100

## Score Distribution

| Range   | Count | Pct   |
|---------|-------|-------|
| 0–20    | 0     | 0%    |
| 21–40   | 0     | 0%    |
| 41–60   | 1     | <1%   |
| 61–80   | 128   | 5.9%  |
| 81–100  | 2,027 | 94.0% |

## Products Rewritten (13 total)

### Full Body Rewrites (pushed to Shopify)

| # | Product ID | Title | Before | After | Issue Fixed |
|---|-----------|-------|--------|-------|-------------|
| 1 | 10068494811416 | 7.5″ Iridescent Double Uptake Recycler | 22 words, score 60 | ~810 words, full PDP | Empty body → complete product page |
| 3 | 10112522256664 | $5 Dugout Packs | 502w generic, score 76 | ~580w targeted | Generic pack copy → wholesale-focused |
| 4 | 10112519995672 | $10.00 Bubbler Pack | 520w generic, score 78 | ~550w targeted | Generic → functional benefit-led |
| 5 | 10112369066264 | $15.00 Bubbler Pack | 649w generic, score 78 | ~520w targeted | Generic → mid-tier positioning |
| 6 | 10112353894680 | $7.50 Bubbler Pack | 665w generic, score 78 | ~500w targeted | Generic → entry-level positioning |
| 7 | 10112353698072 | $7.50 Carb Cap Pack | 609w generic, score 78 | ~550w targeted | Generic → education-focused |
| 11 | 10112386597144 | $5 Hand Pipe Pack | 599w generic, score 80 | ~530w targeted | Generic → retail-focused |
| 12 | 10112381190424 | $1.00 Carb Cap Packs | 625w generic, score 83 | ~480w targeted | Generic → add-on sale positioning |
| 13 | 10112390725912 | Pokeball Slurper Set | 596w generic, score 83 | ~560w targeted | Generic → slurper education |
| 21 | 10112354058520 | $10.00 Hand Pipe Pack | 625w generic, score 85 | ~450w targeted | Generic → mid-range positioning |
| 22 | 10112365560088 | $2 14mm Flower Bowl Packs | 583w generic, score 85 | ~420w targeted | Generic → consumable positioning |
| 25 | 10112386892056 | $7.50 Hand Pipe Pack | 653w generic, score 85 | ~400w targeted | Generic → quality step-up positioning |

### Metadata / Tag Fixes (pushed to Shopify)

| Product ID | Title | Fix |
|-----------|-------|-----|
| 9885281059096 | 6.5″ Bee Decal Rig | Enriched tags (copy already strong, needs manual image upload) |
| 9885281812760 | 7.5″ Two-Tone Beaker | Enriched tags (copy already strong, needs manual image upload) |
| 10112343179544 | 1" Silicone Dab Cap | Fixed product_type: Rolling Accessories → Carb Caps + enriched tags |

## Remaining Issues (manual action required)

### Products with 0 Images (active)

These products have good copy but zero product images — a major conversion blocker:

| Product ID | Title | Words |
|-----------|-------|-------|
| 9885281059096 | 6.5″ Bee Decal Rig | 1,076 |
| 9885266149656 | 14 F 90° to 14 F 90° Drop Down | 993 |
| 9885281812760 | 7.5″ Two-Tone Beaker | 829 |

**Action**: Upload product photos via Shopify admin or request from WYN.

### $-Prefixed Titles (SEO concern)

Multiple active products use price-led titles (e.g., "$5 Hand Pipe Pack"). These:
- Don't rank well for product-type searches
- Look like ad copy rather than product names
- Should ideally be renamed (e.g., "Hand Pipe Variety Pack — $5 Range")

**Note**: Title changes were NOT pushed to avoid breaking existing URLs/bookmarks. Recommend A/B testing title changes on a few products first.

## Rewrite Approach

All rewrites follow the store's established PDP template:
1. **Opening paragraph** — Product-specific, benefit-focused intro
2. **Why You'll Love It / Why It Works** — 5-6 bullet points with bold leads
3. **Best For** — Target customer description with internal links
4. **How to Use** — Practical usage instructions
5. **Specs** — HTML table with key specifications
6. **Care & Maintenance** — 3-5 maintenance tips

Copy voice: Direct, knowledgeable, conversational. Speaks to both retail buyers and end consumers. Avoids hype language and instead leads with functional benefits.

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

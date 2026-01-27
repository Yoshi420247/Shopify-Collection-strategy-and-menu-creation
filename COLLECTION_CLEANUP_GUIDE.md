# Collection & Menu Cleanup Guide

**Store:** Oil Slick (oil-slick-pad.myshopify.com)
**Date:** 2026-01-27
**Status:** Ready for Execution

---

## Executive Summary

This guide documents all identified collection issues and provides scripts to fix them. The main problems are:

1. **3 Broken Silicone Collections** - Matching ALL 751 products instead of ~17 silicone items
2. **40+ Duplicate Collections** - Legacy underscore format, redundant "-collection" suffixes, numbered duplicates
3. **Misguided Collection Formation** - Overlapping collections, vague categories
4. **Menu Inconsistencies** - Broken links, duplicates in navigation

---

## Issues Identified

### 1. CRITICAL: Broken Silicone Collections

These collections are missing the `material:silicone` tag rule, causing them to match ALL 751 products:

| Collection Handle | Current Issue | Products Matched | Should Match |
|-------------------|---------------|------------------|--------------|
| `silicone-pipes` | Missing material rule | 751 | ~4 |
| `silicone-water-pipes` | Missing material rule | 751 | ~2 |
| `silicone-smoking-devices` | Missing material rule | 751 | ~17 |
| `silicone-rigs-bongs` | May need rule update | Unknown | ~10 |

**Fix:** Update each collection to include `tag equals material:silicone`

### 2. Duplicate Collections to Delete

#### Legacy Underscore Format (6 collections)
These are old Shopify URL format - delete and keep hyphenated versions:
- `dab_rig` → Keep `dab-rigs`
- `hand_pipe` → Keep `hand-pipes`
- `quartz_banger` → Keep `quartz-bangers`
- `torch_tool` → Keep `torches`
- `water_pipe` → Keep `bongs-water-pipes`
- `grinder` → Keep `grinders`

#### Redundant "-collection" Suffix (11 collections)
- `hand-pipes-collection` → Keep `hand-pipes`
- `flower-bowls-collection` → Keep `flower-bowls`
- `grinders-collection` → Keep `grinders`
- `torches-collection` → Keep `torches`
- `heady-glass-collection` → Keep `heady-glass`
- `pendants-collection` → Keep `pendants-merch`
- `one-hitter-and-chillums-collection` → Keep `one-hitters-chillums`
- `nectar-collectors-collection` → Keep `nectar-collectors`
- `carb-caps-collection` → Keep `carb-caps`
- `dabbers-collection` → Keep `dab-tools`
- `essentials-accessories-collection` → Keep `accessories`

#### Numbered Duplicates (4 collections)
- `clearance-1` → Keep `clearance`
- `clearance-2` → Keep `clearance`
- `nectar-collectors-1` → Keep `nectar-collectors`
- `mylar-bags-1` → Keep `mylar-bags`

#### Redundant Specific Collections (6+ collections)
- `dab-rigs-and-oil-rigs` → Keep `dab-rigs`
- `glass-bongs-and-water-pipes` → Keep `bongs-water-pipes`
- `smoke-vape` → Keep `smoke-and-vape`
- `smoke-shop-products` → Keep `smoke-and-vape`
- `all-headshop` → Keep `smoke-and-vape`
- `shop-all-what-you-need` → Keep `smoke-and-vape`
- `smoking` → Keep `smoke-and-vape`
- `smoking-devices` → Delete (redundant)

#### Duplicate Silicone Collections (5 collections)
After fixing the main silicone collections:
- `silicone-beaker-bongs` → Keep `silicone-rigs-bongs`
- `silicone-glass-hybrid-rigs-and-bubblers` → Keep `silicone-rigs-bongs`
- `cute-silicone-rigs` → Keep `silicone-rigs-bongs`
- `top-selling-silicone-rigs` → Keep `silicone-rigs-bongs`
- `silicone-ashtrays` → Keep `ashtrays`

#### Duplicate Extraction/Packaging Collections (10+ collections)
- `extract-packaging-jars-and-nonstick` → Keep `extraction-packaging`
- `extraction-materials-packaging` → Keep `extraction-packaging`
- `extraction-supplies` → Keep `extraction-packaging`
- `nonstick-materials-for-extraction` → Keep specific collections
- `non-stick-paper-and-ptfe` → Keep `ptfe-sheets`
- `glass-jars-extract-packaging` → Keep `glass-jars`
- `non-stick-containers` → Keep `concentrate-containers`
- `packaging-storage` → Keep `storage-containers`
- `storage-packaging` → Keep `storage-containers`
- `storage` → Keep `storage-containers`
- `parchment-papers` → Keep `parchment-paper`

### 3. Product Tag Issues

Some silicone products have incorrect family tags:

| Product Type | Current Tag | Correct Tag |
|--------------|-------------|-------------|
| Silicone Nectar Straws | `family:flower-bowl` | `family:nectar-collector` |
| Silicone products missing material tag | (none) | `material:silicone` |

---

## Recommended Collection Structure

### Primary Collections (KEEP)

```
SMOKE & VAPE
├── smoke-and-vape (Main landing - all WYN products)
├── bongs-water-pipes (family:glass-bong)
├── bongs (alias for bongs-water-pipes)
├── dab-rigs (family:glass-rig)
├── hand-pipes (family:spoon-pipe)
├── bubblers (family:bubbler)
├── nectar-collectors (family:nectar-collector)
├── one-hitters-chillums (family:chillum-onehitter)
└── silicone-rigs-bongs (material:silicone)

ACCESSORIES
├── accessories (pillar:accessory)
├── quartz-bangers (family:banger)
├── carb-caps (family:carb-cap)
├── dab-tools (family:dab-tool)
├── flower-bowls (family:flower-bowl)
├── ash-catchers (family:ash-catcher)
├── torches (family:torch)
├── grinders (family:grinder)
├── rolling-papers (family:rolling-paper)
├── vapes-electronics (use:vaping)
├── storage-containers (use:storage)
├── trays-work-surfaces (family:rolling-tray)
└── pendants-merch (pillar:merch)

EXTRACTION & PACKAGING
├── extraction-packaging (Main landing)
├── silicone-pads
├── fep-sheets
├── ptfe-sheets
├── parchment-paper
├── glass-jars
├── concentrate-containers
├── mylar-bags
├── joint-tubes
└── rosin-extraction

BRANDS
├── raw, zig-zag, vibes, elements, cookies
├── monark, maven, puffco, lookah, g-pen
└── 710-sci, scorch

FEATURED
├── heady-glass (style:heady)
├── made-in-usa (style:made-in-usa)
├── travel-friendly (style:travel-friendly)
└── clearance
```

---

## Execution Instructions

### Step 1: Set Up Environment

Create a `.env` file with your Shopify credentials:

```bash
cp .env.example .env
# Edit .env and add your SHOPIFY_ACCESS_TOKEN
```

### Step 2: Run Analysis (Dry Run)

```bash
npm run cleanup:report
```

This will show all issues without making changes.

### Step 3: Fix Broken Silicone Collections

```bash
npm run cleanup:fix
```

This fixes the collection rules for silicone collections.

### Step 4: Fix Product Tags

```bash
npm run cleanup:tags
```

This fixes silicone products with wrong family tags.

### Step 5: Delete Duplicate Collections

```bash
npm run cleanup:delete
```

**WARNING:** This permanently deletes collections. Review the list first!

### Step 6: All at Once (Be Careful!)

```bash
npm run cleanup:all
```

This executes all fixes. Only use after reviewing the dry run.

---

## Menu Structure Update

### Recommended Main Menu

```
Main menu
├── Shop All → /collections/all
├── Extraction & Packaging → /collections/extraction-packaging
│   ├── Silicone Pads & Mats → /collections/silicone-pads
│   ├── FEP Sheets & Rolls → /collections/fep-sheets
│   ├── PTFE Sheets & Rolls → /collections/ptfe-sheets
│   ├── Parchment Paper → /collections/parchment-paper
│   ├── Glass Jars → /collections/glass-jars
│   ├── Concentrate Containers → /collections/concentrate-containers
│   ├── Mylar Bags → /collections/mylar-bags
│   ├── Joint Tubes → /collections/joint-tubes
│   └── Shop All Extraction → /collections/extraction-packaging
├── Smoke & Vape → /collections/smoke-and-vape
│   ├── Bongs & Water Pipes → /collections/bongs-water-pipes
│   ├── Dab Rigs → /collections/dab-rigs
│   ├── Hand Pipes → /collections/hand-pipes
│   ├── Bubblers → /collections/bubblers
│   ├── Nectar Collectors → /collections/nectar-collectors
│   ├── One Hitters & Chillums → /collections/one-hitters-chillums
│   ├── Silicone Pieces → /collections/silicone-rigs-bongs
│   └── Shop All Smoke & Vape → /collections/smoke-and-vape
├── Accessories → /collections/accessories
│   ├── Quartz Bangers → /collections/quartz-bangers
│   ├── Carb Caps → /collections/carb-caps
│   ├── Dab Tools → /collections/dab-tools
│   ├── Flower Bowls → /collections/flower-bowls
│   ├── Ash Catchers → /collections/ash-catchers
│   ├── Torches → /collections/torches
│   ├── Grinders → /collections/grinders
│   ├── Rolling Papers & Cones → /collections/rolling-papers
│   ├── Vapes & Electronics → /collections/vapes-electronics
│   ├── Storage & Containers → /collections/storage-containers
│   └── Trays & Work Surfaces → /collections/trays-work-surfaces
├── Brands → #
│   ├── RAW → /collections/raw
│   ├── Zig Zag → /collections/zig-zag
│   ├── Vibes → /collections/vibes
│   ├── Elements → /collections/elements
│   ├── Cookies → /collections/cookies
│   ├── Monark → /collections/monark
│   ├── Maven → /collections/maven
│   ├── Puffco → /collections/puffco
│   ├── Lookah → /collections/lookah
│   └── G Pen → /collections/g-pen
└── Featured → #
    ├── Heady Glass → /collections/heady-glass
    ├── Made In USA → /collections/made-in-usa
    ├── Travel Friendly → /collections/travel-friendly
    └── Clearance → /collections/clearance
```

### Update Menus Manually

1. Go to **Shopify Admin** → **Online Store** → **Navigation**
2. Edit **Main menu** to match the structure above
3. Edit **Sidebar Menu** similarly
4. Remove any links to deleted collections
5. Save changes

---

## Summary of Changes

| Action | Count | Impact |
|--------|-------|--------|
| Fix broken silicone collections | 4 | Correct product filtering |
| Delete duplicate collections | 40+ | Clean up admin, better SEO |
| Fix product tags | ~20 | Proper categorization |
| Update menu structure | 2 menus | Better navigation |

---

## NPM Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run cleanup` | Dry run - show all issues |
| `npm run cleanup:report` | Report only - no changes |
| `npm run cleanup:fix` | Fix broken collection rules |
| `npm run cleanup:delete` | Delete duplicate collections |
| `npm run cleanup:tags` | Fix product tags |
| `npm run cleanup:all` | Execute all fixes |

---

*Generated by Collection Cleanup Script*

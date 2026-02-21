# Collection Strategy Analysis Report

**Store:** Oil Slick (oil-slick-pad.myshopify.com)
**Analyzed:** 751 "What You Need" vendor products
**Date:** 2026-01-24

---

## EXECUTIVE SUMMARY

The collection strategy has several critical issues that need immediate attention:

1. **3 silicone collections are broken** - matching ALL 751 products instead of just silicone items
2. **Multiple duplicate collections** exist for the same product categories
3. **Several potential new collections** could improve navigation and SEO
4. **Some products have incorrect tags** that need cleanup

---

## CRITICAL ISSUES (FIX IMMEDIATELY)

### 1. Broken Silicone Collections

These collections have rules that only check `vendor = "What You Need"`, causing them to include ALL 751 products instead of just silicone items:

| Collection | Current Count | Expected Count | Issue |
|------------|---------------|----------------|-------|
| `silicone-pipes` | 751 | ~17 | Missing `material:silicone` rule |
| `silicone-water-pipes` | 751 | ~17 | Missing `material:silicone` rule |
| `silicone-smoking-devices` | 751 | ~17 | Missing `material:silicone` rule |

**Fix:** Add rule `tag equals material:silicone` to each collection.

### 2. Actual Silicone Products (17 total)

Only 17 products have `material:silicone` tag:
- 4x Silicone Nectar Straws (with quartz/titanium/ceramic tips)
- 2x Silicone Animal Pipes (rabbit, elephant)
- 5x Silicone Bubblers (Transformers, Grogu, Dragon, Hammer x2)
- 2x Silicone Rigs (Hexagon, Window Bottle Cat Eye)
- 1x Silicone Hammer Rig with Glass Body
- 1x Wigwag Jar with Silicone Lid
- 1x Metal Dab Tools with Silicone Tips
- 2x Bulk Silicone Hand Pipes (40ct jars)

---

## COLLECTION HEALTH CHECK

### Collections Working Correctly ✓

| Collection | Products | Tag Used | Status |
|------------|----------|----------|--------|
| `flower-bowls` | 140 | `family:flower-bowl` | ✓ Correct |
| `dab-rigs` | 117 | `family:glass-rig` | ✓ Correct |
| `hand-pipes` | 88 | `family:spoon-pipe` | ✓ Correct |
| `bongs` | 66 | `family:glass-bong` | ✓ Correct |
| `bubblers` | 46 | `family:bubbler` | ✓ Correct |
| `carb-caps` | 34 | `family:carb-cap` | ✓ Correct |
| `dab-tools` | 33 | `family:dab-tool` | ✓ Correct |
| `quartz-bangers` | 29 | `family:banger` | ✓ Correct |
| `torches` | 24 | `family:torch` | ✓ Correct |
| `made-in-usa-glass` | 106 | `style:made-in-usa` | ✓ Correct |
| `rolling-papers-cones` | 64 | `family:rolling-paper` | ✓ Correct |
| `accessories` | 384 | `pillar:accessory` | ✓ Correct |

### Duplicate Collections (Consider Consolidating)

| Primary | Duplicates | Recommendation |
|---------|------------|----------------|
| `dab-rigs` (117) | `dab_rig` (98), `dab-rigs-and-oil-rigs` (35) | Keep `dab-rigs`, delete others |
| `hand-pipes` (88) | `hand_pipe` (118), `hand-pipes-collection` (28) | Keep `hand-pipes`, delete others |
| `bongs` (66) | `smoking-devices` (67) | Keep `bongs`, update `smoking-devices` |
| `quartz-bangers` (29) | `quartz_banger` (41) | Keep `quartz-bangers`, delete other |
| `nectar-collectors` | `nectar-collectors-1` (30) | Consolidate |

### Overly Broad Collections (By Design)

These correctly match all 751 products:
- `shop-all-what-you-need` - Shop All page
- `all-headshop` - Headshop landing
- `smoke-shop-products` - Smoke shop main
- `smoking` - General smoking category
- `smoke-vape` / `smoke-and-vape` - Main navigation

---

## PRODUCT TAG ANALYSIS

### Tag Distribution by Namespace

| Namespace | Top Tags | Count |
|-----------|----------|-------|
| **material:** | glass (512), borosilicate (59), metal (54), quartz (29), silicone (6) | 693 |
| **family:** | flower-bowl (140), glass-rig (117), spoon-pipe (88), glass-bong (66), rolling-paper (64) | 746 |
| **pillar:** | accessory (384), smokeshop-device (342), merch (20), packaging (5) | 751 |
| **use:** | flower-smoking (389), dabbing (260), rolling (64), storage (22) | 735 |
| **joint_size:** | 14mm (255), 10mm (83), 18mm (8) | 346 |
| **style:** | brand-highlight (108), made-in-usa (106), animal (105) | 319 |
| **brand:** | zig-zag (41), vibes (30), monark (27), cookies (20), maven (20) | 138+ |

### Products Missing Tags

| Issue | Count | Examples |
|-------|-------|----------|
| No `family:` tag | 4 | Drop Down adapters, Glass Cleaner, Custom Matches |
| No `pillar:` tag | 0 | All products tagged correctly |

---

## RECOMMENDED NEW COLLECTIONS

### High Priority (Improve Navigation)

| Collection | Handle | Rule | Est. Products |
|------------|--------|------|---------------|
| **Silicone Bubblers** | `silicone-bubblers` | `material:silicone` + `family:bubbler` | 5 |
| **Silicone Hand Pipes** | `silicone-hand-pipes` | `material:silicone` + `family:spoon-pipe` | 4 |
| **Animal/Character Pipes** | `novelty-pipes` | Title contains animal keywords | 15+ |
| **Glass Pendants** | `glass-pendants` | `family:merch-pendant` | 20 |
| **One Hitters & Chillums** | Already exists | `family:chillum-onehitter` | 11 |

### Medium Priority (SEO/Discovery)

| Collection | Handle | Rule | Est. Products |
|------------|--------|------|---------------|
| **Bulk Display Boxes** | `retail-display` | `bundle:display-box` | 27 |
| **14mm Accessories** | `14mm-accessories` | `joint_size:14mm` | 255 |
| **10mm Accessories** | `10mm-accessories` | `joint_size:10mm` | 83 |
| **Borosilicate Glass** | `borosilicate-glass` | `material:borosilicate` | 59 |
| **Vape Batteries** | `vape-batteries` | `family:vape-battery` | 10 |

### Brand Collections to Add

| Brand | Tag | Products |
|-------|-----|----------|
| Zig Zag | `brand:zig-zag` | 41 |
| Vibes | `brand:vibes` | 30 |
| Monark | `brand:monark` | 27 |
| Cookies | `brand:cookies` | 20 |
| Maven | `brand:maven` | 20 |

---

## RECOMMENDED FIXES

### Step 1: Fix Broken Silicone Collections

```javascript
// Update silicone-pipes (ID: 58930495587)
{
  "smart_collection": {
    "rules": [
      { "column": "vendor", "relation": "equals", "condition": "What You Need" },
      { "column": "tag", "relation": "equals", "condition": "material:silicone" }
    ],
    "disjunctive": false
  }
}

// Update silicone-water-pipes (ID: 129261535331)
// Update silicone-smoking-devices (ID: 155901067363)
// Same rules as above
```

### Step 2: Fix Product Tags

Products needing `family:` tags:
1. "10 M 90° TO 14 F 90° DROP DOWN" → Add `family:downstem` or `family:adapter`
2. "14 F 90° TO 14 F 90° DROP DOWN" → Add `family:downstem` or `family:adapter`
3. "GRUNGE OFF GLASS CLEANER" → Add `family:cleaning-supply`
4. "CUSTOM MATCHES" → Add `family:accessory`

Silicone products needing family updates:
- Silicone nectar straws → Change from `family:flower-bowl` to `family:nectar-collector`
- Silicone bubblers → Ensure `family:bubbler` (some have `family:flower-bowl`)

### Step 3: Delete Duplicate Collections

Collections to delete:
- `dab_rig` (keep `dab-rigs`)
- `hand_pipe` (keep `hand-pipes`)
- `quartz_banger` (keep `quartz-bangers`)
- `dab-rigs-and-oil-rigs` (redundant)
- `hand-pipes-collection` (redundant)

### Step 4: Create New Collections

Priority order:
1. Fix silicone collections first
2. Create `silicone-bubblers`
3. Create `silicone-hand-pipes`
4. Create `novelty-pipes` (animal/character themed)
5. Create `glass-pendants`
6. Create brand collections for Zig Zag, Vibes, Monark

---

## COLLECTION STRUCTURE RECOMMENDATION

```
Smoke & Vape (Main)
├── Bongs & Water Pipes
│   ├── Glass Bongs
│   ├── Silicone Bongs (NEW - needs products)
│   └── Beaker Bongs
├── Dab Rigs
│   ├── Glass Rigs
│   ├── Silicone Rigs
│   └── E-Rigs
├── Hand Pipes
│   ├── Glass Pipes (Spoons)
│   ├── Silicone Pipes (FIX)
│   └── Novelty/Character Pipes (NEW)
├── Bubblers
│   ├── Glass Bubblers
│   └── Silicone Bubblers (NEW)
├── Nectar Collectors
├── One Hitters & Chillums
│
├── Accessories
│   ├── Quartz Bangers
│   ├── Carb Caps
│   ├── Dab Tools
│   ├── Flower Bowls
│   ├── Ash Catchers
│   ├── Torches
│   ├── Grinders
│   └── Downstems & Adapters (NEW)
│
├── Rolling
│   ├── Rolling Papers
│   ├── Cones
│   └── Rolling Accessories
│
├── Brands
│   ├── RAW
│   ├── Zig Zag
│   ├── Vibes
│   ├── Elements
│   ├── Cookies
│   ├── Monark
│   ├── Maven
│   └── Puffco/Lookah/G Pen
│
└── Featured
    ├── Made in USA
    ├── Heady Glass
    ├── Clearance
    └── Glass Pendants (NEW)
```

---

## SUMMARY OF ACTIONS NEEDED

| Priority | Action | Impact |
|----------|--------|--------|
| **CRITICAL** | Fix 3 silicone collection rules | 745 products incorrectly categorized |
| **HIGH** | Create silicone subcollections | Better navigation for silicone products |
| **HIGH** | Fix silicone product family tags | Proper categorization |
| **MEDIUM** | Delete duplicate collections | Cleaner admin, better SEO |
| **MEDIUM** | Create novelty/character pipes collection | Unique selling point |
| **MEDIUM** | Add missing brand collections | Better brand discovery |
| **LOW** | Add joint size collections | Filter convenience |
| **LOW** | Add 4 missing family tags | 100% tag coverage |

---

*Last updated: 2026-01-24*

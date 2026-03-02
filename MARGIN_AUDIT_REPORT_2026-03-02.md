# Shopify Profit Margin Audit Report — What You Need Products

**Date:** 2026-03-02
**Store:** oil-slick-pad.myshopify.com (Oil Slick)
**Vendor:** What You Need / Cloud YHS
**Supplier:** YHS Supply LLC (Azusa, CA)
**Total Products Audited:** 102

> **Important:** This audit was generated from the supplier spreadsheet
> (`yhs_supply_products.xlsx`) and the pricing engine formulas. Retail prices
> shown are the *expected* prices from the formula-based pricing engine.
> You should cross-check these against **actual Shopify retail prices** in your
> admin panel, as AI-based pricing or manual edits may have set different values.

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total products audited | 102 |
| Healthy (margin >= 30%) | 102 |
| **BELOW 30% MARGIN** | **0** |
| Low margin on Shopify cost | 0 |
| Low margin on WYN landed cost | 0 |
| Negative margin | 0 |

**Average margin (Shopify cost):** 54.3%
**Average margin (WYN landed cost):** 76.2%

---

## How Costs Are Calculated

### Step 1: WYN Landed Cost (from supplier)
This is the price YHS Supply charges, including USPS shipping to the CA warehouse.

### Step 2: Shopify Cost (pricing engine tier multiplier)
The WYN price is multiplied by a tier-based factor to account for overhead,
platform fees, handling, and shipping to customer:

| WYN Landed Price Range | Multiplier | Rationale |
|----------------------|------------|-----------|
| $0.50 - $4.00 | 2.5x | Small items need higher markup to cover fixed costs |
| $4.01 - $20.00 | 2.0x | Mid-range items, standard overhead |
| $20.01 - $40.00 | 1.8x | Higher-value items absorb fixed costs better |
| $40.01 - $100.00 | 1.6x | Premium items, lower relative overhead |
| $100.01 - $200.00 | 1.5x | High-value items |
| $200.01+ | 1.4x | Very high-value items |

### Step 3: Retail Price (formula-based)
The Shopify cost is then marked up for retail using this formula:

| Shopify Cost Range | Retail Markup | Psychological Pricing |
|-------------------|--------------|----------------------|
| $0 - $5 | 3.0x | Round up to .99 |
| $5.01 - $15 | 2.5x | Round to nearest $5, minus $0.01 |
| $15.01 - $40 | 2.0x | Round to nearest $5, minus $0.01 |
| $40.01 - $100 | 1.8x | Round to nearest $10, minus $0.05 |
| $100.01+ | 1.6x | Round to nearest $10 |

### Margin Formula
```
Margin % = (Retail Price - Cost) / Retail Price × 100
```
A 30% margin means cost is 70% of retail (i.e., retail = cost / 0.70).

---

## WARNING: Products Most at Risk of Falling Below 30%

While all products pass the 30% threshold using formula pricing, the
following have the **lowest margins** and are most vulnerable if actual
Shopify retail prices were set lower (via AI pricing or manual edits).

**These are the products you should verify FIRST in Shopify Admin.**

| # | Product | SKU | WYN Cost | Shopify Cost | Formula Retail | Margin | Min Retail for 30% | Cushion |
|---|---------|-----|----------|-------------|---------------|--------|-------------------|---------|
| 1 | 10.4'' Tom cat water pipe | H527 | $24.50 | $44.10 | $79.95 | 44.8% | $63.00 | $16.95 |
| 2 | 11'' Players competing water pipe | H560 | $27.00 | $48.60 | $89.95 | 46.0% | $69.43 | $20.52 |
| 3 | 11'' Octopus Marge water pipe | H507 | $23.90 | $43.02 | $79.95 | 46.2% | $61.46 | $18.49 |
| 4 | 9.8'' Gorilla water pipe | H471 | $23.90 | $43.02 | $79.95 | 46.2% | $61.46 | $18.49 |
| 5 | 10.9'' Steel Claw Homer water pipe | H506 | $23.60 | $42.48 | $79.95 | 46.9% | $60.69 | $19.26 |
| 6 | 10.5'' Minnie mouse water pipe | H492-A | $23.60 | $42.48 | $79.95 | 46.9% | $60.69 | $19.26 |
| 7 | 9.4'' Shorthair cat water pipe | H609 | $23.50 | $42.30 | $79.95 | 47.1% | $60.43 | $19.52 |
| 8 | Mixed hand pipes 18pcs/display | H462 | $34.80 | $62.64 | $120.00 | 47.8% | $89.49 | $30.51 |
| 9 | 11.2'' Scooby-Doo water pipe | H601 | $23.10 | $41.58 | $79.95 | 48.0% | $59.40 | $20.55 |
| 10 | 8.8'' Cat water pipe with printing | H497P | $23.10 | $41.58 | $79.95 | 48.0% | $59.40 | $20.55 |
| 11 | 7.5'' pvc divination hand water pipe wit | CY019-E | $28.80 | $51.84 | $99.95 | 48.1% | $74.06 | $25.89 |
| 12 | 9.4'' Siamese cat water pipe | H608 | $23.00 | $41.40 | $79.95 | 48.2% | $59.14 | $20.81 |
| 13 | 11.8'' Penalty referee water pipe | H553 | $23.00 | $41.40 | $79.95 | 48.2% | $59.14 | $20.81 |
| 14 | 8.7'' Beaver water pipe | H466 | $22.90 | $41.22 | $79.95 | 48.4% | $58.89 | $21.06 |
| 15 | 9'' Baseball man water pipe | CY013 | $25.50 | $45.90 | $89.95 | 49.0% | $65.57 | $24.38 |
| 16 | 10.4'' Soccer shoes water pipe | H592 | $22.40 | $40.32 | $79.95 | 49.6% | $57.60 | $22.35 |
| 17 | 8.8'' Tabby cat water pipe | H497 | $22.40 | $40.32 | $79.95 | 49.6% | $57.60 | $22.35 |
| 18 | 8.8'' Black tabby cat water pipe | H497-A | $22.40 | $40.32 | $79.95 | 49.6% | $57.60 | $22.35 |
| 19 | 12'' Yoda water pipe | H353 | $22.40 | $40.32 | $79.95 | 49.6% | $57.60 | $22.35 |
| 20 | 9'' Lion water pipe | H473 | $22.30 | $40.14 | $79.95 | 49.8% | $57.34 | $22.61 |

> **Cushion** = how much the retail price can drop before hitting 30% margin.
> If the actual Shopify retail is lower than `Formula Retail - Cushion`, that product is below 30%.

### What to Check for Each At-Risk Product

For each product above, open it in Shopify Admin and verify:

1. **Retail price** — is it the same as the formula retail shown above?
   - If lower, the margin may be below 30%.
   - If the retail is below the `Min Retail for 30%` column, it IS below 30%.
2. **Cost per item** (in variant details) — does it match the Shopify Cost shown?
   - If the cost was never set, Shopify reports $0 and margin tracking is broken.
3. **Compare price** — does the product have a compare-at price that's confusing the issue?

---

## CRITICAL: Products Below 30% Margin (Formula Pricing)

**Based on formula pricing, all 102 products meet the 30% margin target.**

However, this does NOT guarantee the live Shopify prices match. The AI-based
pricing engine (Gemini 2.0 Flash) or manual edits may have set different retail
prices. **Check the At-Risk products above in your Shopify Admin.**

## Healthy Products (Margin >= 30%)

102 products meet or exceed the 30% margin target.

| # | Product | SKU | Type | WYN Cost | Shopify Cost | Retail | Margin | Gross Profit |
|---|---------|-----|------|----------|-------------|--------|--------|-------------|
| 1 | 10.4'' Tom cat water pipe | H527 | Water Pipe / Bong | $24.50 | $44.10 | $79.95 | 44.8% | $35.85 |
| 2 | 11'' Players competing water pipe | H560 | Water Pipe / Bong | $27.00 | $48.60 | $89.95 | 46.0% | $41.35 |
| 3 | 11'' Octopus Marge water pipe | H507 | Water Pipe / Bong | $23.90 | $43.02 | $79.95 | 46.2% | $36.93 |
| 4 | 9.8'' Gorilla water pipe | H471 | Water Pipe / Bong | $23.90 | $43.02 | $79.95 | 46.2% | $36.93 |
| 5 | 10.9'' Steel Claw Homer water pipe | H506 | Water Pipe / Bong | $23.60 | $42.48 | $79.95 | 46.9% | $37.47 |
| 6 | 10.5'' Minnie mouse water pipe | H492-A | Water Pipe / Bong | $23.60 | $42.48 | $79.95 | 46.9% | $37.47 |
| 7 | 9.4'' Shorthair cat water pipe | H609 | Water Pipe / Bong | $23.50 | $42.30 | $79.95 | 47.1% | $37.65 |
| 8 | Mixed hand pipes 18pcs/display | H462 | Hand Pipe | $34.80 | $62.64 | $120.00 | 47.8% | $57.36 |
| 9 | 11.2'' Scooby-Doo water pipe | H601 | Water Pipe / Bong | $23.10 | $41.58 | $79.95 | 48.0% | $38.37 |
| 10 | 8.8'' Cat water pipe with printing | H497P | Water Pipe / Bong | $23.10 | $41.58 | $79.95 | 48.0% | $38.37 |
| 11 | 7.5'' pvc divination hand water pipe wit | CY019-E | Water Pipe / Bong | $28.80 | $51.84 | $99.95 | 48.1% | $48.11 |
| 12 | 9.4'' Siamese cat water pipe | H608 | Water Pipe / Bong | $23.00 | $41.40 | $79.95 | 48.2% | $38.55 |
| 13 | 11.8'' Penalty referee water pipe | H553 | Water Pipe / Bong | $23.00 | $41.40 | $79.95 | 48.2% | $38.55 |
| 14 | 8.7'' Beaver water pipe | H466 | Water Pipe / Bong | $22.90 | $41.22 | $79.95 | 48.4% | $38.73 |
| 15 | 9'' Baseball man water pipe | CY013 | Water Pipe / Bong | $25.50 | $45.90 | $89.95 | 49.0% | $44.05 |
| 16 | 10.4'' Soccer shoes water pipe | H592 | Water Pipe / Bong | $22.40 | $40.32 | $79.95 | 49.6% | $39.63 |
| 17 | 8.8'' Tabby cat water pipe | H497 | Water Pipe / Bong | $22.40 | $40.32 | $79.95 | 49.6% | $39.63 |
| 18 | 8.8'' Black tabby cat water pipe | H497-A | Water Pipe / Bong | $22.40 | $40.32 | $79.95 | 49.6% | $39.63 |
| 19 | 12'' Yoda water pipe | H353 | Water Pipe / Bong | $22.40 | $40.32 | $79.95 | 49.6% | $39.63 |
| 20 | 9'' Lion water pipe | H473 | Water Pipe / Bong | $22.30 | $40.14 | $79.95 | 49.8% | $39.81 |
| 21 | 9.2'' Zombie mario water pipe | H532 | Water Pipe / Bong | $17.50 | $35.00 | $69.95 | 50.0% | $34.95 |
| 22 | 8.8'' Corpse flower water pipe | H564 | Water Pipe / Bong | $20.00 | $40.00 | $79.95 | 50.0% | $39.95 |
| 23 | 7.29'' Lollipop mummy water pipe | H535 | Water Pipe / Bong | $20.00 | $40.00 | $79.95 | 50.0% | $39.95 |
| 24 | 11.4'' Lionel Messi water pipe | H570 | Water Pipe / Bong | $22.20 | $39.96 | $79.95 | 50.0% | $39.99 |
| 25 | 8.6'' Bulldog water pipe | H475 | Water Pipe / Bong | $22.20 | $39.96 | $79.95 | 50.0% | $39.99 |
| 26 | 8.6'' Black Bulldog water pipe | H475-A | Water Pipe / Bong | $22.20 | $39.96 | $79.95 | 50.0% | $39.99 |
| 27 | 11.5'' pvc backpack rabbit | H425 | Other | $22.20 | $39.96 | $79.95 | 50.0% | $39.99 |
| 28 | 4.9'' Tongue-sticking bear water pipe | H451 | Water Pipe / Bong | $8.70 | $17.40 | $34.99 | 50.3% | $17.59 |
| 29 | 9.2'' Husky water pipe | H602 | Water Pipe / Bong | $22.00 | $39.60 | $79.95 | 50.5% | $40.35 |
| 30 | 10.2'' Golden gate water pipe | H596 | Water Pipe / Bong | $19.80 | $39.60 | $79.95 | 50.5% | $40.35 |
| 31 | 10.4'' Soccer party water pipe | H593 | Water Pipe / Bong | $22.00 | $39.60 | $79.95 | 50.5% | $40.35 |
| 32 | 10.3'' Gastly water pipe | H496 | Water Pipe / Bong | $22.00 | $39.60 | $79.95 | 50.5% | $40.35 |
| 33 | 8.9'' Banana water pipe | H463 | Water Pipe / Bong | $17.30 | $34.60 | $69.95 | 50.5% | $35.35 |
| 34 | 10.5'' The Hand of Fear water pipe | H522 | Water Pipe / Bong | $19.70 | $39.40 | $79.95 | 50.7% | $40.55 |
| 35 | Turkey water pipe | H248 | Water Pipe / Bong | $9.80 | $19.60 | $39.99 | 51.0% | $20.39 |
| 36 | 5.8'' pvc skull water pipe | H388 | Water Pipe / Bong | $17.10 | $34.20 | $69.95 | 51.1% | $35.75 |
| 37 | 10.4'' Maple leaf soccer water pipe | H597 | Water Pipe / Bong | $21.70 | $39.06 | $79.95 | 51.1% | $40.89 |
| 38 | 7.5'' beaker water pipe | H4P | Water Pipe / Bong | $9.70 | $19.40 | $39.99 | 51.5% | $20.59 |
| 39 | 6.1'' Small size Labubu water pipe (Flan | H543-A | Water Pipe / Bong | $10.90 | $21.80 | $44.99 | 51.5% | $23.19 |
| 40 | 10.6'' Zombie shark water pipe | H577 | Water Pipe / Bong | $21.50 | $38.70 | $79.95 | 51.6% | $41.25 |
| 41 | 11'' Artistic couple water pipe | H557 | Water Pipe / Bong | $21.50 | $38.70 | $79.95 | 51.6% | $41.25 |
| 42 | 8'' Sunglasses duck water pipe | H562 | Water Pipe / Bong | $19.20 | $38.40 | $79.95 | 52.0% | $41.55 |
| 43 | Zombie pug water pipe | H381 | Water Pipe / Bong | $10.80 | $21.60 | $44.99 | 52.0% | $23.39 |
| 44 | 8.8'' Cake man water pipe | H621 | Water Pipe / Bong | $21.30 | $38.34 | $79.95 | 52.0% | $41.61 |
| 45 | Freeze cooling cup bubbler | H95 | Bubbler | $14.30 | $28.60 | $59.95 | 52.3% | $31.35 |
| 46 | Dab tools mixed 10pcs/jar | B033 | Dab Tools | $14.30 | $28.60 | $59.95 | 52.3% | $31.35 |
| 47 | Roach clips mixed 15pcs/set | B002 | Roach Clips | $11.90 | $23.80 | $49.99 | 52.4% | $26.19 |
| 48 | 8.6'' Mutated eggplant water pipe | H622 | Water Pipe / Bong | $18.90 | $37.80 | $79.95 | 52.7% | $42.15 |
| 49 | 6.8'' Penguin Modi water pipe | H559 | Water Pipe / Bong | $11.80 | $23.60 | $49.99 | 52.8% | $26.39 |
| 50 | 6.6'' Penguin Rick water pipe | H558 | Water Pipe / Bong | $11.80 | $23.60 | $49.99 | 52.8% | $26.39 |
| 51 | 10.4'' Dolphin water pipe | H575 | Water Pipe / Bong | $20.90 | $37.62 | $79.95 | 53.0% | $42.33 |
| 52 | 9.6'' Alien Spider-Man water pipe | H519 | Water Pipe / Bong | $20.90 | $37.62 | $79.95 | 53.0% | $42.33 |
| 53 | Kuromi water pipe | H371 | Water Pipe / Bong | $11.70 | $23.40 | $49.99 | 53.2% | $26.59 |
| 54 | 6.1'' Peter docter water pipe | H512 | Water Pipe / Bong | $10.40 | $20.80 | $44.99 | 53.8% | $24.19 |
| 55 | 6.6'' Little fox water pipe | H485 | Water Pipe / Bong | $10.40 | $20.80 | $44.99 | 53.8% | $24.19 |
| 56 | 7.5'' beaker water pipe | H4 | Water Pipe / Bong | $9.20 | $18.40 | $39.99 | 54.0% | $21.59 |
| 57 | Radio water pipe | H452 | Water Pipe / Bong | $10.30 | $20.60 | $44.99 | 54.2% | $24.39 |
| 58 | Three eyes guy | H254 | Other | $10.30 | $20.60 | $44.99 | 54.2% | $24.39 |
| 59 | 11.8'' Individual foul referee water pip | H552 | Water Pipe / Bong | $20.20 | $36.36 | $79.95 | 54.5% | $43.59 |
| 60 | 9.2'' Headless knight water pipe | H536 | Water Pipe / Bong | $20.10 | $36.18 | $79.95 | 54.8% | $43.77 |
| 61 | 6.5'' Kenny water pipe | H484 | Water Pipe / Bong | $11.30 | $22.60 | $49.99 | 54.8% | $27.39 |
| 62 | Geometric Ashtray | A3 | Ashtray | $7.90 | $15.80 | $34.99 | 54.8% | $19.19 |
| 63 | 8.9'' Zombie witch water pipe | H528 | Water Pipe / Bong | $18.00 | $36.00 | $79.95 | 55.0% | $43.95 |
| 64 | 6.6'' Silicone pumpkin wizard hat water  | H445 | Water Pipe / Bong | $9.00 | $18.00 | $39.99 | 55.0% | $21.99 |
| 65 | Mechanical alien water pipe | CY015 | Water Pipe / Bong | $17.90 | $35.80 | $79.95 | 55.2% | $44.15 |
| 66 | 8.2'' Pink dress female mouse water pipe | H617 | Water Pipe / Bong | $17.80 | $35.60 | $79.95 | 55.5% | $44.35 |
| 67 | Waterwheel water pipe | H194 | Water Pipe / Bong | $13.30 | $26.60 | $59.95 | 55.6% | $33.35 |
| 68 | Expression cactus water pipe | H321 | Water Pipe / Bong | $8.80 | $17.60 | $39.99 | 56.0% | $22.39 |
| 69 | Santa clus internal CBD battery device | E23 | Battery / Vape Device | $7.70 | $15.40 | $34.99 | 56.0% | $19.59 |
| 70 | Monster internal CBD battery device | E9 | Battery / Vape Device | $7.70 | $15.40 | $34.99 | 56.0% | $19.59 |
| 71 | Alien internal CBD battery device | E8 | Battery / Vape Device | $7.70 | $15.40 | $34.99 | 56.0% | $19.59 |
| 72 | Yoda internal CBD battery device | E7 | Battery / Vape Device | $7.70 | $15.40 | $34.99 | 56.0% | $19.59 |
| 73 | UFO water pipe | H154 | Water Pipe / Bong | $12.60 | $25.20 | $59.95 | 58.0% | $34.75 |
| 74 | Puppet bear hand pipe | H455 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 75 | The boy hand pipe | H454 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 76 | Spotted monster hand pipe | H453 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 77 | Skull hand pipe | H439 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 78 | The Gingerbread Man hand pipe | H438 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 79 | Smiley Ghost hand pipe | H436 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 80 | Eye hand pipe | H434 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 81 | Shark hand pipe | H401 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 82 | Cat paw hand pipe | H400 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 83 | Naked lady hand pipe | H308 | Hand Pipe | $6.00 | $12.00 | $29.99 | 60.0% | $17.99 |
| 84 | Rick glass hand pipe | H468B | Hand Pipe | $6.90 | $13.80 | $34.99 | 60.6% | $21.19 |
| 85 | Yoda glass hand pipe | H468C | Hand Pipe | $6.90 | $13.80 | $34.99 | 60.6% | $21.19 |
| 86 | Barbarian hand pipe | H440 | Hand Pipe | $5.90 | $11.80 | $29.99 | 60.6% | $18.19 |
| 87 | Kuromi hand pipe | H378 | Hand Pipe | $6.80 | $13.60 | $34.99 | 61.1% | $21.39 |
| 88 | Kitty big hand pipe | H377 | Hand Pipe | $6.80 | $13.60 | $34.99 | 61.1% | $21.39 |
| 89 | Big 9 holes glass bowl | P001 | Glass Bowl | $5.80 | $11.60 | $29.99 | 61.3% | $18.39 |
| 90 | Sonic glass hand pipe | H468A | Hand Pipe | $6.70 | $13.40 | $34.99 | 61.7% | $21.59 |
| 91 | Small 9 holes glass bowl | P002 | Glass Bowl | $5.70 | $11.40 | $29.99 | 62.0% | $18.59 |
| 92 | Screaming chicken pipe | H240 | Other | $6.60 | $13.20 | $34.99 | 62.3% | $21.79 |
| 93 | 6.6'' nectar collector | H129 | Nectar Collector | $7.50 | $15.00 | $39.99 | 62.5% | $24.99 |
| 94 | Cucumber glass pipe | WS158 | Hand Pipe | $7.50 | $15.00 | $39.99 | 62.5% | $24.99 |
| 95 | Mushroom glass pipe | WS155 | Hand Pipe | $7.50 | $15.00 | $39.99 | 62.5% | $24.99 |
| 96 | Pea glass pipe | WS156 | Hand Pipe | $7.50 | $15.00 | $39.99 | 62.5% | $24.99 |
| 97 | 7.1'' Sadness water pipe | H511 | Water Pipe / Bong | $7.40 | $14.80 | $39.99 | 63.0% | $25.19 |
| 98 | 6.5'' Plastic nectar collector (steel na | H435-2 | Nectar Collector | $7.40 | $14.80 | $39.99 | 63.0% | $25.19 |
| 99 | 180ml flower jar | J1P | Jar / Container | $7.40 | $14.80 | $39.99 | 63.0% | $25.19 |
| 100 | Hot dog straight tube glass pipe | H538A | Hand Pipe | $6.40 | $12.80 | $34.99 | 63.4% | $22.19 |
| 101 | Purple mushroom straight tube glass pipe | H538B | Hand Pipe | $6.40 | $12.80 | $34.99 | 63.4% | $22.19 |
| 102 | Mario glass hand pipes | H363 | Hand Pipe | $7.20 | $14.40 | $39.99 | 64.0% | $25.59 |

---

## Margin Distribution

| Margin Range | Count | Products |
|-------------|-------|----------|
| Negative (< 0%) | 0 |  |
| Critical (0-15%) | 0 |  |
| Low (15-30%) | 0 |  |
| Target (30-40%) | 0 |  |
| Good (40-50%) | 23 | CY013, CY019-E, H609, H608, H601, ... (+18 more) |
| Strong (50%+) | 79 | CY015, H622, H621, H617, H602, ... (+74 more) |

---

## Margin by Product Type

| Product Type | Count | Avg Margin | Min Margin | Max Margin | Avg WYN Cost | Avg Retail |
|-------------|-------|-----------|-----------|-----------|-------------|-----------|
| Ashtray | 1 | 54.8% | 54.8% | 54.8% | $7.90 | $34.99 |
| Battery / Vape Device | 4 | 56.0% | 56.0% | 56.0% | $7.70 | $34.99 |
| Bubbler | 1 | 52.3% | 52.3% | 52.3% | $14.30 | $59.95 |
| Dab Tools | 1 | 52.3% | 52.3% | 52.3% | $14.30 | $59.95 |
| Glass Bowl | 2 | 61.7% | 61.3% | 62.0% | $5.75 | $29.99 |
| Hand Pipe | 23 | 60.5% | 47.8% | 64.0% | $7.71 | $37.16 |
| Jar / Container | 1 | 63.0% | 63.0% | 63.0% | $7.40 | $39.99 |
| Nectar Collector | 2 | 62.7% | 62.5% | 63.0% | $7.45 | $39.99 |
| Other | 3 | 55.5% | 50.0% | 62.3% | $13.03 | $53.31 |
| Roach Clips | 1 | 52.4% | 52.4% | 52.4% | $11.90 | $49.99 |
| Water Pipe / Bong | 63 | 51.3% | 44.8% | 63.0% | $18.46 | $70.28 |

---

## Action Items / Next Steps

### Immediate (Do Now)

1. No low-margin products identified from the formula pricing. However, **manually check Shopify** to ensure actual retail prices match these estimates.

### Short-Term

4. **Re-run this audit with live API data** — from a local machine with Shopify API access, run:
   ```bash
   # Set up .env with your credentials
   cp .env.example .env
   # Edit .env with your SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN
   npm install
   node src/margin-audit.js
   ```
5. **Sync costs from spreadsheet to Shopify** (if costs are wrong):
   ```bash
   npm run costs           # Dry run — see what would change
   npm run costs:execute   # Apply changes
   ```

### Ongoing

6. **Request updated pricing** from YHS Supply (Flora) periodically, as landed costs may change.
7. **Re-audit after any price changes** to ensure margins stay above 30%.

---
*Report generated by margin_audit.py on 2026-03-02*
*Data source: yhs_supply_products.xlsx (102 products)*
*Pricing engine: src/pricing-engine.js (tiered cost multipliers + formula retail)*
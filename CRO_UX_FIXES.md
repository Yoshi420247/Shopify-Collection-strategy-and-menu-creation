# CRO/UX Fixes - Critical Issues Resolved

**Store:** Oil Slick (oil-slick-pad.myshopify.com)
**Date:** 2026-01-25
**Theme ID:** 140853018904

---

## Issues Fixed

### 1. Mega Menu Placeholder Text (CRITICAL)

**Problem:** Theme instruction placeholder text "Add description, images, menus and links to your mega menu..." was visible on the site.

**Solution:** Cleared all empty blocks from the mega-menu-1 section. The section now has `blocks: {}` and `block_order: []`, which prevents the placeholder template from rendering.

**Files Changed:** `config/settings_data.json`

---

### 2. Subscription/Payment Terms Language on PDPs

**Problem:** "Recurring or deferred purchase" text was appearing on product pages from Shop Pay installments feature.

**Solution:** Added CSS to hide payment terms elements while keeping the dynamic checkout buttons functional.

**CSS Added to `assets/filter-enhancements.css`:**
```css
.shopify-payment-button__more-options,
.shopify-payment-button__button--unbranded[aria-describedby*="payment"],
[class*="payment-terms"],
.payment-terms,
.product-form__payment-terms,
.shopify-payment-terms,
form[data-payment-form] .payment-terms__text {
  display: none !important;
}
```

---

### 3. Internal Tags Leaking in Collection Sidebar

**Problem:** Internal tags `google` (26 products) and `MCF` (13 products) were appearing in the collection tag filters, exposing backend metadata to customers.

**Solution:** Removed the `google` and `MCF` tags from all 35 affected products via GraphQL mutations.

**API Used:** `productUpdate` mutation to update tags array, excluding internal tags

**Products Cleaned:** 35 total

---

### 4. Blog Listing "Subheading" Placeholder

**Problem:** The blog template and contact template were displaying the placeholder text "Subheading" where a subtitle should be.

**Solution:** Updated theme settings to explicitly set empty subtitle values for both templates:
- `sections.blog-template.settings.subtitle: ""`
- `sections.contact-template.settings.subtitle: ""`

**Files Changed:** `config/settings_data.json`

---

### 5. Empty Filtered Collection Dead Ends

**Problem:** When filters returned no products, visitors saw a minimal message with no way to recover or continue browsing.

**Solution:** Enhanced the collection template's empty state with:
- A clearer "No products found" heading
- Helpful guidance text
- "Clear All Filters" button linking to the unfiltered collection
- "Browse All Products" button linking to /collections/all

**Files Changed:**
- `sections/collection-template.liquid` - Added enhanced empty state HTML
- `assets/filter-enhancements.css` - Added styling for empty state

**New Empty State Features:**
```html
<div class="empty-collection-message">
  <h3>No products found in this collection</h3>
  <p>Try adjusting your filters or browse all products in this collection.</p>
  <div class="empty-collection-actions">
    <a href="{{ collection.url }}" class="action_button">Clear All Filters</a>
    <a href="/collections/all" class="action_button secondary">Browse All Products</a>
  </div>
</div>
```

---

## Summary of Changes

| Issue | Type | Fix Method |
|-------|------|------------|
| Mega menu placeholder | Theme Settings | Cleared empty blocks |
| Payment terms text | CSS | Hide elements |
| Internal tags | Product Data | Bulk tag removal |
| Subheading placeholder | Theme Settings | Set empty values |
| Empty filter state | Template + CSS | Enhanced HTML/CSS |

---

## Verification

To verify these fixes:

1. **Mega Menu:** Navigate to any page with the header - no placeholder text should appear
2. **Payment Terms:** Visit any product page - no "recurring/deferred" text should appear near Add to Cart
3. **Internal Tags:** Visit a collection with sidebar filters - "google" and "MCF" should not appear as filter options
4. **Subheading:** Visit `/blogs/news` and `/pages/contact-us` - no "Subheading" text
5. **Empty Filters:** Apply filters that return no products - should see helpful recovery options

---

## Phase 2 Fixes (Presentation & Navigation)

### 6. Duplicate "Scale Sale!" Promo Text

**Problem:** Header promo bar showed "Scale Sale!" twice, looking cluttered and unprofessional.

**Before:**
```html
<p><a href="...">Scale Sale!</a> add a scale to your order $10 <a href="...">Scale Sale!</a></p>
```

**After:**
```html
<p><strong>Scale Sale!</strong> Add a digital scale to any order for just $10 → <a href="/collections/accessories">Shop Now</a></p>
```

**Files Changed:** `config/settings_data.json` (header.settings.promo_text)

---

### 7. Variant Pricing Sticker Shock

**Problem:** Products with wide variant ranges showed expensive bulk options as the default, causing sticker shock (e.g., $845 instead of $75 entry-level option).

**Solution:** Reordered variants on affected products so cheapest options appear first.

**Products Fixed:**
| Product | Before (First Variant) | After (First Variant) |
|---------|----------------------|----------------------|
| Blank Boxes for Jars | $845 (1000 units) | $75 (50 units) |
| Oil Slick Large Acrylic Jar | $79 (case of 75) | $29 (case of 22) |
| Hammer | $55 (with banger) | $35 (without banger) |

**API Used:** `PUT /variants/{id}.json` with position updates

---

### 8. Collection Filter Taxonomy Cleanup

**Problem:** Collection filters showed irrelevant product types across all collections (e.g., "Spoon pipe" showing in Concentrate Jars collection).

**Solution:** Updated filter tag lists to be more universally applicable:

**Before:**
- Sort by Type: `Bong, Dab Rig, spoon, nectar collector, Electronic, Ashtray, Banger, rolling tray`
- Sort by Use: `Dabbing, rectangular`

**After:**
- Product Type: `Bong, Dab Rig, Hand Pipe, Nectar Collector, Banger, Jars, Containers, Accessories`
- Use: `Dabbing, Smoking, Storage, Packaging`

**Files Changed:** `config/settings_data.json` (collection-template.blocks)

---

### 9. Homepage Hero Messaging Update

**Problem:** Hero headline "Welcome to Oil Slick" wasn't specific enough for cold traffic to understand the value proposition.

**Solution:** Updated hero content to immediately clarify offerings:

**Before:**
- Pretext: "Welcome to"
- Title: "Oil Slick"
- Subtitle: (empty)
- Button 1: "Extraction & Packaging"
- Button 2: "Smoke & Vape"

**After:**
- Pretext: "Lab-Grade Nonstick & Packaging"
- Title: "Oil Slick"
- Subtitle: "Plus curated glass pipes, rigs & accessories"
- Button 1: "Shop Packaging & Lab"
- Button 2: "Shop Smokeshop Gear"

**Files Changed:** `config/settings_data.json` (section 1489283389016)

---

## Complete Summary

| Phase | Issue | Fix Method |
|-------|-------|------------|
| 1 | Mega menu placeholder | Cleared empty blocks |
| 1 | Payment terms text | CSS hide |
| 1 | Internal tags (google/MCF) | Bulk tag removal |
| 1 | Subheading placeholder | Set empty values |
| 1 | Empty filter dead ends | Enhanced HTML/CSS |
| 2 | Duplicate promo text | Clean promo HTML |
| 2 | Variant sticker shock | Reorder variants |
| 2 | Filter taxonomy | Update filter tags |
| 2 | Homepage hero | Update messaging |

---

## Remaining Recommendations (Manual)

These items require admin access or policy decisions:

1. **Shop Pay Installments** - Disable in Shopify Payments settings if "recurring/deferred" text persists
2. **Search & Discovery Filters** - Consider migrating from tag-based to metafield-based filters for more granular control per collection
3. **Navigation Restructure** - Consider renaming "Smoke & Vape" to "Smokeshop Gear" and splitting by use (Dabs, Flower, Travel)

---

*All fixes applied directly via Shopify Admin API and GraphQL*

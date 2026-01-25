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

*All fixes applied directly via Shopify Admin API and GraphQL*

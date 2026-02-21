# Shopify Store Management - LLM Handoff Document

This document describes the tools, APIs, and methodologies for programmatically managing a Shopify store. Use this as a reference to make edits and improvements to any Shopify store.

---

## Table of Contents
1. [Authentication](#authentication)
2. [API Overview](#api-overview)
3. [Theme Settings Management](#theme-settings-management)
4. [Collection Management](#collection-management)
5. [Menu/Navigation Management](#menunavigation-management)
6. [File/Image Management](#fileimage-management)
7. [Page Management](#page-management)
8. [Product Management](#product-management)
9. [Shipping/Delivery Management](#shippingdelivery-management)
10. [Common Patterns & Gotchas](#common-patterns--gotchas)

---

## Authentication

### Required Credentials
```
Store URL: {store-name}.myshopify.com
Access Token: shpat_xxxxxxxxxxxxx (Admin API access token)
API Version: 2024-01 (or latest stable)
```

### Headers for All Requests
```bash
-H "X-Shopify-Access-Token: {access_token}"
-H "Content-Type: application/json"
```

---

## API Overview

Shopify provides two APIs:

| API | Use Case | Base URL |
|-----|----------|----------|
| **REST API** | CRUD operations on resources (products, collections, pages, etc.) | `https://{store}.myshopify.com/admin/api/2024-01/` |
| **GraphQL API** | Complex queries, mutations, bulk operations | `https://{store}.myshopify.com/admin/api/2024-01/graphql.json` |

**When to use which:**
- REST: Simple CRUD, updating single resources
- GraphQL: Querying multiple resources, complex mutations (menus, files, delivery profiles)

---

## Theme Settings Management

Theme settings control homepage sections, colors, and layout. Settings are stored in `config/settings_data.json`.

### Get Theme ID
```bash
curl -s -X GET "https://{store}.myshopify.com/admin/api/2024-01/themes.json" \
  -H "X-Shopify-Access-Token: {token}" \
  | jq '.themes[] | select(.role == "main") | .id'
```

### Download Current Theme Settings
```bash
curl -s -X GET "https://{store}.myshopify.com/admin/api/2024-01/themes/{theme_id}/assets.json?asset%5Bkey%5D=config/settings_data.json" \
  -H "X-Shopify-Access-Token: {token}" \
  | jq -r '.asset.value' > settings.json
```

### Update Theme Settings
```bash
# 1. Modify the JSON file
# 2. Create payload with escaped JSON value
# 3. PUT to update

curl -s -X PUT "https://{store}.myshopify.com/admin/api/2024-01/themes/{theme_id}/assets.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "key": "config/settings_data.json",
      "value": "{escaped JSON string}"
    }
  }'
```

**Python helper for proper JSON escaping:**
```python
import json

with open('settings.json', 'r') as f:
    settings = json.load(f)

# Modify settings
settings['current']['thumbnail_hover_enabled'] = False

# Create payload
payload = {
    "asset": {
        "key": "config/settings_data.json",
        "value": json.dumps(settings)
    }
}

with open('payload.json', 'w') as f:
    json.dump(payload, f)
```

### Theme Settings Structure
```json
{
  "current": {
    "thumbnail_hover_enabled": true,
    "collection_secondary_image": false,
    "sections": {
      "section_id": {
        "type": "featured-collection",
        "settings": {
          "collection": "collection-handle",
          "title": "Section Title"
        },
        "blocks": {
          "block_id": {
            "type": "block_type",
            "settings": { }
          }
        },
        "block_order": ["block_id_1", "block_id_2"]
      }
    }
  }
}
```

### Common Section Types
- `featured-collection` - Product grid from a collection
- `featured-promotions` - Promotional image blocks
- `collection-list` - Grid of collection links
- `image-text` - Image with text blocks
- `image-with-text-overlay` - Banner with overlay text
- `testimonial` - Customer testimonials
- `newsletter` - Email signup

### Image References in Theme Settings
Use format: `shopify://shop_images/{filename}`
```json
{
  "image": "shopify://shop_images/my-image.png"
}
```

---

## Collection Management

### List All Collections (REST)
```bash
# Smart Collections (rule-based)
curl -s -X GET "https://{store}.myshopify.com/admin/api/2024-01/smart_collections.json?limit=250" \
  -H "X-Shopify-Access-Token: {token}"

# Custom Collections (manual)
curl -s -X GET "https://{store}.myshopify.com/admin/api/2024-01/custom_collections.json?limit=250" \
  -H "X-Shopify-Access-Token: {token}"
```

### Get Collection with Product Count (GraphQL)
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ collectionByHandle(handle: \"collection-handle\") { id title productsCount { count } products(first: 10) { edges { node { title priceRangeV2 { minVariantPrice { amount } } } } } } }"
  }'
```

### Create Smart Collection
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/smart_collections.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "smart_collection": {
      "title": "Collection Title",
      "body_html": "<p>Description for SEO</p>",
      "rules": [
        {"column": "tag", "relation": "equals", "condition": "family:glass-rig"},
        {"column": "vendor", "relation": "equals", "condition": "Vendor Name"},
        {"column": "variant_price", "relation": "less_than", "condition": "300"}
      ],
      "disjunctive": false,
      "sort_order": "best-selling",
      "published": true
    }
  }'
```

**Rule columns:** `tag`, `title`, `type`, `vendor`, `variant_price`, `variant_compare_at_price`, `variant_weight`, `variant_inventory`, `variant_title`

**Rule relations:** `equals`, `not_equals`, `greater_than`, `less_than`, `starts_with`, `ends_with`, `contains`, `not_contains`

**Sort orders:** `manual`, `best-selling`, `alpha-asc`, `alpha-desc`, `price-desc`, `price-asc`, `created-desc`, `created`

**Disjunctive:** `false` = AND logic, `true` = OR logic

### Update Collection
```bash
curl -s -X PUT "https://{store}.myshopify.com/admin/api/2024-01/smart_collections/{collection_id}.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "smart_collection": {
      "id": {collection_id},
      "title": "New Title",
      "body_html": "<p>New description</p>",
      "image": {
        "src": "https://cdn.shopify.com/...",
        "alt": "Alt text"
      }
    }
  }'
```

### Delete Collection
```bash
curl -s -X DELETE "https://{store}.myshopify.com/admin/api/2024-01/smart_collections/{collection_id}.json" \
  -H "X-Shopify-Access-Token: {token}"
```

---

## Menu/Navigation Management

Menus are managed via **GraphQL only**.

### Get All Menus
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ menus(first: 10) { edges { node { id handle title items { id title url } } } } }"
  }'
```

### Update Menu
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $title, items: $items) { menu { id title } userErrors { field message } } }",
    "variables": {
      "id": "gid://shopify/Menu/123456789",
      "title": "Main Menu",
      "items": [
        {
          "title": "Shop All",
          "url": "/collections/all",
          "type": "HTTP"
        },
        {
          "title": "Dab Rigs",
          "resourceId": "gid://shopify/Collection/123456789",
          "type": "COLLECTION"
        }
      ]
    }
  }'
```

**Menu item types:**
- `HTTP` - External/custom URL (use `url` field)
- `COLLECTION` - Link to collection (use `resourceId`)
- `PRODUCT` - Link to product (use `resourceId`)
- `PAGE` - Link to page (use `resourceId`)
- `BLOG` - Link to blog (use `resourceId`)

---

## File/Image Management

### Upload Image to Shopify Files (GraphQL)
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation fileCreate($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id alt ... on MediaImage { image { url } } } userErrors { field message } } }",
    "variables": {
      "files": [
        {
          "alt": "Image description",
          "contentType": "IMAGE",
          "originalSource": "https://example.com/image.jpg"
        }
      ]
    }
  }'
```

### Get Uploaded Files
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ files(first: 20, sortKey: CREATED_AT, reverse: true) { edges { node { ... on MediaImage { id alt image { url } } } } } }"
  }'
```

**Note:** After uploading, wait 2-3 seconds for processing before querying the URL.

### Using Uploaded Images in Theme
Extract filename from URL and use in theme settings:
```
URL: https://cdn.shopify.com/s/files/1/1234/5678/files/my-image.png?v=123
Theme reference: shopify://shop_images/my-image.png
```

---

## Page Management

### List All Pages
```bash
curl -s -X GET "https://{store}.myshopify.com/admin/api/2024-01/pages.json" \
  -H "X-Shopify-Access-Token: {token}"
```

### Get Single Page
```bash
curl -s -X GET "https://{store}.myshopify.com/admin/api/2024-01/pages/{page_id}.json" \
  -H "X-Shopify-Access-Token: {token}"
```

### Update Page
```bash
curl -s -X PUT "https://{store}.myshopify.com/admin/api/2024-01/pages/{page_id}.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "page": {
      "id": {page_id},
      "title": "Page Title",
      "body_html": "<h1>Content</h1><p>Page content here</p>",
      "published": true
    }
  }'
```

### Unpublish Page
```bash
curl -s -X PUT "https://{store}.myshopify.com/admin/api/2024-01/pages/{page_id}.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{"page": {"id": {page_id}, "published": false}}'
```

---

## Product Management

### Get Products (GraphQL - better for complex queries)
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ products(first: 50, query: \"vendor:\\\"Vendor Name\\\"\") { edges { node { id title handle tags priceRangeV2 { minVariantPrice { amount } } } } } }"
  }'
```

### Update Product Tags
```bash
curl -s -X PUT "https://{store}.myshopify.com/admin/api/2024-01/products/{product_id}.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "product": {
      "id": {product_id},
      "tags": "tag1, tag2, family:glass-rig, material:glass"
    }
  }'
```

### Get Products in Collection
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ collectionByHandle(handle: \"collection-handle\") { products(first: 50, sortKey: BEST_SELLING) { edges { node { title priceRangeV2 { minVariantPrice { amount } } featuredImage { url } } } } } }"
  }'
```

---

## Shipping/Delivery Management

### Get Delivery Profiles (GraphQL)
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ deliveryProfiles(first: 10) { edges { node { id name profileLocationGroups { locationGroupZones(first: 10) { edges { node { zone { id name } methodDefinitions(first: 20) { edges { node { id name rateProvider { ... on DeliveryRateDefinition { id price { amount } } } } } } } } } } } } } }"
  }'
```

### Delete Shipping Rate
```bash
curl -s -X POST "https://{store}.myshopify.com/admin/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation deliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) { deliveryProfileUpdate(id: $id, profile: $profile) { profile { id } userErrors { field message } } }",
    "variables": {
      "id": "gid://shopify/DeliveryProfile/123456789",
      "profile": {
        "methodDefinitionsToDelete": ["gid://shopify/DeliveryMethodDefinition/987654321"]
      }
    }
  }'
```

---

## Common Patterns & Gotchas

### 1. GraphQL ID Format
GraphQL uses global IDs: `gid://shopify/Collection/123456789`
REST uses numeric IDs: `123456789`

**Extract numeric ID from GraphQL ID:**
```bash
echo "gid://shopify/Collection/123456789" | grep -oE '[0-9]+$'
```

### 2. JSON Escaping for Theme Updates
Theme settings require double-escaping. Use Python or a proper JSON library:
```python
payload = {"asset": {"key": "config/settings_data.json", "value": json.dumps(settings)}}
```

### 3. Block IDs Must Be Unique
When adding blocks to theme sections, ensure block IDs are unique across ALL sections:
```json
"blocks": {
  "section1-block-1": { },
  "section1-block-2": { }
}
```
Not: `"block-1"`, `"block-2"` (may conflict with other sections)

### 4. Collection Images
Set collection images via REST API on the collection itself:
```bash
curl -X PUT ".../smart_collections/{id}.json" \
  -d '{"smart_collection": {"image": {"src": "https://...", "alt": "..."}}}'
```

### 5. Rate Limiting
- REST: 40 requests/second (bucket with leaky bucket algorithm)
- GraphQL: Cost-based (check `throttleStatus` in response)

If rate limited, wait and retry with exponential backoff.

### 6. Webhook for Async Operations
Some operations (like file uploads) are async. Poll for completion or wait 2-3 seconds.

### 7. Theme Settings Validation
Invalid settings can break the theme. Always:
1. Download current settings first
2. Make incremental changes
3. Validate JSON before uploading
4. Test on a duplicate theme if possible

### 8. Collection Rule Limitations
- Max 60 rules per smart collection
- Some rule combinations can match unintended products
- Use `disjunctive: false` (AND) for precise matching

---

## Quick Reference: Common Tasks

| Task | Method | Endpoint/Query |
|------|--------|----------------|
| Get theme ID | REST GET | `/themes.json` |
| Update homepage section | REST PUT | `/themes/{id}/assets.json` (settings_data.json) |
| Create collection | REST POST | `/smart_collections.json` |
| Update collection | REST PUT | `/smart_collections/{id}.json` |
| Set collection image | REST PUT | `/smart_collections/{id}.json` with `image` object |
| Delete collection | REST DELETE | `/smart_collections/{id}.json` |
| Update menu | GraphQL | `menuUpdate` mutation |
| Upload image | GraphQL | `fileCreate` mutation |
| Get products by price | GraphQL | `products(query: "...")` |
| Update product tags | REST PUT | `/products/{id}.json` |
| Update page content | REST PUT | `/pages/{id}.json` |
| Delete shipping rate | GraphQL | `deliveryProfileUpdate` with `methodDefinitionsToDelete` |

---

## Example Workflow: Homepage Redesign

1. **Get current theme settings**
   ```bash
   curl -X GET ".../themes/{id}/assets.json?asset[key]=config/settings_data.json"
   ```

2. **Identify section IDs** (in `sections` object of settings)

3. **Create new collections if needed**
   ```bash
   curl -X POST ".../smart_collections.json" -d '{...}'
   ```

4. **Upload images if needed**
   ```bash
   # GraphQL fileCreate mutation
   ```

5. **Update theme settings JSON**
   - Modify section settings
   - Update collection handles
   - Add image references

6. **Push updated settings**
   ```bash
   curl -X PUT ".../themes/{id}/assets.json" -d '{"asset": {"key": "config/settings_data.json", "value": "..."}}'
   ```

7. **Verify changes** on storefront

---

## Credentials Template

```
Store: {store-name}.myshopify.com
Access Token: shpat_xxxxxxxxxxxxx
Theme ID: {theme_id}
API Version: 2024-01
```

---

*All examples are from production use on the Oil Slick store.*

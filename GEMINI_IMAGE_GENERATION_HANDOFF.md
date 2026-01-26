# Gemini Image Generation - LLM Handoff Document

## Project Context

This document explains how to implement **Nano Banana Pro** (Google Gemini 3 Pro Image) for automated product image generation on Shopify stores. This was successfully implemented for the Oil Slick Pad store and can be replicated for **Kraft and Kitchen** (https://github.com/Yoshi420247/kraftandkitchen-website-improvement-).

---

## What We Built

### Core Components

1. **`tools/nano_banana_generator.py`** - Python script for AI image generation
2. **`.github/workflows/generate-images.yml`** - GitHub Actions workflow for automated generation
3. **GitHub Secrets** - Secure storage for API keys

### Key Features

- **Gemini 3 Pro Image** (flagship model) with 2K/4K output
- **Competitor reference images** - Searches DuckDuckGo, downloads competitor product photos, and feeds them to Gemini as reference
- **Product presets** - Pre-configured prompts, variants, and Shopify product IDs
- **Direct Shopify upload** - Generated images upload automatically to products

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                       │
├─────────────────────────────────────────────────────────────────┤
│  1. Trigger: Manual (workflow_dispatch) or scheduled            │
│  2. Mode: Preset (auto) or Custom (manual prompt)               │
│  3. Secrets: GOOGLE_API_KEY, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  nano_banana_generator.py                        │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: Search competitor images (DuckDuckGo)                  │
│  Step 2: Download reference images (up to 6)                    │
│  Step 3: Generate images via Gemini 3 Pro API                   │
│  Step 4: Upload to Shopify product                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Google Gemini API                             │
├─────────────────────────────────────────────────────────────────┤
│  Model: gemini-3-pro-image-preview                              │
│  Endpoint: generativelanguage.googleapis.com/v1beta             │
│  Features: Multi-image reference, 2K/4K output, reasoning       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps for Kraft and Kitchen

### Step 1: Copy the Generator Script

Copy `tools/nano_banana_generator.py` to your repository. The script is self-contained and only requires the `requests` library.

### Step 2: Create Product Presets

Edit the `PRODUCT_PRESETS` dictionary in the script. Example for Kraft and Kitchen:

```python
PRODUCT_PRESETS = {
    "cutting-boards": {
        "name": "Kraft and Kitchen Cutting Boards",
        "product_id": YOUR_SHOPIFY_PRODUCT_ID,  # Get from Shopify admin URL
        "search_terms": [
            "wooden cutting board product photo",
            "bamboo cutting board white background",
            "kitchen cutting board professional photography"
        ],
        "variants": [
            {"size": "Small", "name": "Small (10x8 inches)", "material": "Bamboo"},
            {"size": "Medium", "name": "Medium (14x10 inches)", "material": "Bamboo"},
            {"size": "Large", "name": "Large (18x12 inches)", "material": "Acacia Wood"},
        ],
        "base_prompt": """Professional product photograph of a {material} cutting board, {size}.
The cutting board is shown from a 45-degree angle on a pure white background.
{material_detail}
Professional e-commerce photography, studio lighting, sharp focus.
CRITICAL: No text, no labels, no logos, no branding.""",
        "material_prompts": {
            "Bamboo": "Natural bamboo wood grain visible, light honey color.",
            "Acacia Wood": "Rich dark acacia wood with distinctive grain patterns."
        },
        "aspect_ratio": "1:1",
        "num_images": 2
    },
    "utensil-sets": {
        "name": "Kraft and Kitchen Utensil Sets",
        "product_id": YOUR_SHOPIFY_PRODUCT_ID,
        "search_terms": [
            "wooden kitchen utensil set product photo",
            "bamboo cooking utensils white background",
            "kitchen spatula spoon set professional"
        ],
        "variants": [
            {"size": "5-piece", "name": "5-Piece Set"},
            {"size": "7-piece", "name": "7-Piece Set"},
        ],
        "base_prompt": """Professional product photograph of a {size} wooden kitchen utensil set.
Utensils arranged neatly on pure white background.
Natural wood finish, eco-friendly appearance.
Professional e-commerce photography.
CRITICAL: No text, no labels, no logos.""",
        "aspect_ratio": "1:1",
        "num_images": 2
    }
}
```

### Step 3: Set Up GitHub Secrets

Go to: `https://github.com/Yoshi420247/kraftandkitchen-website-improvement-/settings/secrets/actions`

Add these 3 secrets:

| Secret Name | Value | How to Get |
|-------------|-------|------------|
| `GOOGLE_API_KEY` | `AIzaSy...` | https://aistudio.google.com/apikey |
| `SHOPIFY_STORE` | `your-store.myshopify.com` | Your Shopify store URL |
| `SHOPIFY_ACCESS_TOKEN` | `shpat_...` | Shopify Admin > Apps > Develop apps > Create app > API credentials |

### Step 4: Copy the GitHub Workflow

Copy `.github/workflows/generate-images.yml` to your repository.

Update the preset options in the workflow to match your products:

```yaml
preset:
  description: 'Product preset (for preset mode)'
  required: false
  default: 'cutting-boards'
  type: choice
  options:
    - cutting-boards
    - utensil-sets
    - your-other-products
```

### Step 5: Get Shopify Product IDs

For each product you want to generate images for:

1. Go to Shopify Admin > Products > [Your Product]
2. Look at the URL: `https://admin.shopify.com/store/your-store/products/12345678`
3. The number at the end (`12345678`) is the product ID
4. Add this to your preset configuration

---

## API Details

### Google Gemini 3 Pro Image API

**Endpoint:**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent
```

**Headers:**
```
Content-Type: application/json
x-goog-api-key: YOUR_API_KEY
```

**Request Body (with reference images):**
```json
{
  "contents": [{
    "parts": [
      {
        "inline_data": {
          "mime_type": "image/jpeg",
          "data": "BASE64_ENCODED_REFERENCE_IMAGE_1"
        }
      },
      {
        "inline_data": {
          "mime_type": "image/jpeg",
          "data": "BASE64_ENCODED_REFERENCE_IMAGE_2"
        }
      },
      {
        "text": "Your prompt here describing the image to generate"
      }
    ]
  }],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "1:1",
      "imageSize": "2K"
    }
  }
}
```

**Response:**
```json
{
  "candidates": [{
    "content": {
      "parts": [
        {"text": "Description of generated image"},
        {
          "inline_data": {
            "mime_type": "image/png",
            "data": "BASE64_ENCODED_GENERATED_IMAGE"
          }
        }
      ]
    }
  }]
}
```

### Available Models

| Model Key | Model ID | Output | Use Case |
|-----------|----------|--------|----------|
| `gemini` | `gemini-3-pro-image-preview` | 2K | **Default flagship** |
| `gemini-4k` | `gemini-3-pro-image-preview` | 4K | Maximum quality |
| `gemini-flash` | `gemini-2.5-flash-image` | Standard | Fast/budget |

### Shopify Image Upload API

**Endpoint:**
```
POST https://{store}.myshopify.com/admin/api/2024-01/products/{product_id}/images.json
```

**Headers:**
```
X-Shopify-Access-Token: YOUR_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "image": {
    "attachment": "BASE64_ENCODED_IMAGE",
    "position": 1,
    "alt": "Product description for SEO"
  }
}
```

---

## Troubleshooting

### Error: 403 Forbidden from Google API

**Cause:** API key doesn't have Generative Language API enabled, or proxy is blocking.

**Solution:**
1. Go to https://aistudio.google.com/apikey
2. Ensure "Generative Language API" is enabled
3. If running locally and behind a proxy, use GitHub Actions instead (runs in clean environment)

### Error: No reference images found

**Cause:** DuckDuckGo search didn't return results or rate limiting.

**Solution:**
1. Check search terms are specific enough
2. Add more search term variations
3. The script will proceed without references (still generates images, just less accurate)

### Error: Shopify upload failed

**Cause:** Invalid token or product ID.

**Solution:**
1. Verify `SHOPIFY_ACCESS_TOKEN` has `write_products` scope
2. Verify product ID exists and is correct
3. Check token hasn't expired

### Images have text/logos despite prompt

**Cause:** AI sometimes ignores negative prompts.

**Solution:**
1. Make "NO TEXT" more prominent in prompt
2. Add to the end: "CRITICAL: ABSOLUTELY NO text, watermarks, labels, logos, or branding of any kind"
3. Regenerate - results vary between runs

---

## CLI Usage Examples

```bash
# Test API key
python tools/nano_banana_generator.py --test

# Generate with preset (recommended)
python tools/nano_banana_generator.py --preset cutting-boards --upload

# Generate single custom image
python tools/nano_banana_generator.py "Wooden cutting board on white background" -o board.png

# Generate with your own reference images
python tools/nano_banana_generator.py "Bamboo cutting board" --reference ref1.jpg ref2.jpg

# Search competitors and use as reference
python tools/nano_banana_generator.py "Kitchen utensil set" --search-competitors

# List available presets
python tools/nano_banana_generator.py --list-presets

# List available models
python tools/nano_banana_generator.py --list-models
```

---

## GitHub Actions Usage

1. Go to Actions tab in your repository
2. Select "Generate Product Images (Nano Banana Pro)"
3. Click "Run workflow"
4. Select options:
   - **Mode:** `preset` (recommended) or `custom`
   - **Preset:** Your product preset name
   - **Upload to Shopify:** `true` to auto-upload
5. Click "Run workflow"

The workflow will:
1. Search for competitor product images
2. Download them as references
3. Generate images for all variants
4. Upload to your Shopify product
5. Save images as downloadable artifacts

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `tools/nano_banana_generator.py` | Main image generation script |
| `.github/workflows/generate-images.yml` | GitHub Actions workflow |
| `GITHUB_SECRETS_SETUP.md` | Instructions for adding secrets |

---

## Cost Estimates

| Model | Cost per Image | Notes |
|-------|---------------|-------|
| Gemini 3 Pro (2K) | ~$0.04 | Flagship, recommended |
| Gemini 3 Pro (4K) | ~$0.08 | Maximum quality |
| Gemini 2.5 Flash | ~$0.02 | Budget option |

---

## Summary for LLM

To implement Gemini image generation for Kraft and Kitchen:

1. **Copy files:** `tools/nano_banana_generator.py` and `.github/workflows/generate-images.yml`
2. **Edit presets:** Add product configurations with Shopify IDs, search terms, and prompts
3. **Add secrets:** `GOOGLE_API_KEY`, `SHOPIFY_STORE`, `SHOPIFY_ACCESS_TOKEN`
4. **Run workflow:** Select preset, enable upload, run

The system automatically searches for competitor product images, uses them as visual references for Gemini 3 Pro, generates photorealistic product photos, and uploads them directly to Shopify.

---

*Document created: January 2026*
*Source repository: https://github.com/Yoshi420247/Shopify-Collection-strategy-and-menu-creation*
*Target repository: https://github.com/Yoshi420247/kraftandkitchen-website-improvement-*

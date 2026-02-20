#!/usr/bin/env python3
"""
AI Product Variant Detector
============================
Uses Google Gemini vision to analyze product images and text to detect
variants (color, size, material, style, bundle quantity) that should exist
but are missing from single-variant Shopify products.

Pipeline:
  1. Fetch all single-variant products from Shopify (paginated)
  2. Download product images from Shopify CDN
  3. Send images + product text to Gemini for vision analysis
  4. Parse structured variant data with confidence scores
  5. Auto-apply high-confidence variants (≥ threshold)
  6. Generate review report for low-confidence detections

Designed for 1000+ product catalogues with:
  - Batch processing with progress saving/resume
  - Rate limiting for both Shopify and Gemini APIs
  - Configurable confidence threshold
  - Dry-run / analyze-only / apply modes

Usage:
    # Analyze only (generates report, no changes)
    python ai_variant_detector.py --analyze

    # Analyze and auto-apply above threshold (default 85%)
    python ai_variant_detector.py --apply --threshold 85

    # Apply from a previous report file
    python ai_variant_detector.py --apply-report variant_report_20260220.json

    # Resume a previous interrupted run
    python ai_variant_detector.py --analyze --resume

    # Limit to specific vendor
    python ai_variant_detector.py --analyze --vendor "What You Need"

    # Process a single product
    python ai_variant_detector.py --analyze --product-id 12345678
"""

import argparse
import base64
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
SHOPIFY_STORE = os.environ.get("SHOPIFY_STORE", "oil-slick-pad.myshopify.com")
SHOPIFY_ACCESS_TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
SHOPIFY_API_VERSION = os.environ.get("SHOPIFY_API_VERSION", "2024-01")
SHOPIFY_BASE_URL = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}"

# Gemini model for vision analysis (Flash is fast + cheap for analysis at scale)
GEMINI_VISION_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_VISION_MODEL}:generateContent"

# Processing limits
DEFAULT_CONFIDENCE_THRESHOLD = 85
MAX_IMAGES_PER_PRODUCT = 10  # Gemini can handle many, but cap for speed
SHOPIFY_RATE_LIMIT_MS = 550  # ms between Shopify API calls
GEMINI_RATE_LIMIT_S = 2  # seconds between Gemini calls
BATCH_SIZE = 50  # Products per batch before saving progress
MAX_VARIANTS_PER_PRODUCT = 100  # Shopify limit
MAX_OPTIONS_PER_PRODUCT = 3  # Shopify limit


# ─────────────────────────────────────────────────────────────────────────────
# Shopify API helpers
# ─────────────────────────────────────────────────────────────────────────────
_last_shopify_request = 0


def shopify_request(endpoint: str, method: str = "GET", data: dict = None,
                    retries: int = 3) -> dict:
    """Make a rate-limited request to the Shopify Admin API."""
    global _last_shopify_request

    url = f"{SHOPIFY_BASE_URL}/{endpoint}"
    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
    }

    # Rate limiting
    elapsed = (time.time() * 1000) - _last_shopify_request
    if elapsed < SHOPIFY_RATE_LIMIT_MS:
        time.sleep((SHOPIFY_RATE_LIMIT_MS - elapsed) / 1000)
    _last_shopify_request = time.time() * 1000

    for attempt in range(1, retries + 1):
        try:
            if method == "GET":
                resp = requests.get(url, headers=headers, timeout=30)
            elif method == "PUT":
                resp = requests.put(url, headers=headers, json=data, timeout=60)
            elif method == "POST":
                resp = requests.post(url, headers=headers, json=data, timeout=60)
            else:
                raise ValueError(f"Unsupported method: {method}")

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", 2))
                print(f"    Rate limited, waiting {retry_after}s...")
                time.sleep(retry_after)
                continue

            if resp.status_code >= 500:
                raise requests.exceptions.RequestException(
                    f"Server error {resp.status_code}"
                )

            resp.raise_for_status()
            return resp.json()

        except requests.exceptions.RequestException as e:
            if attempt < retries:
                wait = 2 ** attempt
                print(f"    Retry {attempt}/{retries} after {wait}s: {e}")
                time.sleep(wait)
            else:
                raise


def fetch_all_products(vendor: str = None) -> list:
    """Fetch all products from the store, optionally filtered by vendor.

    Uses since_id pagination for large catalogues.
    """
    products = []
    last_id = 0

    while True:
        params = ["limit=250"]
        if vendor:
            params.append(f"vendor={requests.utils.quote(vendor)}")
        if last_id > 0:
            params.append(f"since_id={last_id}")

        query = "&".join(params)
        data = shopify_request(f"products.json?{query}")
        batch = data.get("products", [])

        if not batch:
            break

        products.extend(batch)
        last_id = batch[-1]["id"]
        print(f"  Fetched {len(products)} products...")

        if len(batch) < 250:
            break

    return products


def fetch_single_product(product_id: int) -> dict:
    """Fetch a single product by ID."""
    data = shopify_request(f"products/{product_id}.json")
    return data.get("product", {})


def filter_single_variant_products(products: list) -> list:
    """Filter to only products that have a single default variant."""
    single_variant = []
    for p in products:
        variants = p.get("variants", [])
        if len(variants) == 1:
            v = variants[0]
            # The default variant has title "Default Title"
            if v.get("title", "").lower() in ("default title", "default"):
                single_variant.append(p)
    return single_variant


# ─────────────────────────────────────────────────────────────────────────────
# Image downloading
# ─────────────────────────────────────────────────────────────────────────────
def download_product_images(product: dict, max_images: int = MAX_IMAGES_PER_PRODUCT) -> list:
    """Download product images from Shopify CDN and return as base64 dicts.

    Returns list of {"mime_type": str, "data": str (base64), "src": str}
    """
    images = product.get("images", [])
    if not images:
        return []

    result = []
    for img in images[:max_images]:
        src = img.get("src", "")
        if not src:
            continue

        try:
            resp = requests.get(src, timeout=30)
            if resp.status_code == 200:
                content_type = resp.headers.get("Content-Type", "image/jpeg")
                if "png" in content_type:
                    mime = "image/png"
                elif "webp" in content_type:
                    mime = "image/webp"
                elif "gif" in content_type:
                    mime = "image/gif"
                else:
                    mime = "image/jpeg"

                b64 = base64.b64encode(resp.content).decode("utf-8")
                result.append({
                    "mime_type": mime,
                    "data": b64,
                    "src": src,
                })
        except Exception as e:
            print(f"    Warning: Failed to download image: {e}")

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Gemini Vision Analysis
# ─────────────────────────────────────────────────────────────────────────────
VARIANT_ANALYSIS_PROMPT = """You are a product variant detection expert for an e-commerce store. Analyze the product images and text below to determine if this product should have MULTIPLE VARIANTS.

**Product Title:** {title}
**Product Description (text only):** {description_text}
**Product Tags:** {tags}
**Current Price:** ${price}
**Vendor:** {vendor}

INSTRUCTIONS:
1. Study ALL images carefully. Look for:
   - Multiple COLORS shown (e.g., a product displayed in red, blue, and green)
   - Multiple SIZES shown or mentioned (e.g., small/medium/large, dimensions)
   - Multiple MATERIALS (e.g., glass vs silicone versions)
   - Multiple STYLES or designs (e.g., different patterns)
   - Bundle/quantity options suggested (e.g., "pack of 3" shown alongside singles)

2. Cross-reference with the product text for additional variant clues:
   - Color names mentioned in title or description
   - Size dimensions or labels
   - Material callouts
   - "Available in..." or "Choose your..." language

3. For COLORS specifically:
   - Identify the exact colors you see in the images
   - Use standard color names (Red, Blue, Green, Black, White, Purple, Pink, Orange, Yellow, Clear, Multi-Color, etc.)
   - If the image shows a product in multiple colorways, each color = 1 variant

4. Be CONSERVATIVE with detection:
   - Background colors or packaging colors are NOT product variants
   - Lighting differences are NOT color variants
   - If you see the SAME product from different angles, that is NOT a variant
   - Accessories or companion items in the image are NOT variants of this product
   - Only detect variants you are genuinely confident about

RESPOND WITH VALID JSON ONLY (no markdown, no code fences, no explanation outside JSON):
{{
  "has_variants": true/false,
  "confidence": 0-100,
  "reasoning": "Brief explanation of what you see",
  "variant_type": "Color" | "Size" | "Color / Size" | "Material" | "Style" | "Bundle" | "None",
  "options": [
    {{
      "name": "Color",
      "values": ["Red", "Blue", "Green"]
    }},
    {{
      "name": "Size",
      "values": ["Small", "Large"]
    }}
  ],
  "variants": [
    {{
      "option1": "Red",
      "option2": null,
      "option3": null
    }},
    {{
      "option1": "Blue",
      "option2": null,
      "option3": null
    }}
  ],
  "image_observations": "What the AI saw in the images that led to this conclusion"
}}

RULES:
- "options" array: max 3 entries (Shopify limit). Each has "name" and "values" array.
- "variants" array: One entry per unique combination. Use "option1", "option2", "option3" matching the order in "options".
- Total variant count must not exceed 100 (Shopify limit).
- If no variants detected, set has_variants=false, confidence=high number, empty options/variants arrays.
- Confidence reflects how sure you are. 95+ = very obvious (3 clearly different colored items). 70-85 = probable but some ambiguity. Below 70 = uncertain.
- Price for ALL variants should mirror the original product price (${price}).
"""


def strip_html(html: str) -> str:
    """Strip HTML tags and decode entities for plain text."""
    if not html:
        return ""
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&#\d+;', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # Truncate to avoid token limits
    return text[:2000]


def analyze_product_with_gemini(product: dict, images: list) -> dict:
    """Send product images + text to Gemini for variant analysis.

    Returns the parsed JSON response from Gemini.
    """
    if not GOOGLE_API_KEY:
        return {"error": "GOOGLE_API_KEY not set", "has_variants": False}

    title = product.get("title", "Unknown Product")
    description = strip_html(product.get("body_html", ""))
    tags = product.get("tags", "")
    vendor = product.get("vendor", "")
    price = "0.00"
    if product.get("variants"):
        price = product["variants"][0].get("price", "0.00")

    # Build the prompt
    prompt = VARIANT_ANALYSIS_PROMPT.format(
        title=title,
        description_text=description,
        tags=tags,
        price=price,
        vendor=vendor,
    )

    # Build the multimodal parts: images first, then prompt text
    parts = []
    for img in images:
        parts.append({
            "inline_data": {
                "mime_type": img["mime_type"],
                "data": img["data"],
            }
        })
    parts.append({"text": prompt})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.1,  # Low temperature for structured output
            "maxOutputTokens": 2048,
        },
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_API_KEY,
    }

    try:
        resp = requests.post(GEMINI_URL, headers=headers, json=payload, timeout=120)

        if resp.status_code != 200:
            error_text = resp.text[:500]
            return {
                "error": f"Gemini API error {resp.status_code}: {error_text}",
                "has_variants": False,
            }

        result = resp.json()
        candidates = result.get("candidates", [])
        if not candidates:
            return {"error": "No response candidates from Gemini", "has_variants": False}

        # Extract text response
        response_parts = candidates[0].get("content", {}).get("parts", [])
        text_response = ""
        for part in response_parts:
            if "text" in part:
                text_response += part["text"]

        if not text_response.strip():
            return {"error": "Empty response from Gemini", "has_variants": False}

        # Parse JSON from response (handle markdown code fences)
        json_text = text_response.strip()
        if json_text.startswith("```"):
            # Strip code fences
            json_text = re.sub(r'^```(?:json)?\s*', '', json_text)
            json_text = re.sub(r'\s*```$', '', json_text)

        parsed = json.loads(json_text)
        return parsed

    except json.JSONDecodeError as e:
        return {
            "error": f"Failed to parse Gemini JSON response: {e}",
            "raw_response": text_response[:500] if 'text_response' in dir() else "",
            "has_variants": False,
        }
    except Exception as e:
        return {"error": f"Gemini request failed: {e}", "has_variants": False}


# ─────────────────────────────────────────────────────────────────────────────
# Variant Creation in Shopify
# ─────────────────────────────────────────────────────────────────────────────
def create_variants_for_product(product: dict, analysis: dict) -> dict:
    """Update a Shopify product to add detected variants.

    Takes the existing single-variant product and replaces it with
    multi-variant configuration. All variants inherit the original price,
    SKU (with suffix), and inventory settings.

    Returns {"success": bool, "error": str, "variant_count": int}
    """
    product_id = product["id"]
    original_variant = product["variants"][0]
    original_price = original_variant.get("price", "0.00")
    original_compare_price = original_variant.get("compare_at_price")
    original_sku = original_variant.get("sku", "")
    original_weight = original_variant.get("weight", 0)
    original_weight_unit = original_variant.get("weight_unit", "g")
    original_inventory_management = original_variant.get("inventory_management", "shopify")
    original_taxable = original_variant.get("taxable", True)
    original_requires_shipping = original_variant.get("requires_shipping", True)

    options_data = analysis.get("options", [])
    variants_data = analysis.get("variants", [])

    if not options_data or not variants_data:
        return {"success": False, "error": "No options/variants in analysis data"}

    # Validate limits
    if len(options_data) > MAX_OPTIONS_PER_PRODUCT:
        options_data = options_data[:MAX_OPTIONS_PER_PRODUCT]

    if len(variants_data) > MAX_VARIANTS_PER_PRODUCT:
        variants_data = variants_data[:MAX_VARIANTS_PER_PRODUCT]

    # Build Shopify options
    shopify_options = []
    for i, opt in enumerate(options_data):
        shopify_options.append({
            "name": opt["name"],
            "values": opt["values"],
            "position": i + 1,
        })

    # Build Shopify variants
    shopify_variants = []
    for v in variants_data:
        # Generate a SKU suffix from variant values
        suffix_parts = []
        for key in ["option1", "option2", "option3"]:
            val = v.get(key)
            if val:
                # Create a clean suffix: "Red" -> "RED", "Small (10mm)" -> "SM-10MM"
                clean = re.sub(r'[^a-zA-Z0-9]', '-', val.upper())
                clean = re.sub(r'-+', '-', clean).strip('-')[:10]
                suffix_parts.append(clean)

        sku_suffix = "-".join(suffix_parts) if suffix_parts else ""
        variant_sku = f"{original_sku}-{sku_suffix}" if original_sku and sku_suffix else original_sku

        variant_entry = {
            "option1": v.get("option1"),
            "option2": v.get("option2"),
            "option3": v.get("option3"),
            "price": original_price,
            "sku": variant_sku,
            "weight": original_weight,
            "weight_unit": original_weight_unit,
            "inventory_management": original_inventory_management,
            "taxable": original_taxable,
            "requires_shipping": original_requires_shipping,
        }

        if original_compare_price:
            variant_entry["compare_at_price"] = original_compare_price

        shopify_variants.append(variant_entry)

    # Update the product via PUT
    update_payload = {
        "product": {
            "id": product_id,
            "options": shopify_options,
            "variants": shopify_variants,
        }
    }

    try:
        result = shopify_request(
            f"products/{product_id}.json",
            method="PUT",
            data=update_payload,
        )

        updated_product = result.get("product", {})
        new_variant_count = len(updated_product.get("variants", []))

        # Set inventory for new variants (each gets the same quantity as original)
        # We need to get the location ID first, then set inventory levels
        _set_inventory_for_new_variants(updated_product, original_variant)

        return {
            "success": True,
            "variant_count": new_variant_count,
            "product_id": product_id,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "product_id": product_id,
        }


def _set_inventory_for_new_variants(updated_product: dict, original_variant: dict):
    """Set inventory levels for newly created variants.

    Distributes the original inventory quantity evenly, or sets each
    variant to the same quantity as the original (configurable).
    """
    original_inventory_item_id = original_variant.get("inventory_item_id")
    if not original_inventory_item_id:
        return

    try:
        # Get the original inventory level to find the location
        inv_data = shopify_request(
            f"inventory_levels.json?inventory_item_ids={original_inventory_item_id}"
        )
        levels = inv_data.get("inventory_levels", [])
        if not levels:
            return

        location_id = levels[0].get("location_id")
        original_quantity = levels[0].get("available", 0)

        if not location_id:
            return

        # Set each new variant to the same inventory as the original
        for variant in updated_product.get("variants", []):
            inv_item_id = variant.get("inventory_item_id")
            if inv_item_id and inv_item_id != original_inventory_item_id:
                try:
                    shopify_request(
                        "inventory_levels/set.json",
                        method="POST",
                        data={
                            "location_id": location_id,
                            "inventory_item_id": inv_item_id,
                            "available": original_quantity,
                        },
                    )
                except Exception as e:
                    print(f"      Warning: Could not set inventory for variant: {e}")

    except Exception as e:
        print(f"    Warning: Could not set inventory levels: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Progress tracking (for resume support)
# ─────────────────────────────────────────────────────────────────────────────
PROGRESS_FILE = "variant_detection_progress.json"


def load_progress(progress_file: str = PROGRESS_FILE) -> dict:
    """Load progress from a previous run."""
    if Path(progress_file).exists():
        with open(progress_file, "r") as f:
            return json.load(f)
    return {"processed_ids": [], "results": []}


def save_progress(progress: dict, progress_file: str = PROGRESS_FILE):
    """Save progress to disk."""
    with open(progress_file, "w") as f:
        json.dump(progress, f, indent=2, default=str)


# ─────────────────────────────────────────────────────────────────────────────
# Report generation
# ─────────────────────────────────────────────────────────────────────────────
def generate_report(results: list, threshold: int) -> dict:
    """Generate a summary report from analysis results.

    Returns {"auto_apply": [...], "needs_review": [...], "no_variants": [...], "errors": [...]}
    """
    report = {
        "generated_at": datetime.now().isoformat(),
        "threshold": threshold,
        "total_analyzed": len(results),
        "auto_apply": [],
        "needs_review": [],
        "no_variants": [],
        "errors": [],
        "summary": {},
    }

    for r in results:
        if r.get("error"):
            report["errors"].append(r)
        elif not r.get("has_variants", False):
            report["no_variants"].append(r)
        elif r.get("confidence", 0) >= threshold:
            report["auto_apply"].append(r)
        else:
            report["needs_review"].append(r)

    report["summary"] = {
        "total_analyzed": len(results),
        "variants_detected": len(report["auto_apply"]) + len(report["needs_review"]),
        "auto_apply_count": len(report["auto_apply"]),
        "needs_review_count": len(report["needs_review"]),
        "no_variants_count": len(report["no_variants"]),
        "error_count": len(report["errors"]),
    }

    return report


def print_report(report: dict):
    """Print a human-readable summary of the report."""
    s = report["summary"]

    print(f"\n{'='*70}")
    print(f"  AI VARIANT DETECTION REPORT")
    print(f"  Generated: {report['generated_at']}")
    print(f"  Confidence Threshold: {report['threshold']}%")
    print(f"{'='*70}")
    print(f"  Total products analyzed:      {s['total_analyzed']}")
    print(f"  Variants detected:            {s['variants_detected']}")
    print(f"    - Auto-apply (>={report['threshold']}%):    {s['auto_apply_count']}")
    print(f"    - Needs review (<{report['threshold']}%):    {s['needs_review_count']}")
    print(f"  No variants found:            {s['no_variants_count']}")
    print(f"  Errors:                       {s['error_count']}")
    print(f"{'='*70}")

    if report["auto_apply"]:
        print(f"\n  AUTO-APPLY QUEUE ({s['auto_apply_count']} products):")
        print(f"  {'─'*66}")
        for item in report["auto_apply"]:
            conf = item.get("confidence", 0)
            title = item.get("title", "Unknown")[:45]
            vtype = item.get("variant_type", "?")
            n_variants = len(item.get("variants", []))
            print(f"    [{conf:3d}%] {title:<45} | {vtype:<12} | {n_variants} variants")
            if item.get("options"):
                for opt in item["options"]:
                    vals = ", ".join(opt.get("values", []))
                    print(f"           {opt['name']}: {vals}")

    if report["needs_review"]:
        print(f"\n  REVIEW QUEUE ({s['needs_review_count']} products):")
        print(f"  {'─'*66}")
        for item in report["needs_review"]:
            conf = item.get("confidence", 0)
            title = item.get("title", "Unknown")[:45]
            vtype = item.get("variant_type", "?")
            reasoning = item.get("reasoning", "")[:60]
            print(f"    [{conf:3d}%] {title:<45} | {vtype}")
            print(f"           Reason: {reasoning}")

    if report["errors"]:
        print(f"\n  ERRORS ({s['error_count']}):")
        print(f"  {'─'*66}")
        for item in report["errors"][:10]:
            title = item.get("title", "Unknown")[:45]
            error = item.get("error", "Unknown error")[:60]
            print(f"    {title:<45} | {error}")


# ─────────────────────────────────────────────────────────────────────────────
# Main processing pipeline
# ─────────────────────────────────────────────────────────────────────────────
def process_product(product: dict, verbose: bool = True) -> dict:
    """Analyze a single product for variants.

    Returns analysis result dict with product metadata added.
    """
    product_id = product["id"]
    title = product.get("title", "Unknown")
    image_count = len(product.get("images", []))

    if verbose:
        print(f"\n  Analyzing: {title}")
        print(f"    ID: {product_id} | Images: {image_count}")

    # Skip products with no images (can't do visual analysis)
    if image_count == 0:
        if verbose:
            print(f"    Skipping: No images available")
        return {
            "product_id": product_id,
            "title": title,
            "has_variants": False,
            "confidence": 100,
            "reasoning": "No product images to analyze",
            "skipped": True,
        }

    # Download images
    if verbose:
        print(f"    Downloading {min(image_count, MAX_IMAGES_PER_PRODUCT)} images...")
    images = download_product_images(product)

    if not images:
        if verbose:
            print(f"    Skipping: Failed to download images")
        return {
            "product_id": product_id,
            "title": title,
            "has_variants": False,
            "error": "Failed to download product images",
        }

    if verbose:
        print(f"    Sending to Gemini for analysis ({len(images)} images)...")

    # Analyze with Gemini
    analysis = analyze_product_with_gemini(product, images)

    # Rate limit Gemini calls
    time.sleep(GEMINI_RATE_LIMIT_S)

    # Add product metadata to the result
    analysis["product_id"] = product_id
    analysis["title"] = title
    analysis["handle"] = product.get("handle", "")
    analysis["vendor"] = product.get("vendor", "")
    analysis["current_price"] = product["variants"][0].get("price", "0.00") if product.get("variants") else "0.00"
    analysis["current_sku"] = product["variants"][0].get("sku", "") if product.get("variants") else ""
    analysis["image_count"] = image_count
    analysis["admin_url"] = f"https://{SHOPIFY_STORE}/admin/products/{product_id}"

    if verbose:
        if analysis.get("error"):
            print(f"    Error: {analysis['error']}")
        elif analysis.get("has_variants"):
            conf = analysis.get("confidence", 0)
            vtype = analysis.get("variant_type", "Unknown")
            n = len(analysis.get("variants", []))
            print(f"    DETECTED: {n} variants ({vtype}) [{conf}% confidence]")
            if analysis.get("options"):
                for opt in analysis["options"]:
                    vals = ", ".join(opt.get("values", []))
                    print(f"      {opt['name']}: {vals}")
        else:
            print(f"    No variants detected [{analysis.get('confidence', 0)}% confidence]")

    return analysis


def run_analysis(products: list, resume: bool = False, verbose: bool = True) -> list:
    """Run variant analysis on a list of products.

    Supports resume from previous interrupted runs.
    """
    progress = load_progress() if resume else {"processed_ids": [], "results": []}
    processed_ids = set(progress["processed_ids"])
    results = progress["results"]

    remaining = [p for p in products if p["id"] not in processed_ids]

    if resume and processed_ids:
        print(f"\n  Resuming: {len(processed_ids)} already processed, {len(remaining)} remaining")

    total = len(remaining)
    for i, product in enumerate(remaining):
        print(f"\n[{i+1}/{total}]", end="")
        result = process_product(product, verbose=verbose)
        results.append(result)
        processed_ids.add(product["id"])

        # Save progress periodically
        if (i + 1) % BATCH_SIZE == 0:
            progress["processed_ids"] = list(processed_ids)
            progress["results"] = results
            save_progress(progress)
            if verbose:
                print(f"\n  Progress saved ({len(processed_ids)} processed)")

    # Final save
    progress["processed_ids"] = list(processed_ids)
    progress["results"] = results
    save_progress(progress)

    return results


def apply_variants(report: dict, apply_all: bool = False,
                   product_lookup: dict = None, verbose: bool = True) -> dict:
    """Apply detected variants to Shopify products.

    Args:
        report: The analysis report
        apply_all: If True, apply both auto_apply and needs_review
        product_lookup: Dict of product_id -> product data (to avoid re-fetching)
        verbose: Print progress
    """
    items_to_apply = report.get("auto_apply", [])
    if apply_all:
        items_to_apply = items_to_apply + report.get("needs_review", [])

    if not items_to_apply:
        print("  No variants to apply.")
        return {"applied": 0, "failed": 0, "results": []}

    print(f"\n  Applying variants to {len(items_to_apply)} products...")
    applied = 0
    failed = 0
    apply_results = []

    for i, item in enumerate(items_to_apply):
        product_id = item["product_id"]
        title = item.get("title", "Unknown")

        print(f"\n  [{i+1}/{len(items_to_apply)}] {title}")

        # Fetch the full product data if not in lookup
        if product_lookup and product_id in product_lookup:
            product = product_lookup[product_id]
        else:
            print(f"    Fetching product data...")
            product = fetch_single_product(product_id)
            if not product:
                print(f"    ERROR: Could not fetch product {product_id}")
                failed += 1
                apply_results.append({
                    "product_id": product_id,
                    "success": False,
                    "error": "Could not fetch product",
                })
                continue

        # Create variants
        result = create_variants_for_product(product, item)

        if result["success"]:
            applied += 1
            print(f"    SUCCESS: Created {result['variant_count']} variants")
        else:
            failed += 1
            print(f"    FAILED: {result.get('error', 'Unknown error')}")

        apply_results.append(result)

        # Rate limit
        time.sleep(1)

    print(f"\n  Application complete: {applied} succeeded, {failed} failed")
    return {"applied": applied, "failed": failed, "results": apply_results}


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="AI Product Variant Detector - Analyze product images to detect missing variants",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Analyze all single-variant products (generates report only)
  python ai_variant_detector.py --analyze

  # Analyze and auto-apply high-confidence variants
  python ai_variant_detector.py --apply --threshold 85

  # Apply from a saved report
  python ai_variant_detector.py --apply-report variant_report.json

  # Resume an interrupted analysis
  python ai_variant_detector.py --analyze --resume

  # Filter by vendor
  python ai_variant_detector.py --analyze --vendor "What You Need"

  # Analyze a single product
  python ai_variant_detector.py --analyze --product-id 12345678

  # Apply ALL detected variants (including low-confidence)
  python ai_variant_detector.py --apply --apply-all

  # Dry run with verbose output
  python ai_variant_detector.py --analyze --verbose --limit 10
        """,
    )

    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--analyze", action="store_true",
                      help="Analyze products for variants (report only)")
    mode.add_argument("--apply", action="store_true",
                      help="Analyze AND apply high-confidence variants")
    mode.add_argument("--apply-report", type=str, metavar="FILE",
                      help="Apply variants from a saved report JSON file")

    parser.add_argument("--threshold", type=int, default=DEFAULT_CONFIDENCE_THRESHOLD,
                        help=f"Confidence threshold for auto-apply (default: {DEFAULT_CONFIDENCE_THRESHOLD})")
    parser.add_argument("--vendor", type=str, default=None,
                        help="Filter products by vendor name")
    parser.add_argument("--product-id", type=int, default=None,
                        help="Analyze a single product by ID")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of products to process")
    parser.add_argument("--resume", action="store_true",
                        help="Resume from a previous interrupted run")
    parser.add_argument("--apply-all", action="store_true",
                        help="Apply ALL detected variants, not just high-confidence")
    parser.add_argument("--output", "-o", type=str, default=None,
                        help="Output report file path (default: variant_report_YYYYMMDD_HHMMSS.json)")
    parser.add_argument("--verbose", "-v", action="store_true", default=True,
                        help="Verbose output (default: True)")
    parser.add_argument("--quiet", "-q", action="store_true",
                        help="Suppress verbose output")

    args = parser.parse_args()
    verbose = not args.quiet

    # ── Validate credentials ──
    if not SHOPIFY_ACCESS_TOKEN:
        print("ERROR: SHOPIFY_ACCESS_TOKEN environment variable not set")
        sys.exit(1)

    if not GOOGLE_API_KEY and not args.apply_report:
        print("ERROR: GOOGLE_API_KEY environment variable not set")
        sys.exit(1)

    # ── Apply from report mode ──
    if args.apply_report:
        report_path = Path(args.apply_report)
        if not report_path.exists():
            print(f"ERROR: Report file not found: {args.apply_report}")
            sys.exit(1)

        print(f"\nLoading report from {args.apply_report}...")
        with open(report_path, "r") as f:
            report = json.load(f)

        print_report(report)

        if args.apply_all:
            print("\nApplying ALL detected variants (including low-confidence)...")
        else:
            print(f"\nApplying high-confidence variants (>={report.get('threshold', args.threshold)}%)...")

        apply_result = apply_variants(report, apply_all=args.apply_all, verbose=verbose)

        # Save application results
        result_path = report_path.stem + "_applied.json"
        with open(result_path, "w") as f:
            json.dump(apply_result, f, indent=2, default=str)
        print(f"\nApplication results saved to: {result_path}")
        sys.exit(0)

    # ── Fetch products ──
    print(f"\n{'='*70}")
    print(f"  AI VARIANT DETECTOR")
    print(f"  Store: {SHOPIFY_STORE}")
    print(f"  Vision Model: {GEMINI_VISION_MODEL}")
    print(f"  Threshold: {args.threshold}%")
    print(f"  Mode: {'Analyze + Apply' if args.apply else 'Analyze Only'}")
    print(f"{'='*70}")

    if args.product_id:
        # Single product mode
        print(f"\nFetching product {args.product_id}...")
        product = fetch_single_product(args.product_id)
        if not product:
            print(f"ERROR: Product {args.product_id} not found")
            sys.exit(1)

        # Check if it's single-variant
        variants = product.get("variants", [])
        if len(variants) > 1:
            print(f"WARNING: Product already has {len(variants)} variants. Analyzing anyway.")

        products = [product]
    else:
        # Batch mode
        if args.vendor:
            print(f"\nFetching products from vendor: {args.vendor}")
        else:
            print(f"\nFetching all products...")

        all_products = fetch_all_products(vendor=args.vendor)
        print(f"  Total products: {len(all_products)}")

        # Filter to single-variant products
        products = filter_single_variant_products(all_products)
        print(f"  Single-variant products: {len(products)}")

        if args.limit:
            products = products[:args.limit]
            print(f"  Limited to: {args.limit} products")

    if not products:
        print("\nNo products to analyze.")
        sys.exit(0)

    # ── Build product lookup for apply phase ──
    product_lookup = {p["id"]: p for p in products}

    # ── Run analysis ──
    print(f"\nStarting analysis of {len(products)} products...")
    results = run_analysis(products, resume=args.resume, verbose=verbose)

    # ── Generate report ──
    report = generate_report(results, args.threshold)
    print_report(report)

    # Save report
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_filename = args.output or f"variant_report_{timestamp}.json"
    with open(report_filename, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"\n  Report saved to: {report_filename}")

    # ── Apply if requested ──
    if args.apply:
        if report["summary"]["auto_apply_count"] == 0 and not args.apply_all:
            print("\n  No high-confidence variants to apply.")
        else:
            print(f"\n  {'─'*66}")
            if args.apply_all:
                total = report["summary"]["auto_apply_count"] + report["summary"]["needs_review_count"]
                print(f"  Applying ALL {total} detected variant sets...")
            else:
                print(f"  Applying {report['summary']['auto_apply_count']} high-confidence variant sets...")
            print(f"  {'─'*66}")

            apply_result = apply_variants(
                report,
                apply_all=args.apply_all,
                product_lookup=product_lookup,
                verbose=verbose,
            )

            # Save application results
            apply_filename = f"variant_applied_{timestamp}.json"
            with open(apply_filename, "w") as f:
                json.dump(apply_result, f, indent=2, default=str)
            print(f"\n  Application results saved to: {apply_filename}")

    # Clean up progress file on successful completion
    progress_path = Path(PROGRESS_FILE)
    if progress_path.exists():
        progress_path.unlink()
        if verbose:
            print(f"  Progress file cleaned up.")

    print(f"\n  Done!")


if __name__ == "__main__":
    main()

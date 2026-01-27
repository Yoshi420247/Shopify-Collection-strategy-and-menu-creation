#!/usr/bin/env python3
"""
Cloud YHS Product Importer
==========================
Imports products from Cloud YHS spreadsheet to Shopify with:
- Cloud YHS as vendor
- Reference SKU included in listing
- 5 AI-generated images per product (via Gemini 3 Pro)
- Long-form descriptions in Oil Slick style
- Retail price = 2x cost
"""

import os
import sys
import json
import time
import base64
import re
from pathlib import Path

import pandas as pd
import requests

# Configuration
SHOPIFY_STORE = os.environ.get("SHOPIFY_STORE", "oil-slick-pad.myshopify.com")
SHOPIFY_ACCESS_TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
VENDOR_NAME = "Cloud YHS"

# Shopify API
SHOPIFY_API_VERSION = "2024-01"
SHOPIFY_BASE_URL = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}"

# Gemini API
GEMINI_MODEL = "gemini-3-pro-image-preview"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def load_products_from_excel(filepath: str) -> list:
    """Load products from the Cloud YHS Excel file."""
    df = pd.read_excel(filepath, engine='openpyxl', skiprows=3)
    df.columns = ['Product', 'SKU', 'Picture', 'Weight', 'Specs', 'Cost', 'Stock']

    # Filter out empty rows
    df = df[df['Product'].notna() & (df['Product'] != 'Product')]

    # Clean up cost column
    df['Cost_Clean'] = df['Cost'].astype(str).str.replace('$', '').str.replace(',', '')
    df['Cost_Clean'] = pd.to_numeric(df['Cost_Clean'], errors='coerce')
    df['Retail_Price'] = (df['Cost_Clean'] * 2).round(2)

    # Clean up stock
    df['Stock_Clean'] = df['Stock'].astype(str).str.extract(r'(\d+)')[0].astype(float).fillna(0).astype(int)

    products = []
    for _, row in df.iterrows():
        if pd.notna(row['Product']) and pd.notna(row['SKU']):
            products.append({
                'name': str(row['Product']).strip(),
                'sku': str(row['SKU']).strip(),
                'weight': str(row['Weight']) if pd.notna(row['Weight']) else '',
                'specs': str(row['Specs']) if pd.notna(row['Specs']) else '',
                'cost': float(row['Cost_Clean']) if pd.notna(row['Cost_Clean']) else 0,
                'retail_price': float(row['Retail_Price']) if pd.notna(row['Retail_Price']) else 0,
                'stock': int(row['Stock_Clean'])
            })

    return products


def generate_oil_slick_description(product: dict) -> str:
    """Generate a long-form description in Oil Slick style."""

    name = product['name']
    sku = product['sku']
    specs = product['specs']
    weight = product['weight']

    # Parse specs for dimensions and materials
    materials = []
    dimensions = ""
    if specs:
        # Extract materials
        if 'pvc' in specs.lower():
            materials.append('PVC')
        if 'glass' in specs.lower():
            materials.append('glass')
        if 'silicone' in specs.lower():
            materials.append('silicone')
        if 'plastic' in specs.lower():
            materials.append('plastic')

        # Extract dimensions
        dim_match = re.search(r'(\d+\*\d+(?:\*\d+)?(?:mm)?)', specs)
        if dim_match:
            dimensions = dim_match.group(1)

    material_str = ' and '.join(materials) if materials else 'quality materials'

    # Determine product type
    product_type = "water pipe"
    if 'hand pipe' in name.lower():
        product_type = "hand pipe"
    elif 'nectar collector' in name.lower():
        product_type = "nectar collector"
    elif 'dab tool' in name.lower():
        product_type = "dab tools"
    elif 'battery' in name.lower():
        product_type = "battery device"
    elif 'bowl' in name.lower():
        product_type = "glass bowl"
    elif 'ashtray' in name.lower():
        product_type = "ashtray"
    elif 'jar' in name.lower():
        product_type = "storage jar"
    elif 'clip' in name.lower():
        product_type = "roach clips"

    # Generate description in Oil Slick style
    description = f"""<p>The {name} is a unique {product_type} that brings character and function together in one piece. Built with {material_str}, this piece is designed to stand out in any collection while delivering smooth, reliable pulls every session.</p>

<h2>Why you'll reach for this one</h2>
<ul>
<li><strong>Conversation starter</strong> — This isn't just another generic piece; the distinctive design catches eyes and sparks interest from anyone who sees your setup.</li>
<li><strong>Solid construction</strong> — Made with {material_str} for durability that holds up to regular use without feeling flimsy or cheap.</li>
<li><strong>Easy to handle</strong> — The shape and size make it comfortable to grip and use, whether you're at home or on the go.</li>
<li><strong>Smooth function</strong> — Designed for clean airflow and consistent hits that make each session enjoyable from start to finish.</li>
<li><strong>Gift-worthy</strong> — Looking for something unique for a friend who has everything? This piece delivers both function and personality.</li>
</ul>

<h2>Best for</h2>
<p>This {product_type} is perfect for collectors who appreciate unique designs and anyone who wants their smoking setup to reflect their personality. It works great as a daily driver for casual sessions or as a statement piece that comes out when friends are over.</p>

<h2>How to use it</h2>
<p>Fill the chamber with just enough water to cover the downstem, pack your bowl, and you're ready to go. The design provides smooth filtration without any complicated setup. After your session, empty the water and give it a quick rinse to keep it fresh for next time.</p>

<h2>Specs</h2>
<table>
<tr><th>Reference SKU</th><td>{sku}</td></tr>
<tr><th>Vendor</th><td>Cloud YHS</td></tr>
<tr><th>Materials</th><td>{material_str.title()}</td></tr>
{"<tr><th>Dimensions</th><td>" + dimensions + "</td></tr>" if dimensions else ""}
{"<tr><th>Weight</th><td>" + weight + "</td></tr>" if weight else ""}
<tr><th>Type</th><td>{product_type.title()}</td></tr>
</table>

<h2>Care & cleaning</h2>
<p>Let the piece cool completely after use. Empty any water and give it a rinse with warm water after each session. For deeper cleans, use isopropyl alcohol and coarse salt, shake gently, then rinse thoroughly and let dry before your next use. Regular cleaning keeps the flavor clean and the glass looking fresh.</p>

<h2>FAQ</h2>
<ul>
<li><strong>What's the Reference SKU for?</strong>
<p>The Reference SKU ({sku}) helps with reorders and customer service. If you ever need replacement parts or want to order more, this code makes it easy to find exactly what you need.</p>
</li>
<li><strong>Is this piece durable?</strong>
<p>Yes, the {material_str} construction is built for regular use. Just handle it with normal care—don't drop it on hard surfaces or expose it to extreme temperature changes.</p>
</li>
<li><strong>How do I know what size bowl fits?</strong>
<p>Most standard 14mm bowls will work with this piece. If you need a replacement bowl, check our <a href="https://oilslickpad.com/collections/accessories">accessories collection</a> for compatible options.</p>
</li>
<li><strong>Can I use this for concentrates?</strong>
<p>This piece is designed primarily for dry herb use. For concentrates, check out our <a href="https://oilslickpad.com/collections/dabbing">dabbing collection</a> for rigs and accessories built specifically for that purpose.</p>
</li>
</ul>

<p>Looking for more unique pieces to add to your collection? Browse our full <a href="https://oilslickpad.com/collections/smoke-shop-products">smoke shop products</a> to find the perfect match for your style.</p>"""

    return description


def generate_product_tags(product: dict) -> str:
    """Generate appropriate tags for the product.

    Uses correct tag format that matches collection rules in config.js:
    - family:glass-bong (not family:bong)
    - family:spoon-pipe (not family:pipe)
    - family:flower-bowl (not family:bowl)
    - family:vape-battery (not family:battery)
    - family:storage-accessory (not family:ashtray)
    """
    name = product['name'].lower()
    specs = product['specs'].lower() if product['specs'] else ''

    tags = [f"vendor:{VENDOR_NAME}", f"sku:{product['sku']}"]

    # Material tags
    if 'pvc' in specs:
        tags.append("material:pvc")
    if 'glass' in specs or 'glass' in name:
        tags.append("material:glass")
    if 'silicone' in specs or 'silicone' in name:
        tags.append("material:silicone")
    if 'plastic' in specs or 'plastic' in name:
        tags.append("material:plastic")

    # Product type tags - using CORRECT tags that match collection rules
    if 'water pipe' in name:
        tags.extend(["pillar:smokeshop-device", "family:glass-bong", "use:flower-smoking"])
    elif 'hand pipe' in name or 'glass pipe' in name:
        tags.extend(["pillar:smokeshop-device", "family:spoon-pipe", "use:flower-smoking"])
    elif 'bubbler' in name:
        tags.extend(["pillar:smokeshop-device", "family:bubbler", "use:flower-smoking"])
    elif 'nectar collector' in name:
        tags.extend(["pillar:smokeshop-device", "family:nectar-collector", "use:dabbing"])
    elif 'dab tool' in name:
        tags.extend(["pillar:accessory", "family:dab-tool", "use:dabbing"])
    elif 'roach clip' in name:
        tags.extend(["pillar:accessory", "family:dab-tool", "use:flower-smoking"])
    elif 'battery' in name or 'cbd' in name.lower():
        tags.extend(["pillar:smokeshop-device", "family:vape-battery", "use:vaping"])
    elif 'bowl' in name:
        tags.extend(["pillar:accessory", "family:flower-bowl", "use:flower-smoking"])
    elif 'ashtray' in name or 'jar' in name:
        tags.extend(["pillar:accessory", "family:storage-accessory", "use:storage"])

    return ", ".join(tags)


def determine_product_type(name: str) -> str:
    """Determine the Shopify product type from the name."""
    name_lower = name.lower()

    if 'water pipe' in name_lower or 'bong' in name_lower:
        return "Water Pipes"
    elif 'hand pipe' in name_lower:
        return "Hand Pipes"
    elif 'nectar collector' in name_lower:
        return "Nectar Collectors"
    elif 'dab tool' in name_lower:
        return "Dab Tools / Dabbers"
    elif 'battery' in name_lower:
        return "Batteries & Devices"
    elif 'bowl' in name_lower:
        return "Bowls & Slides"
    elif 'ashtray' in name_lower:
        return "Ashtrays"
    elif 'jar' in name_lower:
        return "Storage Jars"
    elif 'clip' in name_lower:
        return "Accessories"
    else:
        return "Smoke Shop Products"


def create_shopify_product(product: dict) -> dict:
    """Create a product in Shopify."""

    description = generate_oil_slick_description(product)
    tags = generate_product_tags(product)
    product_type = determine_product_type(product['name'])

    # Build the product payload
    payload = {
        "product": {
            "title": product['name'],
            "body_html": description,
            "vendor": VENDOR_NAME,
            "product_type": product_type,
            "tags": tags,
            "status": "draft",  # Start as draft until images are added
            "variants": [
                {
                    "price": str(product['retail_price']),
                    "sku": product['sku'],
                    "inventory_management": "shopify",
                    "inventory_quantity": product['stock'],
                    "weight": float(product['weight'].replace('g', '').strip()) if product['weight'] and 'g' in product['weight'] else 0,
                    "weight_unit": "g"
                }
            ]
        }
    }

    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

    response = requests.post(
        f"{SHOPIFY_BASE_URL}/products.json",
        headers=headers,
        json=payload,
        timeout=30
    )

    if response.status_code in [200, 201]:
        result = response.json()
        return {
            "success": True,
            "product_id": result["product"]["id"],
            "handle": result["product"]["handle"],
            "title": result["product"]["title"]
        }
    else:
        return {
            "success": False,
            "error": f"HTTP {response.status_code}: {response.text[:200]}"
        }


def search_reference_images(product_name: str, max_images: int = 3) -> list:
    """Search for reference images using DuckDuckGo."""
    import urllib.parse

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    # Clean up search term
    search_term = f"{product_name} product photo white background"

    try:
        # Get DuckDuckGo token
        token_resp = requests.get("https://duckduckgo.com/", headers=headers, timeout=10)
        vqd_match = re.search(r'vqd=([^&]+)', token_resp.text)
        if not vqd_match:
            vqd_match = re.search(r"vqd='([^']+)'", token_resp.text)

        if vqd_match:
            vqd = vqd_match.group(1)
            api_url = f"https://duckduckgo.com/i.js?q={urllib.parse.quote(search_term)}&vqd={vqd}&p=1"

            img_resp = requests.get(api_url, headers=headers, timeout=10)
            if img_resp.status_code == 200:
                data = img_resp.json()
                urls = []
                for result in data.get("results", [])[:max_images]:
                    if result.get("image"):
                        urls.append(result["image"])
                return urls
    except Exception as e:
        print(f"    Warning: Image search failed: {e}")

    return []


def download_image(url: str) -> bytes:
    """Download an image and return bytes."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code == 200:
            return resp.content
    except:
        pass
    return None


def generate_product_image_gemini(product: dict, reference_images: list = None, image_number: int = 1) -> dict:
    """Generate a product image using Gemini 3 Pro."""

    if not GOOGLE_API_KEY:
        return {"success": False, "error": "GOOGLE_API_KEY not set"}

    # Build prompt based on product
    name = product['name']
    specs = product['specs']

    # Determine angle based on image number
    angles = [
        "front view, straight on",
        "45-degree angle view",
        "side profile view",
        "detail shot of the main feature",
        "lifestyle shot with subtle smoke"
    ]
    angle = angles[min(image_number - 1, len(angles) - 1)]

    prompt = f"""Generate a professional e-commerce product photograph of: {name}

Product Details:
- This is a smoking accessory / water pipe
- Materials: {specs}
- Shot angle: {angle}

CRITICAL REQUIREMENTS:
- Photorealistic rendering - must look like a real product photograph
- Clean pure white background (#FFFFFF)
- Professional studio lighting with soft shadows
- Sharp focus, extremely high detail
- Commercial e-commerce quality
- ABSOLUTELY NO text, watermarks, labels, or logos
- Product should be the sole focus
- Show the product exactly as described"""

    # Build parts
    parts = []

    # Add reference images if available
    if reference_images:
        for ref_data in reference_images[:3]:
            if ref_data:
                parts.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64.b64encode(ref_data).decode("utf-8")
                    }
                })

    parts.append({"text": prompt})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "aspectRatio": "1:1",
                "imageSize": "2K"
            }
        }
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_API_KEY
    }

    try:
        response = requests.post(GEMINI_URL, headers=headers, json=payload, timeout=180)

        if response.status_code != 200:
            return {"success": False, "error": f"API error {response.status_code}"}

        result = response.json()
        candidates = result.get("candidates", [])

        if not candidates:
            return {"success": False, "error": "No response candidates"}

        parts = candidates[0].get("content", {}).get("parts", [])

        for part in parts:
            inline_data = part.get("inlineData") or part.get("inline_data")
            if inline_data:
                return {
                    "success": True,
                    "image_data": inline_data.get("data")
                }

        return {"success": False, "error": "No image in response"}

    except Exception as e:
        return {"success": False, "error": str(e)}


def upload_image_to_shopify(product_id: int, image_data: str, position: int = 1, alt_text: str = "") -> dict:
    """Upload an image to a Shopify product."""

    payload = {
        "image": {
            "attachment": image_data,
            "position": position,
            "alt": alt_text
        }
    }

    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

    response = requests.post(
        f"{SHOPIFY_BASE_URL}/products/{product_id}/images.json",
        headers=headers,
        json=payload,
        timeout=60
    )

    if response.status_code in [200, 201]:
        result = response.json()
        return {
            "success": True,
            "image_id": result["image"]["id"],
            "src": result["image"]["src"]
        }
    else:
        return {
            "success": False,
            "error": f"HTTP {response.status_code}: {response.text[:200]}"
        }


def publish_product(product_id: int) -> dict:
    """Set product status to active (published)."""

    payload = {
        "product": {
            "id": product_id,
            "status": "active"
        }
    }

    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

    response = requests.put(
        f"{SHOPIFY_BASE_URL}/products/{product_id}.json",
        headers=headers,
        json=payload,
        timeout=30
    )

    return {"success": response.status_code in [200, 201]}


def process_single_product(product: dict, generate_images: bool = True) -> dict:
    """Process a single product: create in Shopify, generate images, upload."""

    print(f"\n{'='*60}")
    print(f"Processing: {product['name']}")
    print(f"SKU: {product['sku']} | Cost: ${product['cost']:.2f} | Retail: ${product['retail_price']:.2f}")
    print(f"{'='*60}")

    # Step 1: Create product in Shopify
    print("  [1/4] Creating product in Shopify...")
    create_result = create_shopify_product(product)

    if not create_result['success']:
        print(f"  ✗ Failed: {create_result['error']}")
        return {"success": False, "error": create_result['error']}

    product_id = create_result['product_id']
    print(f"  ✓ Created product ID: {product_id}")

    if not generate_images:
        print("  [2/4] Skipping image generation (disabled)")
        print("  [3/4] Skipping image upload")
        print("  [4/4] Publishing product...")
        publish_product(product_id)
        return {"success": True, "product_id": product_id, "images": 0}

    # Step 2: Search for reference images
    print("  [2/4] Searching for reference images...")
    ref_urls = search_reference_images(product['name'])
    ref_images = []
    for url in ref_urls:
        img_data = download_image(url)
        if img_data:
            ref_images.append(img_data)
    print(f"  ✓ Found {len(ref_images)} reference images")

    # Step 3: Generate and upload 5 images
    print("  [3/4] Generating 5 product images with Gemini 3 Pro...")
    images_uploaded = 0

    for i in range(1, 6):
        print(f"    Generating image {i}/5...", end=" ")
        gen_result = generate_product_image_gemini(product, ref_images, i)

        if gen_result['success']:
            upload_result = upload_image_to_shopify(
                product_id,
                gen_result['image_data'],
                position=i,
                alt_text=f"{product['name']} - View {i}"
            )
            if upload_result['success']:
                print("✓ Generated & uploaded")
                images_uploaded += 1
            else:
                print(f"✗ Upload failed: {upload_result['error'][:50]}")
        else:
            print(f"✗ Generation failed: {gen_result['error'][:50]}")

        time.sleep(2)  # Rate limiting

    # Step 4: Publish product
    print(f"  [4/4] Publishing product ({images_uploaded} images)...")
    if images_uploaded > 0:
        publish_product(product_id)
        print("  ✓ Product published!")
    else:
        print("  ⚠ Keeping as draft (no images)")

    return {
        "success": True,
        "product_id": product_id,
        "images": images_uploaded
    }


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Import Cloud YHS products to Shopify")
    parser.add_argument("--file", "-f", default="yhs_supply_products.xlsx", help="Excel file path")
    parser.add_argument("--start", "-s", type=int, default=0, help="Start from product index")
    parser.add_argument("--count", "-c", type=int, default=None, help="Number of products to process")
    parser.add_argument("--no-images", action="store_true", help="Skip image generation")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    parser.add_argument("--list", action="store_true", help="List all products and exit")

    args = parser.parse_args()

    # Load products
    print(f"\nLoading products from {args.file}...")
    products = load_products_from_excel(args.file)
    print(f"Found {len(products)} products")

    if args.list:
        for i, p in enumerate(products):
            print(f"{i+1:3}. {p['sku']:10} | ${p['retail_price']:6.2f} | {p['name'][:50]}")
        return

    # Select range
    end_idx = args.start + args.count if args.count else len(products)
    selected = products[args.start:end_idx]

    print(f"\nProcessing products {args.start+1} to {min(end_idx, len(products))} ({len(selected)} total)")

    if args.dry_run:
        print("\n[DRY RUN MODE - No changes will be made]")
        for p in selected:
            print(f"  Would create: {p['name']} (SKU: {p['sku']}) @ ${p['retail_price']:.2f}")
        return

    # Check credentials
    if not SHOPIFY_ACCESS_TOKEN:
        print("\nERROR: SHOPIFY_ACCESS_TOKEN environment variable not set")
        sys.exit(1)

    if not args.no_images and not GOOGLE_API_KEY:
        print("\nWARNING: GOOGLE_API_KEY not set - will skip image generation")
        args.no_images = True

    # Process products
    results = {"success": 0, "failed": 0, "total_images": 0}

    for i, product in enumerate(selected):
        print(f"\n[{i+1}/{len(selected)}]", end="")
        result = process_single_product(product, generate_images=not args.no_images)

        if result['success']:
            results['success'] += 1
            results['total_images'] += result.get('images', 0)
        else:
            results['failed'] += 1

        time.sleep(1)  # Rate limiting between products

    # Summary
    print(f"\n{'='*60}")
    print("IMPORT COMPLETE")
    print(f"{'='*60}")
    print(f"Products created: {results['success']}")
    print(f"Products failed: {results['failed']}")
    print(f"Total images generated: {results['total_images']}")


if __name__ == "__main__":
    main()

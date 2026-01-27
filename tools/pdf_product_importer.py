#!/usr/bin/env python3
"""
PDF Product Listing Importer
=============================
Creates Shopify product listings from 'products.pdf'.

Extracts product data AND images directly from the PDF.

Usage:
    python pdf_product_importer.py --dry-run
    python pdf_product_importer.py --execute
    python pdf_product_importer.py --execute --publish
"""

import os
import sys
import json
import time
import base64
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from io import BytesIO

import requests

try:
    import fitz  # PyMuPDF
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("Error: PyMuPDF required. Install: pip install PyMuPDF")
    sys.exit(1)

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("Warning: Pillow not installed. Image rotation disabled.")
    print("Install with: pip install Pillow")

# Configuration
SHOPIFY_STORE = os.environ.get("SHOPIFY_STORE", "oil-slick-pad.myshopify.com")
SHOPIFY_ACCESS_TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
SHOPIFY_API_VERSION = "2024-01"
SHOPIFY_BASE_URL = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}"
VENDOR_NAME = "Cloud YHS"

# Trademark replacements
TRADEMARK_REPLACEMENTS = {
    "scooby-doo": "Mystery Hound", "scooby doo": "Mystery Hound",
    "rick": "Mad Scientist", "morty": "Sidekick Kid",
    "homer": "Yellow Dad", "marge": "Blue Hair Mom",
    "bart": "Skateboard Kid", "simpsons": "Yellow Family",
    "mario": "Plumber Hero", "luigi": "Green Plumber",
    "sonic": "Speed Hedgehog", "yoda": "Wise Master",
    "minnie": "Bow Mouse", "mickey": "Classic Mouse",
    "lionel messi": "Soccer Legend", "messi": "GOAT Player",
    "spider-man": "Web Slinger", "spiderman": "Web Slinger",
    "alien spider-man": "Alien Web Slinger",
    "kuromi": "Dark Rabbit", "kitty": "Bow Cat",
    "kenny": "Hooded Kid", "labubu": "Forest Sprite",
    "gastly": "Ghost Spirit", "modi": "World Leader",
    "peter docter": "Emotion Guide", "sadness": "Blue Feeling",
}


def parse_pdf_with_layout(pdf_path: str) -> List[Dict]:
    """Parse PDF using layout analysis to extract product data correctly."""
    pdf = fitz.open(pdf_path)
    products = []

    for page_num in range(len(pdf)):
        page = pdf[page_num]

        # Get text blocks with position info
        blocks = page.get_text("dict")["blocks"]

        # Collect all text spans with positions
        text_items = []
        for b in blocks:
            if "lines" in b:
                for line in b["lines"]:
                    for span in line["spans"]:
                        text = span["text"].strip()
                        if text:
                            bbox = span["bbox"]
                            text_items.append({
                                "text": text,
                                "x": bbox[0],
                                "y": bbox[1],
                                "y2": bbox[3]
                            })

        # Sort by y position (rows)
        text_items.sort(key=lambda x: x["y"])

        # Group into rows (items within ~15 pixels vertically are same row)
        rows = []
        current_row = []
        current_y = -100

        for item in text_items:
            if abs(item["y"] - current_y) > 15:
                if current_row:
                    rows.append(current_row)
                current_row = [item]
                current_y = item["y"]
            else:
                current_row.append(item)

        if current_row:
            rows.append(current_row)

        # Process rows to extract products
        # Column positions (approximate):
        # Product name: x < 130
        # SKU: 130 < x < 200
        # Weight: 270 < x < 320
        # Specs: 320 < x < 420
        # Price: 420 < x < 500
        # Stock: x > 500

        i = 0
        while i < len(rows):
            row = rows[i]

            # Sort items in row by x position
            row.sort(key=lambda x: x["x"])

            # Look for SKU pattern in this row
            sku = None
            for item in row:
                if 130 < item["x"] < 200:
                    if re.match(r'^(CY\d+[A-Z\-]*|H\d+[A-Z\-]*|B\d+|E\d+|WS\d+|A\d+|P\d+|J\d+[A-Z]*)$', item["text"]):
                        sku = item["text"]
                        break

            if sku:
                # Found a product row - extract data
                product_name_parts = []
                weight = ""
                specs_parts = []
                price = 0.0
                stock = 0

                # Get data from this row
                for item in row:
                    x = item["x"]
                    text = item["text"]

                    if x < 130:  # Product name
                        product_name_parts.append(text)
                    elif 270 < x < 320:  # Weight
                        if re.match(r'^\d+\s*g$', text):
                            weight = text
                    elif 320 < x < 420:  # Specs
                        specs_parts.append(text)
                    elif 420 < x < 500:  # Price
                        price_match = re.match(r'^\$?(\d+\.?\d*)$', text)
                        if price_match:
                            price = float(price_match.group(1))
                    elif x > 500:  # Stock
                        stock_match = re.match(r'^(\d+)', text)
                        if stock_match:
                            stock = int(stock_match.group(1))

                # Check next row(s) for continuation of multi-line fields
                for j in range(i + 1, min(i + 3, len(rows))):
                    next_row = rows[j]
                    next_row.sort(key=lambda x: x["x"])

                    # Check if this is a continuation (no SKU in typical position)
                    has_sku = any(130 < item["x"] < 200 and
                                  re.match(r'^(CY|H|B|E|WS|A|P|J)\d+', item["text"])
                                  for item in next_row)

                    if has_sku:
                        break  # New product row

                    for item in next_row:
                        x = item["x"]
                        text = item["text"]

                        if x < 130:  # Product name continuation
                            if text.lower() not in ['product', 'no.', 'picture', 'weight', 'specs', 'stock']:
                                product_name_parts.append(text)
                        elif 320 < x < 420:  # Specs continuation
                            specs_parts.append(text)

                # Build product
                product_name = " ".join(product_name_parts).strip()
                specs = " ".join(specs_parts).strip()

                # Clean up product name
                product_name = re.sub(r'\s+', ' ', product_name)

                if product_name and sku and price > 0:
                    products.append({
                        'name': product_name,
                        'sku': sku,
                        'weight': weight,
                        'specs': specs,
                        'cost': price,
                        'retail_price': round(price * 2, 2),
                        'stock': stock
                    })

            i += 1

    pdf.close()
    return products


def extract_images_from_pdf(pdf_path: str, output_folder: str, rotate: bool = True) -> List[str]:
    """
    Extract images from PDF and save to folder in visual order (top-to-bottom).

    Args:
        pdf_path: Path to PDF file
        output_folder: Folder to save extracted images
        rotate: If True, auto-detect and fix inverted images based on PDF transform

    Returns list of image file paths (excluding logo).
    """
    output_path = Path(output_folder)
    output_path.mkdir(parents=True, exist_ok=True)

    pdf = fitz.open(pdf_path)

    # Collect all images with their visual positions
    all_images = []

    for page_num in range(len(pdf)):
        page = pdf[page_num]
        # Get image info with xrefs and positions
        info_list = page.get_image_info(xrefs=True)

        for info in info_list:
            xref = info.get('xref')
            if not xref:
                continue

            bbox = info['bbox']
            y_pos = bbox[1]
            x_pos = bbox[0]
            width = bbox[2] - bbox[0]

            # Get transform matrix to detect if image is flipped
            # Transform: (a, b, c, d, e, f) - if d is negative, image is vertically flipped
            transform = info.get('transform', (1, 0, 0, 1, 0, 0))
            is_flipped = transform[3] < 0 if len(transform) >= 4 else False

            all_images.append({
                'page': page_num,
                'y': y_pos,
                'x': x_pos,
                'width': width,
                'xref': xref,
                'is_flipped': is_flipped
            })

    # Sort by visual order: page first, then y position (top to bottom)
    all_images.sort(key=lambda img: (img['page'], img['y'], img['x']))

    # Extract images in visual order
    image_paths = []
    image_counter = 0

    for img_info in all_images:
        xref = img_info['xref']
        width = img_info['width']
        is_flipped = img_info['is_flipped']

        # Skip logo (wide image at top of page 1, width > 60px on page)
        if img_info['page'] == 0 and img_info['y'] < 100 and width > 60:
            continue

        try:
            base_image = pdf.extract_image(xref)
            image_bytes = base_image["image"]

            # Skip very small images
            if len(image_bytes) < 1000:
                continue

            image_filename = f"product_{image_counter:03d}.jpeg"
            image_path = output_path / image_filename

            # Rotate image 180 degrees if PDF transform indicates it's flipped
            if rotate and PIL_AVAILABLE and is_flipped:
                try:
                    img_pil = Image.open(BytesIO(image_bytes))
                    img_pil = img_pil.rotate(180, expand=True)

                    # Convert to RGB if needed
                    if img_pil.mode in ('RGBA', 'P'):
                        img_pil = img_pil.convert('RGB')

                    img_pil.save(str(image_path), 'JPEG', quality=95)
                except Exception as e:
                    # Fall back to saving without rotation
                    with open(image_path, 'wb') as f:
                        f.write(image_bytes)
            else:
                # Save without rotation
                with open(image_path, 'wb') as f:
                    f.write(image_bytes)

            image_paths.append(str(image_path))
            image_counter += 1

        except Exception as e:
            pass  # Skip problematic images

    pdf.close()
    return image_paths


def sanitize_title(title: str) -> str:
    """Make title trademark-safe."""
    result = title.lower()
    for tm, replacement in TRADEMARK_REPLACEMENTS.items():
        if tm in result:
            result = result.replace(tm, replacement.lower())

    words = result.split()
    small = {'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with'}
    return ' '.join(w.capitalize() if i == 0 or w not in small else w for i, w in enumerate(words))


def generate_creative_title(name: str, sku: str, specs: str) -> str:
    """Generate creative SEO title."""
    size_match = re.search(r"(\d+(?:\.\d+)?)[''\"]\s*", name)
    size = f'{size_match.group(1)}"' if size_match else ""

    base = sanitize_title(name)
    base = re.sub(r"^\d+(?:\.\d+)?[''\"]+\s*", "", base)
    base = re.sub(r'^"\s*', "", base)

    materials = []
    if specs:
        sl = specs.lower()
        if "glass" in sl: materials.append("Glass")
        if "silicone" in sl: materials.append("Silicone")
        if "pvc" in sl: materials.append("PVC")

    parts = []
    if size: parts.append(size)
    parts.append(base)
    if materials:
        mat_str = " + ".join(materials)
        if mat_str.lower() not in base.lower():
            parts.append(f"| {mat_str}")

    return " ".join(parts)


def generate_tags(product: Dict) -> str:
    """Generate taxonomy tags."""
    name = product['name'].lower()
    specs = (product.get('specs') or '').lower()
    tags = [f"vendor:{VENDOR_NAME}", f"sku:{product['sku']}"]

    if 'pvc' in specs: tags.append("material:pvc")
    if 'glass' in specs or 'glass' in name: tags.append("material:glass")
    if 'silicone' in specs or 'silicone' in name: tags.append("material:silicone")

    if 'water pipe' in name or 'bong' in name:
        tags.extend(["pillar:smokeshop-device", "family:glass-bong", "use:flower-smoking"])
    elif 'hand pipe' in name:
        tags.extend(["pillar:smokeshop-device", "family:spoon-pipe", "use:flower-smoking"])
    elif 'nectar collector' in name:
        tags.extend(["pillar:smokeshop-device", "family:nectar-collector", "use:dabbing"])
    elif 'battery' in name or 'cbd' in name:
        tags.extend(["pillar:smokeshop-device", "family:vape-battery", "use:vaping"])
    elif 'bowl' in name:
        tags.extend(["pillar:accessory", "family:flower-bowl", "use:flower-smoking"])
    elif 'dab tool' in name:
        tags.extend(["pillar:accessory", "family:dab-tool", "use:dabbing"])

    return ", ".join(tags)


def determine_product_type(name: str) -> str:
    """Determine Shopify product type."""
    nl = name.lower()
    if 'water pipe' in nl: return "Water Pipes"
    if 'hand pipe' in nl: return "Hand Pipes"
    if 'nectar collector' in nl: return "Nectar Collectors"
    if 'battery' in nl: return "Batteries & Devices"
    if 'bowl' in nl: return "Bowls & Slides"
    if 'dab tool' in nl: return "Dab Tools"
    if 'jar' in nl: return "Storage"
    if 'clip' in nl: return "Accessories"
    return "Smoke Shop Products"


def generate_pdp(product: Dict, title: str) -> str:
    """Generate structured PDP HTML."""
    specs = product.get('specs', '')
    materials = []
    if specs:
        if 'glass' in specs.lower(): materials.append("Borosilicate Glass")
        if 'silicone' in specs.lower(): materials.append("Food-Grade Silicone")
        if 'pvc' in specs.lower(): materials.append("Premium PVC")
    mat_str = ", ".join(materials) if materials else "Quality Materials"

    dims = ""
    m = re.search(r'(\d+)\s*\*\s*(\d+)(?:\s*\*\s*(\d+))?', specs or '')
    if m:
        dims = f"{m.group(1)} x {m.group(2)}"
        if m.group(3): dims += f" x {m.group(3)}"
        dims += " mm"

    return f"""
<div class="product-brief">
<table style="width:100%;border-collapse:collapse;margin-bottom:15px">
<tr style="background:#343a40;color:white"><th colspan="2" style="padding:10px;text-align:left">Product Info</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:8px;font-weight:bold">Title</td><td style="padding:8px">{title}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:8px;font-weight:bold">Original</td><td style="padding:8px">{product['name']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:8px;font-weight:bold">SKU</td><td style="padding:8px"><code>{product['sku']}</code></td></tr>
</table>

<table style="width:100%;border-collapse:collapse;margin-bottom:15px">
<tr style="background:#17a2b8;color:white"><th colspan="2" style="padding:10px;text-align:left">Pricing</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:8px;font-weight:bold">Cost</td><td style="padding:8px">${product['cost']:.2f}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:8px;font-weight:bold">Retail</td><td style="padding:8px;font-size:18px;color:#28a745"><strong>${product['retail_price']:.2f}</strong></td></tr>
</table>

<table style="width:100%;border-collapse:collapse;margin-bottom:15px">
<tr style="background:#6c757d;color:white"><th colspan="2" style="padding:10px;text-align:left">Specs</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:8px;font-weight:bold">Materials</td><td style="padding:8px">{mat_str}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:8px;font-weight:bold">Dimensions</td><td style="padding:8px">{dims if dims else 'See specs'}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:8px;font-weight:bold">Weight</td><td style="padding:8px">{product.get('weight') or 'N/A'}</td></tr>
</table>

<div style="background:#d4edda;padding:15px;border-radius:5px">
<strong>Stock:</strong> {product.get('stock', 'N/A')} units | <strong>Vendor:</strong> {VENDOR_NAME}
</div>
</div>
"""


def upload_image(product_id: int, image_path: str, alt: str) -> Dict:
    """Upload image to Shopify."""
    with open(image_path, 'rb') as f:
        data = base64.b64encode(f.read()).decode()

    resp = requests.post(
        f"{SHOPIFY_BASE_URL}/products/{product_id}/images.json",
        headers={"X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json"},
        json={"image": {"attachment": data, "position": 1, "alt": alt}},
        timeout=60
    )
    return {"success": resp.status_code in [200, 201]}


def create_product(product: Dict, title: str, pdp: str) -> Dict:
    """Create Shopify product."""
    payload = {
        "product": {
            "title": title,
            "body_html": pdp,
            "vendor": VENDOR_NAME,
            "product_type": determine_product_type(product['name']),
            "tags": generate_tags(product),
            "status": "draft",
            "variants": [{
                "price": str(product['retail_price']),
                "sku": product['sku'],
                "inventory_management": "shopify",
                "inventory_quantity": product['stock'],
                "weight": float(product['weight'].replace('g', '').strip()) if product.get('weight') and 'g' in product['weight'] else 0,
                "weight_unit": "g"
            }]
        }
    }

    resp = requests.post(
        f"{SHOPIFY_BASE_URL}/products.json",
        headers={"X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json"},
        json=payload, timeout=30
    )

    if resp.status_code in [200, 201]:
        result = resp.json()
        pid = result["product"]["id"]
        vid = result["product"]["variants"][0]["id"]

        # Update cost
        time.sleep(0.5)
        vresp = requests.get(f"{SHOPIFY_BASE_URL}/variants/{vid}.json",
                             headers={"X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN}, timeout=30)
        if vresp.status_code == 200:
            iid = vresp.json()["variant"]["inventory_item_id"]
            requests.put(f"{SHOPIFY_BASE_URL}/inventory_items/{iid}.json",
                         headers={"X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json"},
                         json={"inventory_item": {"cost": str(product['cost'])}}, timeout=30)

        return {"success": True, "product_id": pid, "title": result["product"]["title"]}
    return {"success": False, "error": resp.text[:200]}


def publish_product(pid: int):
    """Publish product."""
    requests.put(f"{SHOPIFY_BASE_URL}/products/{pid}.json",
                 headers={"X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json"},
                 json={"product": {"id": pid, "status": "active"}}, timeout=30)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Import products from PDF")
    parser.add_argument("--file", "-f", default="products.pdf")
    parser.add_argument("--start", "-s", type=int, default=0)
    parser.add_argument("--count", "-c", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--rotate", dest="rotate", action="store_true", default=True,
                        help="Rotate images 180° (default: enabled)")
    parser.add_argument("--no-rotate", dest="rotate", action="store_false",
                        help="Disable image rotation")
    args = parser.parse_args()

    print(f"\n{'='*60}\nPDF PRODUCT IMPORTER\n{'='*60}")

    # Parse products
    print(f"\nParsing: {args.file}")
    products = parse_pdf_with_layout(args.file)
    print(f"Found {len(products)} products")

    # Extract images (sorted by visual position, logo excluded)
    img_folder = "pdf_extracted_images"
    rotate_msg = "(with auto-rotation)" if args.rotate else "(no rotation)"
    print(f"Extracting images {rotate_msg}...")
    images = extract_images_from_pdf(args.file, img_folder, rotate=args.rotate)
    print(f"Extracted {len(images)} product images")

    # Match images to products (1:1 since logo is already excluded)
    for i, p in enumerate(products):
        p['image_path'] = images[i] if i < len(images) else None

    if args.list:
        print(f"\n{'='*60}\nPRODUCTS\n{'='*60}")
        for i, p in enumerate(products):
            img = "IMG" if p.get('image_path') else "   "
            print(f"{i+1:3}. [{img}] {p['sku']:10} ${p['retail_price']:7.2f} | {p['name'][:45]}")
        return

    # Select range
    end = args.start + args.count if args.count else len(products)
    selected = products[args.start:end]
    print(f"\nProcessing {len(selected)} products ({args.start+1} to {min(end, len(products))})")

    if args.dry_run or not args.execute:
        print(f"\n{'='*60}\nDRY RUN\n{'='*60}")
        for i, p in enumerate(selected):
            title = generate_creative_title(p['name'], p['sku'], p.get('specs', ''))
            img = "Yes" if p.get('image_path') else "No"
            print(f"\n[{i+1}] {p['sku']}")
            print(f"  Name: {p['name']}")
            print(f"  Title: {title}")
            print(f"  Cost: ${p['cost']:.2f} → Retail: ${p['retail_price']:.2f}")
            print(f"  Image: {img}")
        print(f"\n{'='*60}\nRun with --execute to create\n{'='*60}")
        return

    if not SHOPIFY_ACCESS_TOKEN:
        print("ERROR: SHOPIFY_ACCESS_TOKEN not set")
        sys.exit(1)

    print(f"\n{'='*60}\nCREATING PRODUCTS\n{'='*60}")
    results = {"success": 0, "failed": 0}

    for i, p in enumerate(selected):
        print(f"\n[{i+1}/{len(selected)}] {p['sku']}: {p['name'][:40]}")

        title = generate_creative_title(p['name'], p['sku'], p.get('specs', ''))
        pdp = generate_pdp(p, title)

        result = create_product(p, title, pdp)
        if result['success']:
            pid = result['product_id']
            print(f"  Created: {pid}")

            if p.get('image_path') and os.path.exists(p['image_path']):
                if upload_image(pid, p['image_path'], title)['success']:
                    print(f"  Image uploaded")

            if args.publish:
                publish_product(pid)
                print(f"  Published")

            results['success'] += 1
        else:
            print(f"  FAILED: {result.get('error', 'Unknown')}")
            results['failed'] += 1

        time.sleep(1)

    print(f"\n{'='*60}\nDONE: {results['success']} created, {results['failed']} failed\n{'='*60}")


if __name__ == "__main__":
    main()

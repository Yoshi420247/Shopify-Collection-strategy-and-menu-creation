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
SHOPIFY_STORE = os.environ.get("SHOPIFY_STORE_URL") or os.environ.get("SHOPIFY_STORE", "oil-slick-pad.myshopify.com")
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
    """
    Generate comprehensive PDP content optimized for LLM description writers.

    This PDP provides all necessary details for an AI/LLM to write an excellent
    product description following e-commerce best practices and SEO optimization.

    Note: Cost/pricing info is stored in Shopify's inventory system, NOT in the PDP.
    """
    name = product['name']
    sku = product['sku']
    specs = product.get('specs', '')
    weight = product.get('weight', '')

    # === PRODUCT CLASSIFICATION ===
    product_type = determine_product_type(name)
    product_category = _classify_product_category(name)

    # === CHARACTER/THEME ANALYSIS ===
    character_info = _extract_character_info(name)

    # === MATERIALS ANALYSIS ===
    materials_detail = _analyze_materials(specs, name)

    # === DIMENSIONS ===
    dims_mm, dims_inches = _parse_dimensions(specs)
    height_info = _extract_height(name)

    # === COLORS ===
    colors = _extract_colors(name, specs)

    # === KEY FEATURES ===
    features = _generate_features(name, specs, product_type)

    # === USAGE & CARE ===
    usage_info = _get_usage_info(product_type)

    # === SEO KEYWORDS ===
    seo_keywords = _generate_seo_keywords(name, product_type, materials_detail, character_info)

    # === BUILD THE PDP HTML ===
    return f"""
<div class="pdp-content" data-sku="{sku}">

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 1: PRODUCT IDENTIFICATION
     Core product details for the description writer
═══════════════════════════════════════════════════════════════════════════ -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<tr style="background:#1a1a2e;color:#eee"><th colspan="2" style="padding:12px;text-align:left;font-size:14px">📦 PRODUCT IDENTIFICATION</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold;width:35%">Creative Title</td><td style="padding:10px">{title}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Original Vendor Name</td><td style="padding:10px">{name}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold">SKU</td><td style="padding:10px"><code style="background:#e9ecef;padding:2px 6px;border-radius:3px">{sku}</code></td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Product Type</td><td style="padding:10px">{product_type}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold">Category</td><td style="padding:10px">{product_category}</td></tr>
</table>

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 2: CHARACTER/THEME DETAILS
     For themed/character pieces - essential for creative descriptions
═══════════════════════════════════════════════════════════════════════════ -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<tr style="background:#16213e;color:#eee"><th colspan="2" style="padding:12px;text-align:left;font-size:14px">🎭 CHARACTER & THEME</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold;width:35%">Theme Type</td><td style="padding:10px">{character_info['theme_type']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Character Description</td><td style="padding:10px">{character_info['description']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold">Visual Elements</td><td style="padding:10px">{character_info['visual_elements']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Mood/Vibe</td><td style="padding:10px">{character_info['mood']}</td></tr>
</table>

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 3: PHYSICAL SPECIFICATIONS
     Detailed specs for accurate product descriptions
═══════════════════════════════════════════════════════════════════════════ -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<tr style="background:#0f3460;color:#eee"><th colspan="2" style="padding:12px;text-align:left;font-size:14px">📐 PHYSICAL SPECIFICATIONS</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold;width:35%">Height</td><td style="padding:10px">{height_info}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Dimensions (mm)</td><td style="padding:10px">{dims_mm}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold">Dimensions (inches)</td><td style="padding:10px">{dims_inches}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Weight</td><td style="padding:10px">{weight if weight else 'Not specified'}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold">Colors</td><td style="padding:10px">{', '.join(colors) if colors else 'See product image'}</td></tr>
</table>

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 4: MATERIALS & CONSTRUCTION
     Quality indicators and material details
═══════════════════════════════════════════════════════════════════════════ -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<tr style="background:#1a1a2e;color:#eee"><th colspan="2" style="padding:12px;text-align:left;font-size:14px">🔧 MATERIALS & CONSTRUCTION</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold;width:35%">Primary Materials</td><td style="padding:10px">{materials_detail['primary']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Material Benefits</td><td style="padding:10px">{materials_detail['benefits']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold">Construction Quality</td><td style="padding:10px">{materials_detail['quality']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Raw Specs</td><td style="padding:10px"><code style="background:#e9ecef;padding:2px 6px;border-radius:3px;font-size:12px">{specs if specs else 'N/A'}</code></td></tr>
</table>

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 5: KEY FEATURES
     Selling points and unique attributes
═══════════════════════════════════════════════════════════════════════════ -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<tr style="background:#16213e;color:#eee"><th colspan="2" style="padding:12px;text-align:left;font-size:14px">⭐ KEY FEATURES & SELLING POINTS</th></tr>
<tr><td colspan="2" style="padding:15px">
<ul style="margin:0;padding-left:20px;line-height:1.8">
{''.join(f'<li>{f}</li>' for f in features)}
</ul>
</td></tr>
</table>

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 6: USAGE & CARE
     Practical information for customers
═══════════════════════════════════════════════════════════════════════════ -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<tr style="background:#0f3460;color:#eee"><th colspan="2" style="padding:12px;text-align:left;font-size:14px">💡 USAGE & CARE</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold;width:35%">Intended Use</td><td style="padding:10px">{usage_info['use']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Experience Level</td><td style="padding:10px">{usage_info['level']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold">Cleaning</td><td style="padding:10px">{usage_info['cleaning']}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Care Tips</td><td style="padding:10px">{usage_info['care']}</td></tr>
</table>

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 7: SEO & CONTENT OPTIMIZATION
     Keywords and phrases for search optimization
═══════════════════════════════════════════════════════════════════════════ -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<tr style="background:#1a1a2e;color:#eee"><th colspan="2" style="padding:12px;text-align:left;font-size:14px">🔍 SEO KEYWORDS & PHRASES</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold;width:35%">Primary Keywords</td><td style="padding:10px">{', '.join(seo_keywords['primary'])}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:10px;font-weight:bold">Long-tail Keywords</td><td style="padding:10px">{', '.join(seo_keywords['longtail'])}</td></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:10px;font-weight:bold">Related Terms</td><td style="padding:10px">{', '.join(seo_keywords['related'])}</td></tr>
</table>

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 8: LLM DESCRIPTION WRITER INSTRUCTIONS
     Guidelines for AI-generated product descriptions
═══════════════════════════════════════════════════════════════════════════ -->
<div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:20px;border-radius:8px;margin-bottom:20px">
<h3 style="margin-top:0;border-bottom:2px solid rgba(255,255,255,0.3);padding-bottom:10px">📝 DESCRIPTION WRITER INSTRUCTIONS</h3>

<p><strong>Brand Voice:</strong> Oil Slick is a premium cannabis accessories retailer. Write with confidence, creativity, and a touch of playfulness. Appeal to collectors and enthusiasts who appreciate unique, artistic pieces.</p>

<p><strong>Tone:</strong> Enthusiastic but informative. Balance fun character descriptions with practical product details. Avoid being overly formal or using stiff corporate language.</p>

<p><strong>Content Structure (Recommended for ~800 words):</strong></p>
<ol style="margin:10px 0;padding-left:25px">
<li><strong>Hook</strong> - Attention-grabbing opening about the character/theme (2-3 sentences)</li>
<li><strong>Character Story</strong> - Rich creative narrative about the themed design, its personality, and visual appeal (100-150 words)</li>
<li><strong>Design Details</strong> - Describe the artistic elements, colors, textures, and craftsmanship (75-100 words)</li>
<li><strong>Product Features</strong> - Key benefits, functionality, and quality points with detail (100-150 words)</li>
<li><strong>Materials Deep-Dive</strong> - Explain material benefits, durability, and why they matter (75-100 words)</li>
<li><strong>User Experience</strong> - How it feels to use, the experience it provides (50-75 words)</li>
<li><strong>Specifications</strong> - Size, dimensions, weight with context (50-75 words)</li>
<li><strong>Collector Appeal</strong> - Why this piece stands out, limited nature, display-worthy qualities (50-75 words)</li>
<li><strong>Call to Action</strong> - Strong close encouraging purchase, gift potential, collection addition (25-50 words)</li>
</ol>

<p><strong>DO Include:</strong></p>
<ul style="margin:5px 0;padding-left:25px">
<li>Creative character descriptions using the trademark-safe names</li>
<li>Material quality benefits (durability, heat resistance, etc.)</li>
<li>Size context ("perfect for..." or "impressive tabletop presence")</li>
<li>Collector/enthusiast appeal</li>
<li>Sensory details (colors, textures, visual impact)</li>
</ul>

<p><strong>DO NOT Include:</strong></p>
<ul style="margin:5px 0;padding-left:25px">
<li>❌ Original trademarked character names (use creative titles only)</li>
<li>❌ Pricing or cost information</li>
<li>❌ Health claims or medical benefits</li>
<li>❌ Comparisons to competitor products</li>
<li>❌ Shipping or delivery promises</li>
<li>❌ Claims about legality in specific regions</li>
</ul>

<p><strong>Target Length:</strong> 750-850 words for main description. Create rich, detailed content that thoroughly covers the product's character story, features, materials, and appeal to collectors.</p>

<p><strong>Meta Description (generate separately):</strong> 150-160 characters, include product type + key feature + character theme</p>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     SECTION 9: INVENTORY & VENDOR INFO (Internal Reference)
═══════════════════════════════════════════════════════════════════════════ -->
<table style="width:100%;border-collapse:collapse;margin-bottom:10px;opacity:0.7">
<tr style="background:#6c757d;color:white"><th colspan="2" style="padding:10px;text-align:left;font-size:12px">📋 INTERNAL REFERENCE</th></tr>
<tr style="border-bottom:1px solid #dee2e6"><td style="padding:8px;font-weight:bold;width:35%;font-size:12px">Vendor</td><td style="padding:8px;font-size:12px">{VENDOR_NAME}</td></tr>
<tr style="border-bottom:1px solid #dee2e6;background:#f8f9fa"><td style="padding:8px;font-weight:bold;font-size:12px">Stock Level</td><td style="padding:8px;font-size:12px">{product.get('stock', 'N/A')} units</td></tr>
</table>

</div>
"""


# === HELPER FUNCTIONS FOR PDP GENERATION ===

def _classify_product_category(name: str) -> str:
    """Classify product into broader categories."""
    nl = name.lower()
    if any(x in nl for x in ['water pipe', 'bong']):
        return "Water Pipes & Bongs"
    elif 'hand pipe' in nl:
        return "Hand Pipes & Spoons"
    elif 'nectar collector' in nl:
        return "Nectar Collectors & Dab Straws"
    elif any(x in nl for x in ['dab rig', 'rig']):
        return "Dab Rigs & Concentrates"
    elif 'bowl' in nl:
        return "Bowls & Slides"
    elif 'battery' in nl:
        return "Vape Batteries & Devices"
    return "Smoking Accessories"


def _extract_character_info(name: str) -> Dict[str, str]:
    """Extract and describe character/theme information."""
    nl = name.lower()

    # Character mappings with descriptions
    characters = {
        'baseball': {'theme': 'Sports/Baseball', 'desc': 'Athletic baseball player character with team uniform and cap', 'visual': 'Sports jersey, baseball cap, athletic pose', 'mood': 'Energetic, competitive, sporty'},
        'alien': {'theme': 'Sci-Fi/Space', 'desc': 'Extraterrestrial creature with otherworldly features', 'visual': 'Futuristic design, unusual proportions, space-age aesthetic', 'mood': 'Mysterious, intriguing, out-of-this-world'},
        'mechanical': {'theme': 'Sci-Fi/Robot', 'desc': 'Robotic mechanical being with industrial elements', 'visual': 'Metal textures, mechanical parts, industrial design', 'mood': 'Futuristic, industrial, tech-forward'},
        'eggplant': {'theme': 'Food/Vegetable', 'desc': 'Anthropomorphic eggplant character with playful personality', 'visual': 'Purple coloring, vegetable-inspired shape, expressive features', 'mood': 'Playful, quirky, conversation-starter'},
        'cake': {'theme': 'Food/Dessert', 'desc': 'Sweet dessert-themed character with confectionery details', 'visual': 'Pastel colors, frosting textures, sweet decorations', 'mood': 'Sweet, whimsical, delightful'},
        'mouse': {'theme': 'Animal/Cute', 'desc': 'Adorable mouse character with charming details', 'visual': 'Big ears, cute expression, detailed outfit', 'mood': 'Cute, endearing, collectible'},
        'cat': {'theme': 'Animal/Feline', 'desc': 'Feline character with distinctive cat features', 'visual': 'Cat ears, whiskers, elegant feline pose', 'mood': 'Sleek, mysterious, independent'},
        'dog': {'theme': 'Animal/Canine', 'desc': 'Loyal canine companion character', 'visual': 'Dog features, friendly expression, loyal stance', 'mood': 'Friendly, loyal, approachable'},
        'husky': {'theme': 'Animal/Dog Breed', 'desc': 'Majestic husky dog with striking features', 'visual': 'Blue eyes, thick fur texture, wolf-like appearance', 'mood': 'Majestic, wild, adventurous'},
        'zombie': {'theme': 'Horror/Undead', 'desc': 'Undead creature with spooky zombie aesthetics', 'visual': 'Decayed textures, horror elements, undead features', 'mood': 'Spooky, edgy, Halloween-ready'},
        'shark': {'theme': 'Ocean/Predator', 'desc': 'Fearsome shark character with oceanic theme', 'visual': 'Sharp teeth, fin details, ocean blue accents', 'mood': 'Fierce, powerful, bold'},
        'dolphin': {'theme': 'Ocean/Marine', 'desc': 'Playful dolphin with aquatic charm', 'visual': 'Smooth curves, ocean colors, friendly appearance', 'mood': 'Playful, intelligent, aquatic'},
        'soccer': {'theme': 'Sports/Soccer', 'desc': 'Soccer/football themed character or design', 'visual': 'Soccer ball elements, athletic wear, goal-scoring pose', 'mood': 'Competitive, global appeal, sporty'},
        'flower': {'theme': 'Nature/Botanical', 'desc': 'Floral or plant-inspired design', 'visual': 'Petal details, natural colors, organic shapes', 'mood': 'Natural, peaceful, botanical'},
        'skull': {'theme': 'Edgy/Gothic', 'desc': 'Skull or skeleton themed design', 'visual': 'Bone textures, dark aesthetic, detailed cranium', 'mood': 'Edgy, bold, statement piece'},
        'octopus': {'theme': 'Ocean/Cephalopod', 'desc': 'Eight-armed sea creature with intricate details', 'visual': 'Tentacles, suction cups, deep sea colors', 'mood': 'Mysterious, intelligent, unique'},
        'knight': {'theme': 'Fantasy/Medieval', 'desc': 'Armored warrior from medieval times', 'visual': 'Armor details, sword/shield, heroic pose', 'mood': 'Noble, brave, legendary'},
        'witch': {'theme': 'Fantasy/Magic', 'desc': 'Magical witch character with mystical elements', 'visual': 'Pointed hat, magical accessories, mystical aura', 'mood': 'Magical, mysterious, enchanting'},
        'mummy': {'theme': 'Horror/Egyptian', 'desc': 'Ancient wrapped figure with Egyptian mystique', 'visual': 'Bandage wrappings, ancient symbols, tomb aesthetic', 'mood': 'Ancient, mysterious, archaeological'},
        'referee': {'theme': 'Sports/Official', 'desc': 'Sports official with authoritative presence', 'visual': 'Striped uniform, whistle, official stance', 'mood': 'Authoritative, fair, sports-themed'},
        'penguin': {'theme': 'Animal/Arctic', 'desc': 'Adorable tuxedo-wearing arctic bird', 'visual': 'Black and white coloring, waddling pose, cute features', 'mood': 'Adorable, cool, charming'},
        'couple': {'theme': 'Romantic/Artistic', 'desc': 'Romantic pair or artistic duo design', 'visual': 'Two figures, romantic pose, artistic styling', 'mood': 'Romantic, artistic, meaningful'},
        'hand': {'theme': 'Mystical/Fortune', 'desc': 'Mystical hand design with fortune-telling vibes', 'visual': 'Ornate hand, mystical symbols, crystal ball elements', 'mood': 'Mystical, fortune-telling, spiritual'},
        'light': {'theme': 'LED/Illuminated', 'desc': 'Features LED lighting for visual effect', 'visual': 'Glowing elements, color-changing lights, illuminated design', 'mood': 'Modern, eye-catching, party-ready'},
    }

    # Find matching character
    for key, info in characters.items():
        if key in nl:
            return {
                'theme_type': info['theme'],
                'description': info['desc'],
                'visual_elements': info['visual'],
                'mood': info['mood']
            }

    # Default for unrecognized themes
    return {
        'theme_type': 'Artistic/Novelty',
        'description': 'Unique artistic design with creative character elements',
        'visual_elements': 'Distinctive styling, artistic details, conversation piece',
        'mood': 'Creative, unique, collectible'
    }


def _analyze_materials(specs: str, name: str) -> Dict[str, str]:
    """Analyze and describe materials in detail."""
    sl = (specs + ' ' + name).lower()
    materials = []
    benefits = []
    quality_notes = []

    if 'glass' in sl:
        materials.append("Borosilicate Glass")
        benefits.append("Heat-resistant, durable, easy to clean")
        quality_notes.append("Laboratory-grade glass construction")

    if 'silicone' in sl:
        materials.append("Food-Grade Silicone")
        benefits.append("Flexible, virtually unbreakable, travel-friendly")
        quality_notes.append("FDA-approved silicone material")

    if 'pvc' in sl:
        materials.append("Premium PVC")
        benefits.append("Lightweight, durable, detailed molding capability")
        quality_notes.append("High-quality PVC for intricate designs")

    if 'ceramic' in sl:
        materials.append("Ceramic")
        benefits.append("Excellent heat distribution, artistic finish")
        quality_notes.append("Handcrafted ceramic construction")

    if 'metal' in sl or 'steel' in sl:
        materials.append("Stainless Steel")
        benefits.append("Corrosion-resistant, long-lasting, premium feel")
        quality_notes.append("High-grade metal components")

    if not materials:
        materials = ["Quality Mixed Materials"]
        benefits = ["Durable construction, designed for regular use"]
        quality_notes = ["Carefully selected materials for optimal performance"]

    return {
        'primary': ', '.join(materials),
        'benefits': '; '.join(benefits),
        'quality': ' | '.join(quality_notes)
    }


def _parse_dimensions(specs: str) -> tuple:
    """Parse dimensions and convert to both mm and inches."""
    if not specs:
        return 'Not specified', 'Not specified'

    m = re.search(r'(\d+)\s*\*\s*(\d+)(?:\s*\*\s*(\d+))?', specs)
    if m:
        dims = [int(m.group(1)), int(m.group(2))]
        if m.group(3):
            dims.append(int(m.group(3)))

        mm_str = ' × '.join(f'{d}mm' for d in dims)
        inches = [round(d / 25.4, 1) for d in dims]
        inch_str = ' × '.join(f'{i}"' for i in inches)

        return mm_str, inch_str

    return 'See specifications', 'See specifications'


def _extract_height(name: str) -> str:
    """Extract height from product name."""
    m = re.search(r"(\d+(?:\.\d+)?)[''\"]\s*", name)
    if m:
        inches = float(m.group(1))
        cm = round(inches * 2.54, 1)
        return f'{inches}" ({cm} cm) tall'
    return 'See dimensions'


def _extract_colors(name: str, specs: str) -> List[str]:
    """Extract color information from name and specs."""
    text = (name + ' ' + specs).lower()
    colors = []

    color_map = {
        'pink': 'Pink', 'blue': 'Blue', 'green': 'Green', 'red': 'Red',
        'purple': 'Purple', 'yellow': 'Yellow', 'orange': 'Orange',
        'black': 'Black', 'white': 'White', 'gold': 'Gold', 'silver': 'Silver',
        'gray': 'Gray', 'grey': 'Gray', 'brown': 'Brown', 'clear': 'Clear/Transparent'
    }

    for key, value in color_map.items():
        if key in text and value not in colors:
            colors.append(value)

    return colors if colors else []


def _generate_features(name: str, specs: str, product_type: str) -> List[str]:
    """Generate key features list based on product info."""
    features = []
    nl = name.lower()
    sl = specs.lower() if specs else ''

    # Character/theme feature
    features.append("Unique artistic character design - perfect conversation starter")

    # Size feature
    m = re.search(r"(\d+(?:\.\d+)?)[''\"]\s*", name)
    if m:
        size = float(m.group(1))
        if size >= 10:
            features.append(f"Impressive {size}-inch height - commanding tabletop presence")
        elif size >= 7:
            features.append(f"Classic {size}-inch size - perfect balance of portability and performance")
        else:
            features.append(f"Compact {size}-inch design - travel-friendly and discreet")

    # Material features
    if 'glass' in sl:
        features.append("Borosilicate glass construction - heat-resistant and easy to clean")
    if 'silicone' in sl:
        features.append("Silicone components - virtually unbreakable for worry-free use")
    if 'pvc' in sl:
        features.append("Detailed PVC character work - intricate artistic detailing")

    # Special features
    if 'light' in nl or 'led' in nl:
        features.append("Built-in LED lighting - stunning visual effects")

    # Product type specific features
    if 'water pipe' in nl or product_type == 'Water Pipes':
        features.append("Smooth water filtration for comfortable draws")
        features.append("Removable bowl for easy packing and cleaning")

    features.append("Collectible quality - limited artistic piece for enthusiasts")

    return features


def _get_usage_info(product_type: str) -> Dict[str, str]:
    """Get usage and care information based on product type."""
    base_info = {
        'Water Pipes': {
            'use': 'Dry herb consumption with water filtration',
            'level': 'All experience levels - smooth, filtered draws',
            'cleaning': 'Rinse with warm water after each use. Deep clean weekly with isopropyl alcohol and salt',
            'care': 'Handle with care, store upright, change water regularly for best taste'
        },
        'Hand Pipes': {
            'use': 'Dry herb consumption - portable option',
            'level': 'Beginner-friendly, great for on-the-go',
            'cleaning': 'Regular cleaning with isopropyl alcohol and pipe cleaners',
            'care': 'Store in padded case, avoid drops on hard surfaces'
        },
        'Nectar Collectors': {
            'use': 'Concentrate consumption with precision heating',
            'level': 'Intermediate to advanced - requires torch or e-nail',
            'cleaning': 'Clean tip after each use, soak in isopropyl for deep clean',
            'care': 'Allow tip to cool completely before storage'
        }
    }

    return base_info.get(product_type, {
        'use': 'Smoking accessory for adult consumers',
        'level': 'Suitable for all experience levels',
        'cleaning': 'Clean regularly with appropriate cleaning solutions',
        'care': 'Handle with care, store in safe location'
    })


def _generate_seo_keywords(name: str, product_type: str, materials: Dict, character_info: Dict) -> Dict[str, List[str]]:
    """Generate SEO keywords for the product."""
    nl = name.lower()

    primary = [product_type.lower()]
    if 'water pipe' in nl:
        primary.extend(['water pipe', 'bong', 'glass bong'])
    elif 'hand pipe' in nl:
        primary.extend(['hand pipe', 'spoon pipe', 'glass pipe'])

    # Add material keywords
    if 'glass' in materials['primary'].lower():
        primary.append('glass')
    if 'silicone' in materials['primary'].lower():
        primary.append('silicone')

    # Long-tail keywords
    longtail = []
    theme = character_info['theme_type'].lower()
    if 'character' in theme or 'animal' in theme or 'food' in theme:
        longtail.append(f"novelty {product_type.lower()}")
        longtail.append(f"character {product_type.lower()}")
        longtail.append(f"unique {product_type.lower()}")
    longtail.append(f"artistic {product_type.lower()}")
    longtail.append(f"collectible {product_type.lower()}")

    # Related terms
    related = ['smoking accessories', 'head shop', 'smoke shop', '420 accessories',
               'cannabis accessories', 'novelty pipe', 'gift for smoker']

    return {
        'primary': primary[:5],
        'longtail': longtail[:4],
        'related': related[:6]
    }


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


def get_product_positions(pdf_path: str) -> List[Dict]:
    """Get products with their page and y-position for matching."""
    pdf = fitz.open(pdf_path)
    products_with_pos = []

    for page_num in range(len(pdf)):
        page = pdf[page_num]
        blocks = page.get_text("dict")["blocks"]

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
                            })

        # Find SKUs with positions
        for item in text_items:
            if 130 < item["x"] < 200:
                if re.match(r'^(CY\d+[A-Z\-]*|H\d+[A-Z\-]*|B\d+|E\d+|WS\d+|A\d+|P\d+|J\d+[A-Z]*)$', item["text"]):
                    products_with_pos.append({
                        'sku': item["text"],
                        'page': page_num,
                        'y': item["y"]
                    })

    pdf.close()

    # Remove duplicate SKUs (keep first occurrence)
    seen = set()
    unique = []
    for p in products_with_pos:
        if p['sku'] not in seen:
            seen.add(p['sku'])
            unique.append(p)

    return unique


def match_images_to_products(pdf_path: str, products: List[Dict], image_paths: List[str], rotate: bool = True) -> None:
    """
    Match images to products based on page and y-position proximity.

    This handles cases where there are extra images without corresponding products
    by matching each product to the closest image on the same page.
    """
    pdf = fitz.open(pdf_path)

    # Collect all images with their page and position info
    all_images = []
    for page_num in range(len(pdf)):
        page = pdf[page_num]
        info_list = page.get_image_info(xrefs=True)

        for info in info_list:
            xref = info.get('xref')
            if not xref:
                continue

            bbox = info['bbox']
            y_pos = bbox[1]
            width = bbox[2] - bbox[0]

            # Skip logo
            if page_num == 0 and y_pos < 100 and width > 60:
                continue

            # Check image size
            try:
                base_image = pdf.extract_image(xref)
                if len(base_image["image"]) < 1000:
                    continue
            except:
                continue

            all_images.append({
                'page': page_num,
                'y': y_pos,
                'xref': xref
            })

    pdf.close()

    # Sort images by page then y position
    all_images.sort(key=lambda img: (img['page'], img['y']))

    # Get product positions
    product_positions = get_product_positions(pdf_path)

    # Create a mapping from SKU to product index
    sku_to_idx = {p['sku']: i for i, p in enumerate(products)}

    # Match each product to the closest image on the same page
    used_image_indices = set()

    for prod_pos in product_positions:
        sku = prod_pos['sku']
        prod_page = prod_pos['page']
        prod_y = prod_pos['y']

        if sku not in sku_to_idx:
            continue

        prod_idx = sku_to_idx[sku]

        # Find the closest unused image on the same page
        best_img_idx = None
        best_distance = float('inf')

        for img_idx, img in enumerate(all_images):
            if img_idx in used_image_indices:
                continue
            if img['page'] != prod_page:
                continue

            distance = abs(img['y'] - prod_y)
            if distance < best_distance:
                best_distance = distance
                best_img_idx = img_idx

        # Assign image if found (within reasonable distance)
        if best_img_idx is not None and best_distance < 200:
            used_image_indices.add(best_img_idx)
            # Map the image index to the image path
            if best_img_idx < len(image_paths):
                products[prod_idx]['image_path'] = image_paths[best_img_idx]
        else:
            products[prod_idx]['image_path'] = None


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

    # Match images to products using position-based matching
    # This handles extra images that don't correspond to any product
    print("Matching images to products by position...")
    match_images_to_products(args.file, products, images, rotate=args.rotate)

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

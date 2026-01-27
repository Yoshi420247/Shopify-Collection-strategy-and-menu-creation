#!/usr/bin/env python3
"""
Cloud YHS Product Listing Importer
===================================
Creates detailed Shopify product listings from the 'products conv 1.xls' spreadsheet.

Features:
- Trademark-safe, creative product titles (e-commerce thought leadership style)
- Unit cost stored in Shopify inventory
- Retail price = 2x unit cost
- SKU from spreadsheet
- Structured PDP content with research details for description writers
- Image upload from product_images_described folder

Usage:
    python product_listing_importer.py --dry-run        # Preview what will be created
    python product_listing_importer.py --execute        # Create products in Shopify
    python product_listing_importer.py --execute --start 0 --count 10  # Process subset
"""

import os
import sys
import json
import time
import base64
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd
import requests
from io import BytesIO

# Try to import PIL for image orientation correction
try:
    from PIL import Image, ExifTags
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("Warning: Pillow not installed. Image orientation correction disabled.")
    print("Install with: pip install Pillow")

# Configuration
SHOPIFY_STORE = os.environ.get("SHOPIFY_STORE", "oil-slick-pad.myshopify.com")
SHOPIFY_ACCESS_TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
SHOPIFY_API_VERSION = "2024-01"
SHOPIFY_BASE_URL = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}"
VENDOR_NAME = "Cloud YHS"

# Trademark replacements - maps potentially infringing terms to creative alternatives
TRADEMARK_REPLACEMENTS = {
    # Cartoon/Media Characters
    "scooby-doo": "Mystery Hound",
    "scooby doo": "Mystery Hound",
    "rick": "Mad Scientist",
    "morty": "Sidekick Kid",
    "rick and morty": "Dimension Hopper",
    "homer": "Yellow Dad",
    "bart": "Skateboard Kid",
    "simpsons": "Yellow Family",
    "mario": "Plumber Hero",
    "luigi": "Green Plumber",
    "pokemon": "Pocket Creature",
    "pikachu": "Electric Mouse",
    "spongebob": "Sea Sponge",
    "patrick": "Starfish Friend",
    "ninja turtle": "Shell Warrior",
    "tmnt": "Shell Warrior",
    "mickey": "Classic Mouse",
    "minnie": "Bow Mouse",
    "disney": "Classic Animation",
    "shrek": "Green Ogre",
    "donkey": "Talking Donkey",

    # Sports Figures
    "lionel messi": "Soccer Legend",
    "messi": "GOAT Player",
    "ronaldo": "Football Star",
    "neymar": "Brazilian Striker",
    "lebron": "Basketball King",
    "jordan": "Air Legend",
    "kobe": "Mamba Legend",

    # Political Figures
    "modi": "World Leader",
    "trump": "Tower Man",
    "biden": "Aviator Joe",
    "obama": "Hope Man",

    # Brands/Companies
    "nike": "Swoosh Style",
    "adidas": "Three Stripe",
    "supreme": "Box Logo",
    "gucci": "Double G",
    "louis vuitton": "LV Style",
    "chanel": "Double C",
    "versace": "Medusa Head",

    # Other Media
    "star wars": "Galaxy Battle",
    "yoda": "Wise Master",
    "darth vader": "Dark Lord",
    "harry potter": "Wizard Boy",
    "batman": "Dark Knight",
    "superman": "Caped Hero",
    "spiderman": "Web Slinger",
    "spider-man": "Web Slinger",
    "hulk": "Green Giant",
    "iron man": "Metal Hero",
    "captain america": "Shield Hero",
    "thanos": "Infinity Titan",
    "groot": "Tree Friend",
    "deadpool": "Merc Mouth",
}

# Product category keywords for classification
PRODUCT_CATEGORIES = {
    "water_pipe": ["water pipe", "bong", "waterpipe"],
    "hand_pipe": ["hand pipe", "glass pipe", "spoon pipe"],
    "bubbler": ["bubbler"],
    "nectar_collector": ["nectar collector", "honey straw"],
    "dab_tool": ["dab tool", "dabber"],
    "dab_rig": ["dab rig", "oil rig"],
    "bowl": ["bowl", "slide"],
    "battery": ["battery", "510", "cbd"],
    "ashtray": ["ashtray", "ash tray"],
    "storage": ["jar", "container", "stash"],
    "clip": ["clip", "roach clip"],
    "grinder": ["grinder"],
    "rolling": ["rolling tray", "papers"],
}


def sanitize_title(original_title: str) -> str:
    """
    Convert a product title to a trademark-safe, creative alternative.
    Uses e-commerce thought leadership naming conventions.
    """
    title = original_title.lower()

    # Apply trademark replacements
    for trademark, replacement in TRADEMARK_REPLACEMENTS.items():
        if trademark in title:
            title = title.replace(trademark, replacement.lower())

    # Clean up and title case
    title = title.strip()

    # Convert to title case with smart capitalization
    words = title.split()
    result = []
    small_words = {'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with'}

    for i, word in enumerate(words):
        if i == 0 or word not in small_words:
            result.append(word.capitalize())
        else:
            result.append(word)

    return ' '.join(result)


def generate_creative_title(product_name: str, sku: str, specs: str) -> str:
    """
    Generate a creative, SEO-friendly product title in e-commerce thought leadership style.

    Format: [Size] [Creative Name] [Product Type] | [Key Feature]
    """
    # Extract size from original name
    size_match = re.search(r"(\d+(?:\.\d+)?)[''\"]\s*", product_name)
    size = f'{size_match.group(1)}"' if size_match else ""

    # Get sanitized base name
    base_name = sanitize_title(product_name)

    # Remove size from base name if present (handles various quote styles)
    base_name = re.sub(r"^\d+(?:\.\d+)?[''\"]+\s*", "", base_name)
    base_name = re.sub(r'^"\s*', "", base_name)  # Clean up any remaining quote at start

    # Determine product type for suffix
    product_type = ""
    name_lower = product_name.lower()

    if "water pipe" in name_lower or "bong" in name_lower:
        product_type = "Water Pipe"
    elif "hand pipe" in name_lower:
        product_type = "Hand Pipe"
    elif "bubbler" in name_lower:
        product_type = "Bubbler"
    elif "nectar collector" in name_lower:
        product_type = "Nectar Collector"
    elif "dab tool" in name_lower:
        product_type = "Dab Tools"
    elif "bowl" in name_lower:
        product_type = "Bowl"
    elif "battery" in name_lower:
        product_type = "Vape Battery"
    elif "ashtray" in name_lower:
        product_type = "Ashtray"
    elif "jar" in name_lower:
        product_type = "Storage Jar"
    elif "clip" in name_lower:
        product_type = "Roach Clips"

    # Parse materials for feature suffix
    materials = []
    if specs:
        specs_lower = specs.lower()
        if "glass" in specs_lower:
            materials.append("Glass")
        if "silicone" in specs_lower:
            materials.append("Silicone")
        if "pvc" in specs_lower:
            materials.append("PVC")

    material_str = " + ".join(materials) if materials else ""

    # Build creative title
    title_parts = []
    if size:
        title_parts.append(size)

    # Add the creative name (sanitized)
    title_parts.append(base_name)

    # Add material feature if we have one
    if material_str and material_str not in base_name:
        title_parts.append(f"| {material_str}")

    return " ".join(title_parts)


def determine_product_type(name: str) -> str:
    """Determine Shopify product type from name."""
    name_lower = name.lower()

    for ptype, keywords in PRODUCT_CATEGORIES.items():
        for keyword in keywords:
            if keyword in name_lower:
                type_map = {
                    "water_pipe": "Water Pipes",
                    "hand_pipe": "Hand Pipes",
                    "bubbler": "Bubblers",
                    "nectar_collector": "Nectar Collectors",
                    "dab_tool": "Dab Tools",
                    "dab_rig": "Dab Rigs",
                    "bowl": "Bowls & Slides",
                    "battery": "Batteries & Devices",
                    "ashtray": "Ashtrays",
                    "storage": "Storage",
                    "clip": "Accessories",
                    "grinder": "Grinders",
                    "rolling": "Rolling Accessories",
                }
                return type_map.get(ptype, "Smoke Shop Products")

    return "Smoke Shop Products"


def generate_tags(product: Dict) -> str:
    """Generate taxonomy-compliant tags for the product."""
    name = product['name'].lower()
    specs = (product.get('specs') or '').lower()

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

    # Product family and use tags
    if 'water pipe' in name or 'bong' in name:
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
    elif 'battery' in name or 'cbd' in name:
        tags.extend(["pillar:smokeshop-device", "family:vape-battery", "use:vaping"])
    elif 'bowl' in name:
        tags.extend(["pillar:accessory", "family:flower-bowl", "use:flower-smoking"])
    elif 'ashtray' in name or 'jar' in name:
        tags.extend(["pillar:accessory", "family:storage-accessory", "use:storage"])

    # Style tags based on product characteristics
    if any(term in name for term in ['animal', 'cat', 'dog', 'shark', 'penguin', 'dolphin', 'husky', 'mouse']):
        tags.append("style:animal")
    if any(term in name for term in ['zombie', 'alien', 'skull', 'skeleton']):
        tags.append("style:heady")
    if 'soccer' in name or 'football' in name or 'sport' in name:
        tags.append("style:sports")

    return ", ".join(tags)


def extract_dimensions(specs: str) -> Tuple[str, str, str]:
    """Extract dimensions from specs string. Returns (length, width, height)."""
    if not specs:
        return ("", "", "")

    # Match patterns like "230*106*124mm" or "230x106x124"
    dim_match = re.search(r'(\d+)\s*[\*xX]\s*(\d+)\s*[\*xX]\s*(\d+)\s*(?:mm)?', specs)
    if dim_match:
        return (dim_match.group(1), dim_match.group(2), dim_match.group(3))

    return ("", "", "")


def generate_structured_pdp(product: Dict, creative_title: str) -> str:
    """
    Generate structured PDP content with research details for description writers.

    This creates a detailed data sheet in HTML that description writers can use
    to craft the final product copy.
    """
    name = product['name']
    sku = product['sku']
    specs = product.get('specs', '')
    weight = product.get('weight', '')
    cost = product['cost']
    retail_price = product['retail_price']

    # Parse materials
    materials = []
    if specs:
        specs_lower = specs.lower()
        if 'glass' in specs_lower:
            materials.append("Borosilicate Glass")
        if 'silicone' in specs_lower:
            materials.append("Food-Grade Silicone")
        if 'pvc' in specs_lower:
            materials.append("Premium PVC")
        if 'plastic' in specs_lower:
            materials.append("Durable Plastic")
    material_str = ", ".join(materials) if materials else "Quality Materials"

    # Extract dimensions
    dims = extract_dimensions(specs)
    dim_str = f"{dims[0]} x {dims[1]} x {dims[2]} mm" if all(dims) else "See specifications"

    # Determine product category and use case
    name_lower = name.lower()
    product_category = "Water Pipe"
    primary_use = "Dry herb smoking"
    joint_size = "14mm (standard)"

    if 'hand pipe' in name_lower:
        product_category = "Hand Pipe"
        primary_use = "Portable dry herb smoking"
        joint_size = "N/A - Integrated bowl"
    elif 'bubbler' in name_lower:
        product_category = "Bubbler"
        primary_use = "Water-filtered portable smoking"
    elif 'nectar collector' in name_lower:
        product_category = "Nectar Collector"
        primary_use = "Concentrate consumption"
        joint_size = "10mm tip"
    elif 'dab tool' in name_lower:
        product_category = "Dab Tool"
        primary_use = "Concentrate handling"
        joint_size = "N/A"
    elif 'battery' in name_lower or 'cbd' in name_lower:
        product_category = "Vape Battery"
        primary_use = "Cartridge vaporization"
        joint_size = "510 thread"
    elif 'bowl' in name_lower:
        product_category = "Glass Bowl"
        primary_use = "Replacement slide for water pipes"
        joint_size = "14mm (standard)"

    # Identify design theme
    design_themes = []
    theme_keywords = {
        'Character Design': ['man', 'woman', 'person', 'face', 'head', 'body'],
        'Animal Theme': ['cat', 'dog', 'shark', 'penguin', 'dolphin', 'husky', 'mouse', 'bird', 'animal', 'creature'],
        'Pop Culture Inspired': ['alien', 'zombie', 'robot', 'mechanical', 'futuristic', 'sci-fi'],
        'Sports Theme': ['soccer', 'football', 'basketball', 'baseball', 'sports', 'ball'],
        'Nature Inspired': ['flower', 'leaf', 'tree', 'plant', 'botanical', 'eggplant', 'mushroom'],
        'Architecture': ['gate', 'bridge', 'tower', 'building', 'landmark'],
        'Artistic/Abstract': ['artistic', 'abstract', 'artistic couple', 'sculpture'],
    }

    for theme, keywords in theme_keywords.items():
        if any(kw in name_lower for kw in keywords):
            design_themes.append(theme)

    design_theme_str = ", ".join(design_themes) if design_themes else "Unique Novelty Design"

    # Special features based on name
    special_features = []
    if 'light' in name_lower:
        special_features.append("Built-in LED lighting")
    if 'voice' in name_lower:
        special_features.append("Sound effects module")
    if 'glow' in name_lower:
        special_features.append("Glow-in-the-dark elements")
    if 'color changing' in name_lower:
        special_features.append("Color-changing technology")

    special_features_str = ", ".join(special_features) if special_features else "Standard features"

    # Build structured HTML PDP
    pdp_html = f"""
<div class="product-research-brief" style="font-family: system-ui, sans-serif;">

<!-- RESEARCH DATA FOR DESCRIPTION WRITERS -->
<div class="research-header" style="background: #f8f9fa; padding: 15px; margin-bottom: 20px; border-left: 4px solid #28a745;">
<h2 style="margin: 0 0 10px 0; color: #28a745;">Product Research Brief</h2>
<p style="margin: 0; color: #666; font-size: 14px;"><em>This structured data is for description writers. Contains researched details about the product.</em></p>
</div>

<!-- PRODUCT IDENTIFICATION -->
<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
<tr style="background: #343a40; color: white;">
<th colspan="2" style="padding: 10px; text-align: left;">Product Identification</th>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold; width: 200px;">Creative Title</td>
<td style="padding: 8px;">{creative_title}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Original Supplier Name</td>
<td style="padding: 8px;">{name}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold;">SKU / Reference Code</td>
<td style="padding: 8px;"><code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">{sku}</code></td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Vendor</td>
<td style="padding: 8px;">{VENDOR_NAME}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold;">Product Category</td>
<td style="padding: 8px;">{product_category}</td>
</tr>
</table>

<!-- PRICING STRUCTURE -->
<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
<tr style="background: #17a2b8; color: white;">
<th colspan="2" style="padding: 10px; text-align: left;">Pricing Structure</th>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold; width: 200px;">Unit Cost (Landed)</td>
<td style="padding: 8px;">${cost:.2f}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Retail Price (2x Markup)</td>
<td style="padding: 8px; font-size: 18px; font-weight: bold; color: #28a745;">${retail_price:.2f}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold;">Margin</td>
<td style="padding: 8px;">50% gross margin</td>
</tr>
</table>

<!-- PHYSICAL SPECIFICATIONS -->
<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
<tr style="background: #6c757d; color: white;">
<th colspan="2" style="padding: 10px; text-align: left;">Physical Specifications</th>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold; width: 200px;">Materials</td>
<td style="padding: 8px;">{material_str}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Dimensions (L x W x H)</td>
<td style="padding: 8px;">{dim_str}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold;">Weight</td>
<td style="padding: 8px;">{weight if weight else 'Not specified'}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Joint Size</td>
<td style="padding: 8px;">{joint_size}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold;">Raw Specs</td>
<td style="padding: 8px;"><code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">{specs if specs else 'N/A'}</code></td>
</tr>
</table>

<!-- DESIGN & THEME -->
<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
<tr style="background: #9c27b0; color: white;">
<th colspan="2" style="padding: 10px; text-align: left;">Design & Theme Analysis</th>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold; width: 200px;">Design Theme</td>
<td style="padding: 8px;">{design_theme_str}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Special Features</td>
<td style="padding: 8px;">{special_features_str}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold;">Target Audience</td>
<td style="padding: 8px;">Collectors, novelty enthusiasts, gift buyers</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Display Potential</td>
<td style="padding: 8px;">High - designed as conversation piece</td>
</tr>
</table>

<!-- FUNCTIONAL DETAILS -->
<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
<tr style="background: #ff9800; color: white;">
<th colspan="2" style="padding: 10px; text-align: left;">Functional Details</th>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold; width: 200px;">Primary Use</td>
<td style="padding: 8px;">{primary_use}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Filtration Type</td>
<td style="padding: 8px;">{'Water filtration' if 'water pipe' in name_lower else 'Direct draw' if 'hand pipe' in name_lower else 'Standard'}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6;">
<td style="padding: 8px; font-weight: bold;">Cleaning Difficulty</td>
<td style="padding: 8px;">{'Moderate - detailed design may require careful cleaning' if any(t in name_lower for t in ['character', 'man', 'woman', 'animal']) else 'Standard'}</td>
</tr>
<tr style="border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
<td style="padding: 8px; font-weight: bold;">Durability Rating</td>
<td style="padding: 8px;">{'High - silicone construction' if 'silicone' in (specs or '').lower() else 'Standard - handle with care'}</td>
</tr>
</table>

<!-- COPYWRITING NOTES -->
<div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
<h3 style="margin: 0 0 10px 0; color: #856404;">Copywriting Notes for Description Writers</h3>
<ul style="margin: 0; padding-left: 20px; color: #856404;">
<li><strong>Tone:</strong> Fun, playful, collector-focused. Emphasize uniqueness and conversation-starter potential.</li>
<li><strong>SEO Keywords:</strong> {product_category.lower()}, novelty {product_category.lower()}, unique smoking accessories, collectible pipes</li>
<li><strong>Key Selling Points:</strong> Unique design, quality materials, functional art piece</li>
<li><strong>Avoid:</strong> Health claims, trademark terms, competitor mentions</li>
<li><strong>Include:</strong> Care instructions, material benefits, size context (compare to common objects)</li>
</ul>
</div>

<!-- INVENTORY STATUS -->
<div style="background: #d4edda; padding: 15px; border-radius: 5px;">
<h3 style="margin: 0 0 10px 0; color: #155724;">Inventory & Fulfillment</h3>
<p style="margin: 0; color: #155724;"><strong>Stock Status:</strong> {product.get('stock', 'Check supplier')} units available</p>
<p style="margin: 5px 0 0 0; color: #155724;"><strong>Fulfillment:</strong> Ships from CA warehouse (YHS Supply)</p>
</div>

</div>
"""

    return pdp_html


def load_products_from_excel(filepath: str) -> List[Dict]:
    """Load products from the Cloud YHS Excel file."""
    df = pd.read_excel(filepath, engine='xlrd', skiprows=5)
    df.columns = ['Product', 'SKU', 'Picture', 'Weight', 'Specs', 'Cost', 'Stock', 'Extra']

    # Filter out empty rows and header rows
    df = df[df['Product'].notna()]
    df = df[df['SKU'].notna()]
    df = df[~df['SKU'].astype(str).str.contains('No.', na=False)]

    # Clean up cost column
    df['Cost_Clean'] = df['Cost'].astype(str).str.replace('$', '').str.replace(',', '')
    df['Cost_Clean'] = pd.to_numeric(df['Cost_Clean'], errors='coerce')
    df['Retail_Price'] = (df['Cost_Clean'] * 2).round(2)

    # Clean up stock
    df['Stock_Clean'] = df['Stock'].astype(str).str.extract(r'(\d+)')[0].astype(float).fillna(0).astype(int)

    products = []
    for _, row in df.iterrows():
        if pd.notna(row['Product']) and pd.notna(row['SKU']):
            cost = float(row['Cost_Clean']) if pd.notna(row['Cost_Clean']) else 0
            products.append({
                'name': str(row['Product']).strip().replace('\n', ' '),
                'sku': str(row['SKU']).strip(),
                'weight': str(row['Weight']).strip() if pd.notna(row['Weight']) else '',
                'specs': str(row['Specs']).strip().replace('\n', ' ') if pd.notna(row['Specs']) else '',
                'cost': cost,
                'retail_price': round(cost * 2, 2),
                'stock': int(row['Stock_Clean'])
            })

    return products


def find_product_image(sku: str, image_folder: str) -> Optional[str]:
    """Find the image file for a product by SKU."""
    if not image_folder:
        return None

    folder = Path(image_folder)
    if not folder.exists():
        return None

    # Try various extensions
    for ext in ['.jpeg', '.jpg', '.png', '.webp', '.JPEG', '.JPG', '.PNG']:
        img_path = folder / f"{sku}{ext}"
        if img_path.exists():
            return str(img_path)

    return None


def fix_image_orientation(image_path: str, rotate_180: bool = False) -> bytes:
    """
    Fix image orientation and return corrected image bytes.

    Many images from suppliers are physically rotated incorrectly (upside down).
    This function:
    1. Applies EXIF orientation correction if present
    2. Optionally rotates image 180 degrees (for upside-down supplier images)
    3. Returns the corrected image as bytes

    Args:
        image_path: Path to the image file
        rotate_180: If True, rotate the image 180 degrees (for upside-down images)
    """
    if not PIL_AVAILABLE:
        # Fall back to reading raw bytes if PIL not available
        with open(image_path, 'rb') as f:
            return f.read()

    try:
        img = Image.open(image_path)

        # Get EXIF data
        exif = None
        if hasattr(img, '_getexif') and img._getexif():
            exif = img._getexif()

        # Find orientation tag
        orientation = None
        if exif:
            for tag_id, value in exif.items():
                tag = ExifTags.TAGS.get(tag_id, tag_id)
                if tag == 'Orientation':
                    orientation = value
                    break

        # Apply EXIF orientation correction
        if orientation:
            if orientation == 2:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            elif orientation == 3:
                img = img.rotate(180, expand=True)
            elif orientation == 4:
                img = img.transpose(Image.FLIP_TOP_BOTTOM)
            elif orientation == 5:
                img = img.transpose(Image.FLIP_LEFT_RIGHT).rotate(270, expand=True)
            elif orientation == 6:
                img = img.rotate(270, expand=True)
            elif orientation == 7:
                img = img.transpose(Image.FLIP_LEFT_RIGHT).rotate(90, expand=True)
            elif orientation == 8:
                img = img.rotate(90, expand=True)

        # Apply 180 degree rotation if requested (for upside-down supplier images)
        if rotate_180:
            img = img.rotate(180, expand=True)

        # Convert to RGB if necessary (for PNG with transparency)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # Save to bytes
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=95)
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print(f"    Warning: Could not process image orientation: {e}")
        # Fall back to reading raw bytes
        with open(image_path, 'rb') as f:
            return f.read()


def upload_image_to_shopify(product_id: int, image_path: str, position: int = 1, alt_text: str = "", rotate_180: bool = False) -> Dict:
    """Upload an image to a Shopify product with orientation correction."""
    # Fix orientation and get corrected image bytes
    image_bytes = fix_image_orientation(image_path, rotate_180=rotate_180)
    image_data = base64.b64encode(image_bytes).decode('utf-8')

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


def create_shopify_product(product: Dict, creative_title: str, pdp_html: str) -> Dict:
    """Create a product in Shopify with all details."""

    tags = generate_tags(product)
    product_type = determine_product_type(product['name'])

    # Build the product payload
    payload = {
        "product": {
            "title": creative_title,
            "body_html": pdp_html,
            "vendor": VENDOR_NAME,
            "product_type": product_type,
            "tags": tags,
            "status": "draft",  # Start as draft
            "variants": [
                {
                    "price": str(product['retail_price']),
                    "sku": product['sku'],
                    "inventory_management": "shopify",
                    "inventory_quantity": product['stock'],
                    "weight": float(product['weight'].replace('g', '').strip()) if product['weight'] and 'g' in product['weight'] else 0,
                    "weight_unit": "g",
                    "requires_shipping": True
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
        product_id = result["product"]["id"]
        variant_id = result["product"]["variants"][0]["id"]

        # Now update the inventory item with the cost
        time.sleep(0.5)  # Rate limiting
        update_inventory_cost(variant_id, product['cost'])

        return {
            "success": True,
            "product_id": product_id,
            "variant_id": variant_id,
            "handle": result["product"]["handle"],
            "title": result["product"]["title"]
        }
    else:
        return {
            "success": False,
            "error": f"HTTP {response.status_code}: {response.text[:200]}"
        }


def update_inventory_cost(variant_id: int, cost: float) -> bool:
    """Update the inventory item cost for a variant."""
    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

    # First, get the inventory item ID
    response = requests.get(
        f"{SHOPIFY_BASE_URL}/variants/{variant_id}.json",
        headers=headers,
        timeout=30
    )

    if response.status_code != 200:
        return False

    inventory_item_id = response.json()["variant"]["inventory_item_id"]

    # Now update the cost
    payload = {
        "inventory_item": {
            "cost": str(cost)
        }
    }

    response = requests.put(
        f"{SHOPIFY_BASE_URL}/inventory_items/{inventory_item_id}.json",
        headers=headers,
        json=payload,
        timeout=30
    )

    return response.status_code in [200, 201]


def publish_product(product_id: int) -> bool:
    """Set product status to active."""
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

    return response.status_code in [200, 201]


def process_single_product(product: Dict, image_folder: str, publish: bool = False, rotate_images: bool = False) -> Dict:
    """Process a single product: create in Shopify, upload image."""

    print(f"\n{'='*70}")
    print(f"Processing: {product['name']}")
    print(f"SKU: {product['sku']} | Cost: ${product['cost']:.2f} | Retail: ${product['retail_price']:.2f}")
    print(f"{'='*70}")

    # Step 1: Generate creative title
    print("  [1/5] Generating creative title...")
    creative_title = generate_creative_title(product['name'], product['sku'], product['specs'])
    print(f"        Original: {product['name']}")
    print(f"        Creative: {creative_title}")

    # Step 2: Generate structured PDP
    print("  [2/5] Generating structured PDP content...")
    pdp_html = generate_structured_pdp(product, creative_title)
    print(f"        Generated {len(pdp_html)} chars of structured content")

    # Step 3: Create product in Shopify
    print("  [3/5] Creating product in Shopify...")
    create_result = create_shopify_product(product, creative_title, pdp_html)

    if not create_result['success']:
        print(f"        FAILED: {create_result['error']}")
        return {"success": False, "error": create_result['error']}

    product_id = create_result['product_id']
    print(f"        Created product ID: {product_id}")
    print(f"        Unit cost stored: ${product['cost']:.2f}")

    # Step 4: Upload image
    print("  [4/5] Uploading product image...")
    image_path = find_product_image(product['sku'], image_folder)

    if image_path:
        upload_result = upload_image_to_shopify(
            product_id,
            image_path,
            position=1,
            alt_text=f"{creative_title} - Product Image",
            rotate_180=rotate_images
        )
        if upload_result['success']:
            print(f"        Image uploaded successfully" + (" (rotated 180°)" if rotate_images else ""))
        else:
            print(f"        Image upload failed: {upload_result.get('error', 'Unknown')}")
    else:
        print(f"        No image found for SKU: {product['sku']}")

    # Step 5: Optionally publish
    print("  [5/5] Finalizing product...")
    if publish:
        if publish_product(product_id):
            print("        Product published!")
        else:
            print("        Failed to publish (keeping as draft)")
    else:
        print("        Saved as draft")

    return {
        "success": True,
        "product_id": product_id,
        "title": creative_title,
        "sku": product['sku']
    }


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Import Cloud YHS products with detailed listings",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python product_listing_importer.py --dry-run
  python product_listing_importer.py --execute --start 0 --count 5
  python product_listing_importer.py --execute --publish
  python product_listing_importer.py --list
        """
    )
    parser.add_argument("--file", "-f", default="products conv 1.xls", help="Excel file path")
    parser.add_argument("--images", "-i", default="product_images_described", help="Folder containing product images")
    parser.add_argument("--start", "-s", type=int, default=0, help="Start from product index (0-based)")
    parser.add_argument("--count", "-c", type=int, default=None, help="Number of products to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    parser.add_argument("--execute", action="store_true", help="Actually create products in Shopify")
    parser.add_argument("--publish", action="store_true", help="Publish products after creation")
    parser.add_argument("--rotate-images", action="store_true", help="Rotate all images 180 degrees (for upside-down supplier images)")
    parser.add_argument("--list", action="store_true", help="List all products and exit")
    parser.add_argument("--show-titles", action="store_true", help="Show original vs creative titles")

    args = parser.parse_args()

    # Load products
    print(f"\n{'='*70}")
    print("CLOUD YHS PRODUCT LISTING IMPORTER")
    print(f"{'='*70}")
    print(f"\nLoading products from: {args.file}")

    products = load_products_from_excel(args.file)
    print(f"Found {len(products)} products")

    # Check for images
    image_folder = Path(args.images)
    if image_folder.exists():
        image_count = len(list(image_folder.glob("*.jpeg")) + list(image_folder.glob("*.jpg")))
        print(f"Found {image_count} images in: {args.images}")
    else:
        print(f"Image folder not found: {args.images}")
        image_folder = None

    # List mode
    if args.list:
        print(f"\n{'='*70}")
        print("PRODUCT LIST")
        print(f"{'='*70}")
        for i, p in enumerate(products):
            has_image = "IMG" if find_product_image(p['sku'], str(image_folder) if image_folder else None) else "   "
            print(f"{i+1:3}. [{has_image}] {p['sku']:10} | ${p['retail_price']:7.2f} | {p['name'][:45]}")
        return

    # Show titles mode
    if args.show_titles:
        print(f"\n{'='*70}")
        print("TITLE TRANSFORMATIONS")
        print(f"{'='*70}")
        for p in products:
            creative = generate_creative_title(p['name'], p['sku'], p['specs'])
            print(f"\nSKU: {p['sku']}")
            print(f"  Original: {p['name']}")
            print(f"  Creative: {creative}")
        return

    # Select range
    end_idx = args.start + args.count if args.count else len(products)
    selected = products[args.start:end_idx]

    print(f"\nProcessing products {args.start+1} to {min(end_idx, len(products))} ({len(selected)} total)")

    # Dry run mode
    if args.dry_run or not args.execute:
        print(f"\n{'='*70}")
        print("DRY RUN MODE - Preview Only")
        print(f"{'='*70}")

        for i, p in enumerate(selected):
            creative_title = generate_creative_title(p['name'], p['sku'], p['specs'])
            has_image = "Yes" if find_product_image(p['sku'], str(image_folder) if image_folder else None) else "No"

            print(f"\n[{i+1}/{len(selected)}] SKU: {p['sku']}")
            print(f"  Original Title: {p['name']}")
            print(f"  Creative Title: {creative_title}")
            print(f"  Unit Cost: ${p['cost']:.2f}")
            print(f"  Retail Price: ${p['retail_price']:.2f}")
            print(f"  Has Image: {has_image}")
            print(f"  Stock: {p['stock']} units")

        print(f"\n{'='*70}")
        print("To create these products, run with --execute flag")
        print(f"{'='*70}")
        return

    # Execute mode - create products
    if not SHOPIFY_ACCESS_TOKEN:
        print("\nERROR: SHOPIFY_ACCESS_TOKEN environment variable not set")
        sys.exit(1)

    print(f"\n{'='*70}")
    print("EXECUTING - Creating Products in Shopify")
    if args.rotate_images:
        print("  ** Image rotation enabled (180°) **")
    print(f"{'='*70}")

    results = {"success": 0, "failed": 0, "created_ids": []}

    for i, product in enumerate(selected):
        print(f"\n[{i+1}/{len(selected)}]", end="")
        result = process_single_product(
            product,
            str(image_folder) if image_folder else None,
            publish=args.publish,
            rotate_images=args.rotate_images
        )

        if result['success']:
            results['success'] += 1
            results['created_ids'].append({
                'id': result['product_id'],
                'sku': result['sku'],
                'title': result['title']
            })
        else:
            results['failed'] += 1

        time.sleep(1)  # Rate limiting

    # Summary
    print(f"\n{'='*70}")
    print("IMPORT COMPLETE")
    print(f"{'='*70}")
    print(f"Products created: {results['success']}")
    print(f"Products failed: {results['failed']}")

    if results['created_ids']:
        print(f"\nCreated Products:")
        for p in results['created_ids'][:10]:
            print(f"  - {p['sku']}: {p['title']} (ID: {p['id']})")
        if len(results['created_ids']) > 10:
            print(f"  ... and {len(results['created_ids']) - 10} more")


if __name__ == "__main__":
    main()

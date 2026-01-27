#!/usr/bin/env python3
"""
Cloud YHS Image Fixer
=====================
Removes all images from Cloud YHS products and re-uploads them
with correct SKU matching and EXIF orientation handling.
"""

import os
import sys
import time
import base64
import io
from pathlib import Path

import requests
from PIL import Image, ExifTags

# Configuration
SHOPIFY_STORE = os.environ.get("SHOPIFY_STORE", "oil-slick-pad.myshopify.com")
SHOPIFY_ACCESS_TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
VENDOR_NAME = "Cloud YHS"

# Local product images directory
PRODUCT_IMAGES_DIR = Path(__file__).parent.parent / "product_images" / "product_images_described"

# Shopify API
SHOPIFY_API_VERSION = "2024-01"
SHOPIFY_BASE_URL = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}"


def get_all_cloud_yhs_products():
    """Fetch all Cloud YHS products from Shopify."""
    products = []
    url = f"{SHOPIFY_BASE_URL}/products.json?vendor={VENDOR_NAME}&limit=250"

    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

    while url:
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code != 200:
            print(f"Error fetching products: {response.status_code}")
            break

        data = response.json()
        products.extend(data.get('products', []))

        # Check for pagination
        link_header = response.headers.get('Link', '')
        if 'rel="next"' in link_header:
            # Extract next URL from Link header
            for link in link_header.split(','):
                if 'rel="next"' in link:
                    url = link.split(';')[0].strip('<> ')
                    break
        else:
            url = None

        time.sleep(0.5)  # Rate limiting

    return products


def delete_product_image(product_id: int, image_id: int) -> bool:
    """Delete a single image from a product."""
    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

    response = requests.delete(
        f"{SHOPIFY_BASE_URL}/products/{product_id}/images/{image_id}.json",
        headers=headers,
        timeout=30
    )

    return response.status_code in [200, 204]


def delete_all_product_images(product: dict) -> int:
    """Delete all images from a product. Returns count of deleted images."""
    images = product.get('images', [])
    deleted = 0

    for image in images:
        if delete_product_image(product['id'], image['id']):
            deleted += 1
            time.sleep(0.3)  # Rate limiting
        else:
            print(f"    Failed to delete image {image['id']}")

    return deleted


def fix_image_orientation(image: Image.Image) -> Image.Image:
    """Fix image orientation based on EXIF data."""
    try:
        exif = image._getexif()
        if exif is None:
            return image

        orientation_key = None
        for key, val in ExifTags.TAGS.items():
            if val == 'Orientation':
                orientation_key = key
                break

        if orientation_key is None or orientation_key not in exif:
            return image

        orientation = exif[orientation_key]

        if orientation == 2:
            image = image.transpose(Image.FLIP_LEFT_RIGHT)
        elif orientation == 3:
            image = image.rotate(180, expand=True)
        elif orientation == 4:
            image = image.transpose(Image.FLIP_TOP_BOTTOM)
        elif orientation == 5:
            image = image.transpose(Image.FLIP_LEFT_RIGHT).rotate(270, expand=True)
        elif orientation == 6:
            image = image.rotate(270, expand=True)
        elif orientation == 7:
            image = image.transpose(Image.FLIP_LEFT_RIGHT).rotate(90, expand=True)
        elif orientation == 8:
            image = image.rotate(90, expand=True)

        return image
    except Exception as e:
        print(f"    Warning: Could not fix orientation: {e}")
        return image


def find_local_image(sku: str) -> dict:
    """Find and load a local image for the given SKU."""
    possible_names = [
        f"{sku}.jpeg",
        f"{sku}.jpg",
        f"{sku}.png",
        f"{sku.upper()}.jpeg",
        f"{sku.upper()}.jpg",
    ]

    for filename in possible_names:
        image_path = PRODUCT_IMAGES_DIR / filename
        if image_path.exists():
            try:
                with Image.open(image_path) as img:
                    # Fix orientation
                    img = fix_image_orientation(img)

                    # Convert to RGB if needed
                    if img.mode in ('RGBA', 'P'):
                        img = img.convert('RGB')

                    # Save to buffer
                    buffer = io.BytesIO()
                    img.save(buffer, format='JPEG', quality=90)
                    buffer.seek(0)

                    return {
                        "success": True,
                        "image_data": base64.b64encode(buffer.getvalue()).decode('utf-8'),
                        "filename": filename
                    }
            except Exception as e:
                return {"success": False, "error": str(e)}

    return {"success": False, "error": f"No image found for SKU: {sku}"}


def upload_image_to_product(product_id: int, image_data: str, alt_text: str) -> bool:
    """Upload an image to a product."""
    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

    payload = {
        "image": {
            "attachment": image_data,
            "position": 1,
            "alt": alt_text
        }
    }

    response = requests.post(
        f"{SHOPIFY_BASE_URL}/products/{product_id}/images.json",
        headers=headers,
        json=payload,
        timeout=60
    )

    return response.status_code in [200, 201]


def get_product_sku(product: dict) -> str:
    """Extract SKU from product variants."""
    variants = product.get('variants', [])
    if variants:
        return variants[0].get('sku', '')
    return ''


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Fix Cloud YHS product images")
    parser.add_argument("--delete-only", action="store_true",
                        help="Only delete images, don't re-upload")
    parser.add_argument("--upload-only", action="store_true",
                        help="Only upload images (skip deletion)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done without making changes")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of products to process")

    args = parser.parse_args()

    if not SHOPIFY_ACCESS_TOKEN:
        print("ERROR: SHOPIFY_ACCESS_TOKEN not set")
        sys.exit(1)

    print("=" * 60)
    print("Cloud YHS Image Fixer")
    print("=" * 60)

    if args.dry_run:
        print("\n🔍 DRY RUN MODE - No changes will be made\n")

    # Fetch all Cloud YHS products
    print(f"\nFetching Cloud YHS products from {SHOPIFY_STORE}...")
    products = get_all_cloud_yhs_products()
    print(f"Found {len(products)} Cloud YHS products")

    if args.limit:
        products = products[:args.limit]
        print(f"Limited to {len(products)} products")

    if not products:
        print("No products found. Exiting.")
        return

    # Process each product
    total_deleted = 0
    total_uploaded = 0

    for i, product in enumerate(products):
        sku = get_product_sku(product)
        image_count = len(product.get('images', []))

        print(f"\n[{i+1}/{len(products)}] {product['title'][:50]}")
        print(f"    ID: {product['id']} | SKU: {sku} | Images: {image_count}")

        if args.dry_run:
            # Check if local image exists
            local_img = find_local_image(sku)
            if local_img['success']:
                print(f"    Would delete {image_count} images and upload {local_img['filename']}")
            else:
                print(f"    Would delete {image_count} images (no local image for {sku})")
            continue

        # Step 1: Delete existing images
        if not args.upload_only and image_count > 0:
            print(f"    Deleting {image_count} existing images...")
            deleted = delete_all_product_images(product)
            total_deleted += deleted
            print(f"    ✓ Deleted {deleted} images")
            time.sleep(0.5)

        # Step 2: Upload new image
        if not args.delete_only:
            local_img = find_local_image(sku)
            if local_img['success']:
                print(f"    Uploading {local_img['filename']}...")
                if upload_image_to_product(product['id'], local_img['image_data'],
                                          f"{product['title']} - Product Image"):
                    print("    ✓ Image uploaded successfully")
                    total_uploaded += 1
                else:
                    print("    ✗ Failed to upload image")
            else:
                print(f"    ⚠ No local image found for SKU: {sku}")

        time.sleep(0.5)  # Rate limiting

    # Summary
    print("\n" + "=" * 60)
    print("COMPLETE")
    print("=" * 60)
    if not args.dry_run:
        print(f"Images deleted: {total_deleted}")
        print(f"Images uploaded: {total_uploaded}")


if __name__ == "__main__":
    main()

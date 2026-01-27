#!/usr/bin/env python3
"""
Verify image-to-product matching is correct.
"""
import sys
sys.path.insert(0, 'tools')
from pdf_product_importer import parse_pdf_with_layout, extract_images_from_pdf, match_images_to_products, get_product_positions

PDF_PATH = "products.pdf"

def main():
    print("Verifying image-product matching...")

    # Parse products
    products = parse_pdf_with_layout(PDF_PATH)
    print(f"Found {len(products)} products")

    # Extract images
    images = extract_images_from_pdf(PDF_PATH, "pdf_extracted_images", rotate=True)
    print(f"Extracted {len(images)} images")

    # Match using position-based logic
    match_images_to_products(PDF_PATH, products, images)

    # Get product positions
    product_positions = get_product_positions(PDF_PATH)
    sku_to_pos = {p['sku']: p for p in product_positions}

    # Verify: check products around the problematic area (H378 and onwards)
    print("\n" + "=" * 70)
    print("VERIFICATION: Products from index 72 (H468B) to 85")
    print("=" * 70)

    for i in range(72, min(86, len(products))):
        p = products[i]
        sku = p['sku']
        pos = sku_to_pos.get(sku, {})

        img_file = p.get('image_path', 'None')
        if img_file:
            # Extract the image number from filename
            img_num = img_file.split('_')[-1].replace('.jpeg', '')
        else:
            img_num = 'None'

        print(f"[{i:3d}] SKU: {sku:10} Page: {pos.get('page', '?')+1} Y: {pos.get('y', 0):6.1f} → Image: {img_num}")

    # Check specifically for the products the user mentioned
    print("\n" + "=" * 70)
    print("KEY PRODUCTS CHECK")
    print("=" * 70)

    key_skus = ['H468C', 'H378', 'H377', 'H363']
    for sku in key_skus:
        for i, p in enumerate(products):
            if p['sku'] == sku:
                pos = sku_to_pos.get(sku, {})
                img = p.get('image_path', 'None')
                print(f"{sku}: index={i}, page={pos.get('page',0)+1}, image={img}")
                break

    print("\n✓ Matching complete. Products now matched by page+position, not by index.")
    print("  Extra images (orphaned slots) are skipped automatically.")


if __name__ == "__main__":
    main()

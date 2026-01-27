#!/usr/bin/env python3
"""
Diagnostic script to find exactly where images and products diverge.
"""
import fitz
import re
from pathlib import Path

PDF_PATH = "products.pdf"

def get_products_by_page(pdf_path: str) -> dict:
    """Get products organized by page with their Y positions."""
    pdf = fitz.open(pdf_path)
    products_by_page = {}
    all_products = []

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

        text_items.sort(key=lambda x: x["y"])

        # Find SKUs in this page
        page_products = []
        for item in text_items:
            if 130 < item["x"] < 200:
                if re.match(r'^(CY\d+[A-Z\-]*|H\d+[A-Z\-]*|B\d+|E\d+|WS\d+|A\d+|P\d+|J\d+[A-Z]*)$', item["text"]):
                    page_products.append({
                        'sku': item["text"],
                        'y': item["y"],
                        'page': page_num
                    })

        # Remove duplicates (same SKU might appear multiple times in text)
        seen = set()
        unique_products = []
        for p in page_products:
            if p['sku'] not in seen:
                seen.add(p['sku'])
                unique_products.append(p)
                all_products.append(p)

        products_by_page[page_num] = unique_products

    pdf.close()
    return products_by_page, all_products


def get_images_by_page(pdf_path: str) -> dict:
    """Get images organized by page with their Y positions."""
    pdf = fitz.open(pdf_path)
    images_by_page = {}
    all_images = []

    for page_num in range(len(pdf)):
        page = pdf[page_num]
        info_list = page.get_image_info(xrefs=True)

        page_images = []
        for info in info_list:
            xref = info.get('xref')
            if not xref:
                continue

            bbox = info['bbox']
            y_pos = bbox[1]
            x_pos = bbox[0]
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]

            # Skip logo (wide image at top of page 1)
            if page_num == 0 and y_pos < 100 and width > 60:
                continue

            # Skip very small images
            try:
                base_image = pdf.extract_image(xref)
                if len(base_image["image"]) < 1000:
                    continue
            except:
                continue

            page_images.append({
                'xref': xref,
                'y': y_pos,
                'x': x_pos,
                'width': width,
                'height': height,
                'page': page_num
            })

        # Sort by y position
        page_images.sort(key=lambda img: (img['y'], img['x']))
        images_by_page[page_num] = page_images
        all_images.extend(page_images)

    pdf.close()
    return images_by_page, all_images


def main():
    print("=" * 70)
    print("IMAGE-PRODUCT ALIGNMENT DIAGNOSTIC")
    print("=" * 70)

    products_by_page, all_products = get_products_by_page(PDF_PATH)
    images_by_page, all_images = get_images_by_page(PDF_PATH)

    print(f"\nTotal products: {len(all_products)}")
    print(f"Total images (after filtering): {len(all_images)}")
    print(f"Difference: {len(all_images) - len(all_products)} extra images")

    print("\n" + "=" * 70)
    print("PER-PAGE BREAKDOWN")
    print("=" * 70)

    cumulative_products = 0
    cumulative_images = 0
    divergence_found = False

    for page_num in range(max(len(products_by_page), len(images_by_page))):
        page_prods = products_by_page.get(page_num, [])
        page_imgs = images_by_page.get(page_num, [])

        cumulative_products += len(page_prods)
        cumulative_images += len(page_imgs)

        diff = len(page_imgs) - len(page_prods)
        status = "✓" if diff == 0 else f"OFF BY {diff}"

        print(f"\nPage {page_num + 1}:")
        print(f"  Images: {len(page_imgs):2d} | Products: {len(page_prods):2d} | {status}")
        print(f"  Cumulative - Images: {cumulative_images:3d} | Products: {cumulative_products:3d}")

        if diff != 0 and not divergence_found:
            divergence_found = True
            print(f"\n  ⚠️  DIVERGENCE STARTS HERE!")
            print(f"\n  Products on this page:")
            for i, p in enumerate(page_prods):
                print(f"    {i+1}. SKU: {p['sku']:10} at y={p['y']:.1f}")

            print(f"\n  Images on this page:")
            for i, img in enumerate(page_imgs):
                print(f"    {i+1}. xref={img['xref']:4d} at y={img['y']:.1f} ({img['width']:.0f}x{img['height']:.0f})")

    # Now let's look at index 74 specifically
    print("\n" + "=" * 70)
    print("CHECKING AROUND INDEX 74 (H378)")
    print("=" * 70)

    for i in range(70, min(80, len(all_products))):
        prod = all_products[i]
        img = all_images[i] if i < len(all_images) else None

        print(f"\nIndex {i}:")
        print(f"  Product: SKU={prod['sku']:10} page={prod['page']+1} y={prod['y']:.1f}")
        if img:
            print(f"  Image:   xref={img['xref']:4d}     page={img['page']+1} y={img['y']:.1f}")
            if prod['page'] != img['page']:
                print(f"  ⚠️  PAGE MISMATCH! Product on page {prod['page']+1}, image on page {img['page']+1}")
        else:
            print(f"  Image:   NONE")


if __name__ == "__main__":
    main()

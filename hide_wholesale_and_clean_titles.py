"""
Shopify Store Cleanup Script
Store: oil-slick-pad.myshopify.com
Date: 2026-02-26

This script was used to perform two operations on the Shopify store:

1. HIDE WHOLESALE/BULK PRODUCTS (set to draft):
   - Identified 215 active products that appear to be wholesale/bulk
   - Keywords matched: pack, packs, bulk, box, case, lot, ct, pcs, pieces, count
   - All 215 products were successfully set to "draft" status

2. REMOVE DOLLAR AMOUNTS FROM TITLES:
   - Identified 66 products with "$X.XX" patterns in their titles
   - Removed the dollar amount and cleaned up trailing separators
   - All 66 titles were successfully cleaned

RESULTS:
   - Wholesale products drafted: 215/215 (100% success)
   - Titles cleaned: 66/66 (100% success)
   - Full change log: shopify_changes_log.json
"""

import json
import urllib.request
import re
import time

STORE = "oil-slick-pad.myshopify.com"
API_VER = "2024-01"

# Wholesale/bulk detection patterns
WHOLESALE_PATTERNS = [
    r'\bpack\b', r'\bpacks\b', r'\bbulk\b', r'\bwholesale\b',
    r'\b\d+[\-\s]?pack\b', r'\b\d+[\-\s]?packs\b',
    r'\bcase\b', r'\bbox\b', r'\blot\b',
    r'\b\d+\s*(pc|pcs|piece|pieces|ct|count)\b',
]

# Dollar amount pattern in titles
DOLLAR_PATTERN = r'\$\d+[\d.,]*\s*'


def is_wholesale(title):
    """Check if a product title indicates wholesale/bulk."""
    title_lower = title.lower()
    for pat in WHOLESALE_PATTERNS:
        if re.search(pat, title_lower):
            return True
    return False


def clean_dollar_from_title(title):
    """Remove dollar amounts from a product title."""
    cleaned = re.sub(DOLLAR_PATTERN, '', title).strip()
    cleaned = re.sub(r'^[\s\-\u2013\u2014]+|[\s\-\u2013\u2014]+$', '', cleaned)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned)
    return cleaned


def api_put(token, product_id, payload):
    """Update a product via Shopify Admin API."""
    url = f"https://{STORE}/admin/api/{API_VER}/products/{product_id}.json"
    data = json.dumps({"product": payload}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT", headers={
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
    })
    for attempt in range(4):
        try:
            resp = urllib.request.urlopen(req)
            return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = float(e.headers.get("Retry-After", 2))
                time.sleep(retry_after)
            else:
                return None
        except Exception:
            time.sleep(2 ** attempt)
    return None

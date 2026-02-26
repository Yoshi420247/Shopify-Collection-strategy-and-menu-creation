#!/usr/bin/env python3
"""Fetch all 'What You Need' products from Shopify and pre-score PDP quality."""

import json, os, re, time, urllib.request, urllib.parse, html

STORE = os.environ["SHOPIFY_STORE_URL"]
TOKEN = os.environ["SHOPIFY_ACCESS_TOKEN"]
API = f"https://{STORE}/admin/api/2024-01"

def api_get(endpoint, params=None):
    url = f"{API}/{endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json"
    })
    with urllib.request.urlopen(req) as resp:
        link = resp.getheader("Link", "")
        data = json.loads(resp.read())
    return data, link

def strip_html(text):
    """Strip HTML tags and decode entities."""
    if not text:
        return ""
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def score_pdp(product):
    """Score a PDP 0-100 based on quality signals."""
    score = 0
    body = product.get("body_html") or ""
    plain = strip_html(body)
    words = plain.split()
    word_count = len(words)

    # --- CONTENT DEPTH (0-30) ---
    if word_count >= 150:
        score += 30
    elif word_count >= 80:
        score += 20
    elif word_count >= 40:
        score += 10
    elif word_count >= 15:
        score += 5

    # --- STRUCTURE (0-20) ---
    has_headings = bool(re.search(r'<h[2-4]', body, re.I))
    has_lists = bool(re.search(r'<[uo]l', body, re.I))
    has_paragraphs = len(re.findall(r'<p[ >]', body, re.I)) >= 2
    if has_headings: score += 8
    if has_lists: score += 7
    if has_paragraphs: score += 5

    # --- SEO SIGNALS (0-15) ---
    title = product.get("title", "")
    if title.startswith("$"):
        score -= 5
    if 20 <= len(title) <= 70:
        score += 5
    title_words = set(re.findall(r'\w+', title.lower()))
    body_lower = plain.lower()
    keyword_hits = sum(1 for w in title_words if len(w) > 3 and w in body_lower)
    if keyword_hits >= 3:
        score += 5
    elif keyword_hits >= 1:
        score += 3
    table_heavy = body.count("<td") > 10 and word_count < 50
    if table_heavy:
        score -= 5
    has_specs = bool(re.search(r'(spec|dimension|material|size|feature|include)', plain, re.I))
    if has_specs: score += 5

    # --- MEDIA (0-15) ---
    image_count = len(product.get("images", []))
    if image_count >= 3:
        score += 15
    elif image_count >= 2:
        score += 10
    elif image_count >= 1:
        score += 5

    # --- VARIANTS (0-10) ---
    variants = product.get("variants", [])
    if len(variants) >= 1:
        named = [v for v in variants if v.get("title","") != "Default Title"]
        if named:
            score += 5
        if all(v.get("price") for v in variants):
            score += 5

    # --- PRODUCT TYPE & TAGS (0-10) ---
    if product.get("product_type"):
        score += 5
    tags = product.get("tags", "")
    tag_count = len([t for t in tags.split(",") if t.strip()])
    if tag_count >= 3:
        score += 5
    elif tag_count >= 1:
        score += 3

    return max(0, min(100, score))

def main():
    all_products = []
    page = 1
    params = {"vendor": "What You Need", "limit": "250",
              "fields": "id,title,vendor,body_html,product_type,tags,handle,variants,images,status"}

    print("Fetching products...")
    while True:
        data, link = api_get("products.json", params)
        products = data.get("products", [])
        all_products.extend(products)
        print(f"  Page {page}: {len(products)} products (total: {len(all_products)})")

        next_url = None
        if "rel=\"next\"" in link:
            match = re.search(r'<([^>]+)>;\s*rel="next"', link)
            if match:
                next_url = match.group(1)

        if not next_url or len(products) < 250:
            break

        parsed = urllib.parse.urlparse(next_url)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        page += 1
        time.sleep(0.5)

    print(f"\nTotal fetched: {len(all_products)}")

    scored = []
    for p in all_products:
        s = score_pdp(p)
        scored.append({
            "id": p["id"],
            "title": p["title"],
            "handle": p.get("handle", ""),
            "status": p.get("status", ""),
            "product_type": p.get("product_type", ""),
            "tags": p.get("tags", ""),
            "score": s,
            "word_count": len(strip_html(p.get("body_html","")).split()),
            "image_count": len(p.get("images", [])),
            "variant_count": len(p.get("variants", [])),
            "body_html": p.get("body_html", ""),
            "body_plain": strip_html(p.get("body_html", ""))
        })

    scored.sort(key=lambda x: x["score"])

    with open("/home/user/Shopify-Collection-strategy-and-menu-creation/data/wyn_pdp_audit.json", "w") as f:
        json.dump(scored, f, indent=2)

    active = [s for s in scored if s["status"] == "active"]
    draft = [s for s in scored if s["status"] == "draft"]
    print(f"\nActive: {len(active)} | Draft: {len(draft)}")

    avg_score = sum(s["score"] for s in scored) / len(scored) if scored else 0
    active_avg = sum(s["score"] for s in active) / len(active) if active else 0
    print(f"Overall avg score: {avg_score:.1f}")
    print(f"Active avg score: {active_avg:.1f}")

    brackets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for s in scored:
        sc = s["score"]
        if sc <= 20: brackets["0-20"] += 1
        elif sc <= 40: brackets["21-40"] += 1
        elif sc <= 60: brackets["41-60"] += 1
        elif sc <= 80: brackets["61-80"] += 1
        else: brackets["81-100"] += 1
    print(f"\nScore distribution:")
    for k, v in brackets.items():
        bar = "█" * (v // 5)
        print(f"  {k:>6}: {v:>4} {bar}")

    bottom = [s for s in scored if s["status"] == "active"][:30]
    print(f"\n--- BOTTOM 30 ACTIVE PDPs (worst first) ---")
    for i, s in enumerate(bottom, 1):
        print(f"{i:>2}. [{s['score']:>3}] {s['title'][:60]:<60} ({s['word_count']}w, {s['image_count']}img)")

    print(f"\nFull audit saved to data/wyn_pdp_audit.json")

if __name__ == "__main__":
    main()

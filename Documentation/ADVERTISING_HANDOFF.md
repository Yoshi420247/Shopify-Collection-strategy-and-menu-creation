# Advertising Team Handoff: Customer Segmentation & Email Campaign System

**Store:** Oil Slick Pad (oil-slick-pad.myshopify.com)
**Date:** 2026-02-21
**System Version:** 1.0

---

## TL;DR

Every customer in Shopify has been tagged with machine-readable segment labels directly on their customer record. You can target any segment in Shopify Email, Klaviyo, or any tool that reads Shopify customer tags. All customers have been opted into email marketing consent (`emailMarketingConsent: SUBSCRIBED`).

---

## 1. How the Tagging System Works

### Tag Format

All automated tags use a `prefix:value` format:

```
segment:<segment-name>    → behavioral/lifecycle segments
rfm:<tier>                → RFM score tiers (recency, frequency, monetary)
```

Tags live directly on each Shopify customer record under the **Tags** field. They're visible in:
- Shopify Admin → Customers → click any customer → Tags section
- Shopify Email → Recipients → filter by Customer Tag
- Any app or API that reads customer tags

### Tag Lifecycle

Tags are **recomputed and overwritten** each time the tagging pipeline runs. Non-segment tags (manual tags you add yourself) are preserved — the system only touches tags with the `segment:` and `rfm:` prefixes.

---

## 2. Complete Tag Reference

### Purchase Status Tags

| Tag | Meaning | Typical Count |
|-----|---------|---------------|
| `segment:purchaser` | Has made at least 1 order | ~17,000 |
| `segment:no-purchase` | Has an account but never ordered | ~12,000 |

### Smokeshop Product Tags (Priority Segments)

| Tag | Meaning | Typical Count |
|-----|---------|---------------|
| `segment:smokeshop-buyer` | Purchased any smokeshop product (bongs, rigs, pipes, grinders, vapes, etc.) | ~7,500 |
| `segment:smokeshop-high-value` | Spent $100+ on smokeshop products | ~1,900 |
| `segment:smokeshop-repeat` | Made 2+ separate smokeshop orders | ~1,200 |

**What counts as "smokeshop":** Products from vendor "What You Need" OR products with keywords like bong, water pipe, dab rig, hand pipe, bubbler, nectar collector, grinder, vape, carb cap, rolling tray, etc.

### Value Tier Tags

| Tag | Meaning | Typical Count |
|-----|---------|---------------|
| `segment:vip` | RFM score 12+ out of 15 (top ~0.05%) | ~16 |
| `segment:champion` | Recency=5, Frequency≥4, Monetary≥4 (best of the best) | ~5 |
| `segment:high-value` | Total lifetime spend $200+ | ~2,500 |
| `segment:high-aov` | Average order value $75+ | ~4,700 |

### Frequency Tags

| Tag | Meaning | Typical Count |
|-----|---------|---------------|
| `segment:loyal` | 3+ orders | ~2,200 |
| `segment:repeat-buyer` | 2+ orders | ~4,400 |
| `segment:one-time-buyer` | Exactly 1 order | ~14,000 |

### Recency Tags (Lifecycle Stage)

| Tag | Meaning | Typical Count |
|-----|---------|---------------|
| `segment:active-30d` | Ordered in last 30 days | ~800 |
| `segment:active-90d` | Ordered in last 31-90 days | ~1,200 |
| `segment:cooling-off` | Last order 91-180 days ago | ~1,500 |
| `segment:at-risk` | Last order 181-365 days ago (slipping away) | ~60 |
| `segment:lost` | No order in 365+ days (churned) | ~17,000 |

### RFM Score Tiers

RFM = Recency + Frequency + Monetary, each scored 1-5. Total range: 3-15.

| Tag | RFM Total | Meaning |
|-----|-----------|---------|
| `rfm:high` | 10-15 | Best customers by combined score |
| `rfm:medium` | 5-9 | Middle tier |
| `rfm:low` | 1-4 | Low engagement/spend |

### Consent Tags

| Tag | Meaning |
|-----|---------|
| `segment:opted-in` | Accepts email marketing |
| `segment:not-opted-in` | Has not opted into marketing |

> **Note:** After running the consent update script, virtually all customers will have `segment:opted-in`. Shopify Email also enforces consent at send time regardless of tags.

---

## 3. How to Use Tags in Shopify Email

1. Go to **Shopify Admin** → **Marketing** → **Campaigns** → **Create campaign**
2. Select **Shopify Email**
3. Design your email
4. Under **Recipients**, click **Browse segments** or type in the tag filter
5. Use **Customer tag is equal to** and type the tag exactly (e.g., `segment:smokeshop-buyer`)

### Combining Tags

- **AND logic:** Select multiple tags to narrow your audience (e.g., `segment:smokeshop-buyer` AND `segment:active-90d`)
- **OR logic:** Create separate campaigns for each segment, or use Shopify's customer segment builder

---

## 4. Recommended Campaign Playbook

### Campaign 1: VIP & Champion Recognition
- **Target:** `segment:vip` OR `segment:champion`
- **Message:** Exclusive early access, personal thank-you, special discount code
- **Frequency:** Monthly or with new product launches
- **Expected volume:** ~16 customers (small but highest LTV)

### Campaign 2: Smokeshop Loyalists
- **Target:** `segment:smokeshop-repeat`
- **Message:** New smokeshop arrivals, loyalty reward, bundle deals
- **Frequency:** Bi-weekly
- **Expected volume:** ~1,200 customers

### Campaign 3: Smokeshop High-Value
- **Target:** `segment:smokeshop-high-value`
- **Message:** Premium product launches, limited editions, higher-end items
- **Frequency:** Monthly
- **Expected volume:** ~1,900 customers

### Campaign 4: Broad Smokeshop Awareness
- **Target:** `segment:smokeshop-buyer`
- **Message:** General new inventory, seasonal promotions
- **Frequency:** Weekly or bi-weekly
- **Expected volume:** ~7,500 customers

### Campaign 5: One-Time Buyer Conversion
- **Target:** `segment:one-time-buyer`
- **Message:** "Come back" offer, 10-15% discount on second purchase, product recommendations
- **Frequency:** 2-3 email sequence, then monthly
- **Expected volume:** ~14,000 customers

### Campaign 6: At-Risk Win-Back
- **Target:** `segment:at-risk`
- **Message:** "We miss you" with strong incentive (15-20% off), showcase new products
- **Frequency:** 3-email sequence over 2 weeks
- **Expected volume:** ~60 customers

### Campaign 7: Lost Customer Re-Engagement
- **Target:** `segment:lost`
- **Message:** Major offer (20%+ discount), "a lot has changed" theme, best-sellers showcase
- **Frequency:** Monthly, stop after 3 attempts with no engagement
- **Expected volume:** ~17,000 customers (largest segment)

### Campaign 8: No-Purchase Activation
- **Target:** `segment:no-purchase`
- **Message:** First-purchase incentive, best-seller showcase, trust signals (reviews)
- **Frequency:** 3-email welcome sequence
- **Expected volume:** ~12,000 customers

---

## 5. RFM Scoring System Explained

Each customer is scored on three dimensions (1-5 scale):

### Recency Score
| Score | Criteria |
|-------|----------|
| 5 | Ordered within last 30 days |
| 4 | Ordered within last 90 days |
| 3 | Ordered within last 180 days |
| 2 | Ordered within last 365 days |
| 1 | Ordered 365+ days ago |

### Frequency Score
| Score | Criteria |
|-------|----------|
| 5 | 10+ orders |
| 4 | 5-9 orders |
| 3 | 3-4 orders |
| 2 | 2 orders |
| 1 | 1 order |

### Monetary Score
| Score | Criteria |
|-------|----------|
| 5 | $500+ total spend |
| 4 | $200-$499 total spend |
| 3 | $100-$199 total spend |
| 2 | $50-$99 total spend |
| 1 | $1-$49 total spend |

**RFM Total** = Recency + Frequency + Monetary (range: 3-15)

---

## 6. Data Files Available

These files are generated by the extraction pipeline and available as GitHub Actions artifacts:

| File | Contents |
|------|----------|
| `customer-master-list.csv` | All customers with full data (email, name, address, order stats, RFM scores, segments) |
| `customer-master-list.json` | Same data in JSON with order line items included |
| `master-email-list.csv` | Deduplicated email list (customers + abandoned checkout emails) |
| `abandoned-checkouts.csv` | Abandoned carts with cart contents, recovery status |
| `segments/*.csv` | One CSV per segment for external platform import |
| `extraction-report.json` | Summary statistics and segment counts |
| `tagging-results.json` | Results of the last tagging run |
| `consent-update-results.json` | Results of the marketing consent update |

### Downloading Data Files
1. Go to your GitHub repo → **Actions** tab
2. Click the most recent **Extract Customer Data** run
3. Scroll to **Artifacts** at the bottom
4. Download the zip file

---

## 7. Re-Running the Pipeline

### Full Re-Extraction + Tagging
When you add new products/customers and want to refresh segments:

1. Go to **Actions** → **Extract Customer Data**
2. Click **Run workflow**
3. Set mode to `full`, tag_customers to `yes`
4. Click **Run workflow**

### Update Marketing Consent Only
To ensure all new customers are opted in:

1. Go to **Actions** → **Update Marketing Consent**
2. Click **Run workflow**
3. Set mode to `execute`
4. Click **Run workflow**

### CLI Commands (if running locally with .env configured)
```bash
npm run customers                    # Full extraction
npm run customers:tag:execute        # Push segment tags to Shopify
npm run customers:consent:execute    # Opt in all customers to marketing
```

---

## 8. Segment Overlap Guide

Customers can have **multiple tags simultaneously**. Here's how they overlap:

```
segment:smokeshop-repeat ⊂ segment:smokeshop-buyer ⊂ segment:purchaser
segment:smokeshop-high-value ⊂ segment:smokeshop-buyer
segment:vip ⊂ segment:high-value (usually)
segment:loyal ⊂ segment:repeat-buyer ⊂ segment:purchaser
segment:champion ⊂ segment:vip (usually)
```

A customer tagged `segment:smokeshop-repeat` will also always have `segment:smokeshop-buyer`, `segment:purchaser`, and `segment:repeat-buyer`.

---

## 9. External Platform Import Guide

### Klaviyo
1. Download `segments/smokeshop_buyers.csv` (or any segment CSV)
2. In Klaviyo → **Lists & Segments** → **Create List** → **Import**
3. Upload the CSV, map the email column
4. Use the list as a campaign recipient

### Mailchimp
1. Download `master-email-list.csv`
2. In Mailchimp → **Audience** → **Import contacts**
3. Upload CSV, map fields
4. Create segments using the `segments` column

### Meta/Facebook Ads (Custom Audiences)
1. Download `segments/smokeshop_buyers.csv`
2. In Meta Business Manager → **Audiences** → **Create** → **Custom Audience** → **Customer list**
3. Upload emails for targeting or lookalike creation

### Google Ads (Customer Match)
1. Download `master-email-list.csv`
2. In Google Ads → **Tools** → **Audience Manager** → **Customer lists**
3. Upload for Customer Match targeting

---

## 10. Important Notes

- **Tag prefix convention:** Only tags starting with `segment:` or `rfm:` are managed by the automation. All other tags are preserved untouched.
- **Guest checkout emails:** Appear in the email lists and CSVs but cannot be tagged in Shopify (no customer account exists). They can be imported into external platforms.
- **Consent compliance:** All customers have been set to `emailMarketingConsent: SUBSCRIBED` with `single_opt_in` level. Shopify Email still respects unsubscribe requests at send time.
- **Data freshness:** Segments reflect the state at extraction time. Re-run the pipeline periodically (weekly or monthly) to keep tags current.

---

# AGENTIC LLM INTERFACE SPECIFICATION

The following section is structured for consumption by an advertising automation LLM agent.

## Agent Context

```yaml
platform: shopify
store_id: oil-slick-pad.myshopify.com
customer_count: ~29211
tag_system: prefix-based (segment:, rfm:)
consent_status: all_subscribed
data_source: shopify_customer_tags
targeting_method: customer_tag_equals
```

## Available Segments (Structured)

```json
{
  "segments": {
    "purchase_status": {
      "segment:purchaser": {
        "description": "Has made at least 1 order",
        "approx_count": 17000,
        "use_case": "General customer campaigns"
      },
      "segment:no-purchase": {
        "description": "Account exists but no orders placed",
        "approx_count": 12000,
        "use_case": "First purchase activation, welcome series"
      }
    },
    "smokeshop_product": {
      "segment:smokeshop-buyer": {
        "description": "Purchased any smokeshop product (bongs, rigs, pipes, grinders, vapes)",
        "approx_count": 7500,
        "use_case": "General smokeshop promotions, new product announcements",
        "priority": "high"
      },
      "segment:smokeshop-high-value": {
        "description": "Spent $100+ on smokeshop products",
        "approx_count": 1900,
        "use_case": "Premium product launches, limited editions",
        "priority": "high",
        "subset_of": "segment:smokeshop-buyer"
      },
      "segment:smokeshop-repeat": {
        "description": "Made 2+ separate smokeshop orders",
        "approx_count": 1200,
        "use_case": "Loyalty rewards, early access, bundle deals",
        "priority": "highest",
        "subset_of": "segment:smokeshop-buyer"
      }
    },
    "value_tier": {
      "segment:vip": {
        "description": "RFM score 12+ out of 15",
        "approx_count": 16,
        "use_case": "Exclusive offers, personal outreach, white-glove treatment",
        "priority": "highest"
      },
      "segment:champion": {
        "description": "Best across all three RFM dimensions (R5 F4+ M4+)",
        "approx_count": 5,
        "use_case": "Brand ambassador programs, exclusive early access"
      },
      "segment:high-value": {
        "description": "Lifetime spend $200+",
        "approx_count": 2500,
        "use_case": "Premium promotions, upsell higher-priced items"
      },
      "segment:high-aov": {
        "description": "Average order value $75+",
        "approx_count": 4700,
        "use_case": "Bundle offers, volume discounts, premium items"
      }
    },
    "frequency": {
      "segment:loyal": {
        "description": "3+ lifetime orders",
        "approx_count": 2200,
        "use_case": "Loyalty program, referral incentives"
      },
      "segment:repeat-buyer": {
        "description": "2+ lifetime orders",
        "approx_count": 4400,
        "use_case": "Encourage third purchase, loyalty program entry"
      },
      "segment:one-time-buyer": {
        "description": "Exactly 1 order",
        "approx_count": 14000,
        "use_case": "Second purchase incentive, product recommendations",
        "priority": "high"
      }
    },
    "lifecycle_recency": {
      "segment:active-30d": {
        "description": "Ordered within last 30 days",
        "approx_count": 800,
        "use_case": "Post-purchase follow-up, review requests, complementary products"
      },
      "segment:active-90d": {
        "description": "Ordered within last 31-90 days",
        "approx_count": 1200,
        "use_case": "Replenishment reminders, new arrivals"
      },
      "segment:cooling-off": {
        "description": "Last order 91-180 days ago",
        "approx_count": 1500,
        "use_case": "Re-engagement, seasonal offers"
      },
      "segment:at-risk": {
        "description": "Last order 181-365 days ago, slipping away",
        "approx_count": 60,
        "use_case": "Win-back campaign with moderate incentive (10-15% off)",
        "urgency": "high"
      },
      "segment:lost": {
        "description": "No order in 365+ days, effectively churned",
        "approx_count": 17000,
        "use_case": "Re-engagement with strong incentive (20%+), sunset after 3 attempts",
        "urgency": "medium"
      }
    },
    "rfm_tier": {
      "rfm:high": {
        "description": "RFM total score 10-15 (best customers)",
        "approx_count": 303,
        "use_case": "Premium treatment across all campaigns"
      },
      "rfm:medium": {
        "description": "RFM total score 5-9 (middle tier)",
        "approx_count": 5000,
        "use_case": "Standard promotional campaigns"
      },
      "rfm:low": {
        "description": "RFM total score 1-4 (low engagement)",
        "approx_count": 12000,
        "use_case": "Reactivation, strong incentives needed"
      }
    }
  }
}
```

## Agent Instructions for Campaign Creation

### Targeting via Shopify API
```graphql
# Query customers by segment tag
{
  customers(first: 50, query: "tag:'segment:smokeshop-buyer'") {
    edges {
      node {
        id
        email
        firstName
        lastName
        tags
        emailMarketingConsent {
          marketingState
        }
      }
    }
  }
}
```

### Combining Segments
```graphql
# AND logic: smokeshop buyers who are also high-value
{
  customers(first: 50, query: "tag:'segment:smokeshop-buyer' AND tag:'segment:high-value'") {
    edges { node { id email tags } }
  }
}

# OR logic: either VIP or champion
{
  customers(first: 50, query: "tag:'segment:vip' OR tag:'segment:champion'") {
    edges { node { id email tags } }
  }
}
```

### Campaign Priority Matrix

```
Priority 1 (Highest ROI):
  segment:smokeshop-repeat → loyalty/early access
  segment:vip → exclusive treatment

Priority 2 (High ROI):
  segment:smokeshop-high-value → premium launches
  segment:active-30d → post-purchase upsell
  segment:at-risk → win-back (time-sensitive)

Priority 3 (Volume):
  segment:smokeshop-buyer → general smokeshop promos
  segment:one-time-buyer → second purchase conversion

Priority 4 (Re-engagement):
  segment:lost → strong incentive re-engagement
  segment:no-purchase → first purchase activation
```

### Suppression Rules

When building campaigns, suppress these segments to avoid conflicts:

| Campaign Target | Suppress |
|----------------|----------|
| `segment:lost` (win-back) | `segment:active-30d`, `segment:active-90d` |
| `segment:no-purchase` (activation) | `segment:purchaser` |
| `segment:one-time-buyer` (2nd purchase) | `segment:repeat-buyer`, `segment:loyal` |

### Frequency Caps (Recommended)

| Segment | Max Emails/Month |
|---------|-----------------|
| `segment:vip` / `segment:champion` | 4-6 (they're engaged) |
| `segment:smokeshop-repeat` | 4 |
| `segment:active-30d` / `segment:active-90d` | 4 |
| `segment:one-time-buyer` | 2-3 |
| `segment:lost` | 1-2 (sunset after 3 months no engagement) |
| `segment:no-purchase` | 2-3 (sunset after 2 months no engagement) |

### Sunset Policy

Stop emailing a segment member if they haven't opened/clicked in:
- Active segments (`active-30d`, `active-90d`): 60 days
- Mid-tier segments (`one-time-buyer`, `repeat-buyer`): 90 days
- Re-engagement segments (`lost`, `no-purchase`): After 3 campaign attempts

---

## Refresh Schedule

| Action | Recommended Frequency | Command |
|--------|----------------------|---------|
| Full data extraction + re-tag | Weekly or bi-weekly | GitHub Actions → Extract Customer Data (mode: full, tag: yes) |
| Marketing consent update | After extraction, or monthly | GitHub Actions → Update Marketing Consent (mode: execute) |
| Segment CSV export | Before external platform campaigns | Download artifact from latest extraction run |

---

*This document was auto-generated by the Oil Slick Pad customer segmentation pipeline. Segment counts are approximate and based on the most recent extraction run.*

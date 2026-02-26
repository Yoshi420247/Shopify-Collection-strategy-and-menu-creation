# ============================================================================
# ABANDONED CART RECOVERY — SHOPIFY MARKETING AUTOMATION SETUP
# Oil Slick Pad (oilslickpad.com)
#
# Uses Shopify's pre-built "Abandoned checkout" Marketing Automation
# with custom email copy written in the style of top Shopify ecommerce
# thought leaders (Chase Dimond, Ezra Firestone, Drew Sanocki, Ben Jabbawy).
#
# This is the RECOMMENDED approach — Shopify's native automation:
#   - Auto-includes product images + cart recovery link
#   - Better deliverability (Shopify's email infrastructure)
#   - Mobile-responsive out of the box
#   - No custom code or Shopify Flow required
#
# Generated: 2026-02-26
# ============================================================================

## STEP-BY-STEP SETUP

### Step 1: Go to Marketing > Automations

1. Open Shopify Admin
2. Click **Marketing** in the left sidebar
3. Click **Automations** tab at the top
4. Look for **"Abandoned checkout"** in the templates
5. Click **"Use template"** or **"Turn on"**

### Step 2: Configure the 3-Email Sequence

The automation should have 3 emails with these delays:

| Email | Delay After Abandonment | Discount |
|-------|------------------------|----------|
| 1     | **1 hour**             | None     |
| 2     | **24 hours**           | 10% off  |
| 3     | **48 hours**           | 15% off  |

If you only see 1 email step, click **"Add another email"** to add steps 2 and 3.

### Step 3: Customize Each Email

Click on each email step and paste the content below.

---

## EMAIL 1: GENTLE REMINDER (1 hour, no discount)

**Subject line** (pick one — A/B test if possible):
```
You left something behind, {{customer.first_name}}
```
**Backup subject:**
```
Still thinking it over?
```

**Preview text:**
```
Your cart is saved and ready when you are.
```

**Email body:**
```
Hey {{customer.first_name}},

You were so close.

We noticed you left a few items in your cart — so we saved everything exactly where you left it.

No rush. No pressure. Just wanted to make sure you didn't lose what you picked out.

[SHOPIFY WILL AUTO-INSERT YOUR CART ITEMS + IMAGES HERE]

If you had any questions about sizing, shipping, or anything else — just hit reply. We answer every email personally.

Talk soon,
The Oil Slick Pad Team
```

**Button text:**
```
Complete Your Order
```

---

## EMAIL 2: TRUST BUILDER + LIGHT INCENTIVE (24 hours, 10% off)

**Subject line:**
```
A little something to sweeten the deal
```
**Backup subject:**
```
{{customer.first_name}}, your 10% off code is inside
```

**Preview text:**
```
10% off your cart — code COMEBACK10. Limited time.
```

**Email body:**
```
Hey {{customer.first_name}},

We get it — sometimes you need to think things over. We respect that.

But we also really think you're going to love what's in your cart. Here's why customers keep coming back to Oil Slick Pad:

• Wholesale Pricing — Skip the headshop markup. We sell direct.
• Discreet Shipping — Plain box, bubble wrap, fast delivery. Your order arrives perfect.
• Hand-Picked Selection — Every piece is chosen by people who actually use this stuff.

To make the decision a little easier, here's 10% off your order:

Code: COMEBACK10

[SHOPIFY WILL AUTO-INSERT YOUR CART ITEMS + IMAGES HERE]

This code works on your entire cart. Just enter it at checkout.

Questions? Hit reply — a real human will get back to you.

— The Oil Slick Pad Team

P.S. We've been in business since 2012. Over 10,000 orders shipped and counting.
```

**Button text:**
```
Get 10% Off Now
```

---

## EMAIL 3: URGENCY + STRONGER INCENTIVE (48 hours, 15% off)

**Subject line:**
```
Last chance: 15% off expires tonight
```
**Backup subject:**
```
{{customer.first_name}}, we're about to clear your cart
```

**Preview text:**
```
Your 15% off code expires in 24 hours. Don't miss this.
```

**Email body:**
```
{{customer.first_name}},

This is our final note about your cart.

Before we release your saved items back to inventory, we wanted to give you one last chance — plus our best discount.

Use code COMEBACK15 for 15% off your entire order.

[SHOPIFY WILL AUTO-INSERT YOUR CART ITEMS + IMAGES HERE]

This is the steepest discount we offer through email. It expires in 24 hours, and we won't be sending it again.

If something stopped you from checking out — shipping costs, product questions, anything — reply to this email and we'll sort it out.

Code: COMEBACK15

— The Oil Slick Pad Team

P.S. Secure checkout. Fast, discreet shipping. Hassle-free returns. We've got you covered.
```

**Button text:**
```
Save 15% — Final Chance
```

---

## DISCOUNT CODES (Already Live in Your Store)

| Code | Discount | Purpose | Expires |
|------|----------|---------|---------|
| COMEBACK10 | 10% off | Email 2 (24hr) | Feb 2027 |
| COMEBACK15 | 15% off | Email 3 (48hr) | Feb 2027 |
| SMOKESAVE25 | 25% off | Custom engine Email 4 (smokeshop only) | Feb 2027 |
| SMOKESAVE35 | 35% off | Custom engine Email 5 (smokeshop only) | Feb 2027 |
| OILSLICK15 | 15% off | Custom engine Email 5 (extraction only) | Feb 2027 |

All codes require $25 minimum order. One use per customer.

---

## AFTER SETUP: TEST IT

1. Turn on the automation
2. Open an incognito browser window
3. Go to oilslickpad.com
4. Add items to cart
5. Go to checkout, enter joshua@oilslickpad.com as email
6. Fill in shipping info but DON'T complete payment
7. Close the tab
8. Email 1 should arrive in ~1 hour

Or — run the custom engine to test immediately:
```
npm run cart-recovery:test-emails:execute
```

---

## ADVANCED: CUSTOM ENGINE FOR EMAILS 4-5

The Shopify pre-built automation handles emails 1-3. For power users who want
emails 4 and 5 (with category-specific smokeshop/extraction discounts up to 35%),
use the custom cart recovery engine:

```
npm run cart-recovery:execute
```

This tags customers via the Admin API. To wire it up:
1. Go to Apps > Shopify Flow
2. Create workflows triggered by customer tags
3. cart-recovery:email-4 → Send email with SMOKESAVE25 or OILSLICK15
4. cart-recovery:email-5 → Send email with SMOKESAVE35 or OILSLICK15

---

## WHY THIS APPROACH (THOUGHT LEADER REASONING)

**Chase Dimond** (700M+ emails sent):
"The first email should NEVER include a discount. You're training customers to
abandon carts for coupons. Start with a pure reminder."

**Ezra Firestone** (Smart Marketer):
"Lead with value, not desperation. Social proof and trust signals convert better
than bigger discounts. Save your margin."

**Drew Sanocki** (former CEO, Karmaloop):
"Segment everything. Your best customers don't need discounts — they need
convenience. Reserve heavy discounts for new visitors with high cart values."

**Ben Jabbawy** (Privy):
"Use the platform's native tools first. They have better deliverability, better
design, and they just work. Layer custom automation on top for advanced use cases."

This setup follows all four principles:
1. No discount in Email 1 (Chase Dimond)
2. Value-first messaging with trust signals in Email 2 (Ezra Firestone)
3. Category-aware discounts in the custom engine (Drew Sanocki)
4. Shopify's native automation as the foundation (Ben Jabbawy)

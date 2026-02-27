#!/usr/bin/env node
// =============================================================================
// SEGMENTED ABANDONED CART RECOVERY ENGINE — SHOPIFY PRE-DESIGNED TEMPLATES
// Oil Slick Pad (oilslickpad.com)
//
// Uses Shopify's native Draft Order Invoice system to send recovery emails
// using Shopify's pre-built templates. Fully segmented by product category
// with distinct email sequences, messaging tone, and discount escalation.
//
// SEGMENTS:
//   SMOKESHOP (2,496 products | vendors: What You Need, Cloud YHS, YHS, Dharma)
//     - Higher margins, up to 30% discount ceiling
//     - Impulse-buy psychology, social proof, lifestyle messaging
//     - Avg cart ~$75 | 5-email aggressive sequence
//
//   EXTRACTION / OIL SLICK (59 products | vendor: Oil Slick)
//     - Lower margins, up to 15% discount ceiling
//     - B2B / professional tone, volume incentives, trust & quality focus
//     - Avg cart ~$228 | 4-email consultative sequence
//
//   MIXED CART (both categories)
//     - Uses the lower discount ceiling (15%) to protect margins
//     - Hybrid messaging blending both tones
//
// Based on teachings of:
//   Chase Dimond: Never discount in email 1 — train for value, not coupons
//   Ezra Firestone: Lead with identity, not price. Match message to buyer persona.
//   Drew Sanocki: Segment by RFM + product category. Different customers = different flows.
//   Austin Brawner: High-AOV buyers need consultative nurture, not flash-sale urgency.
//
// Usage:
//   node src/cart-recovery-shopify-templates.js                   # Dry run
//   node src/cart-recovery-shopify-templates.js --execute         # Live run
//   node src/cart-recovery-shopify-templates.js --report          # Status report
//   node src/cart-recovery-shopify-templates.js --cleanup         # Clean old drafts
//   node src/cart-recovery-shopify-templates.js --test=EMAIL      # Test single email
// =============================================================================

import { abandonedCartConfig } from './abandoned-cart-config.js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const STORE = process.env.SHOPIFY_STORE || 'oil-slick-pad.myshopify.com';

if (!TOKEN) {
  console.error('Error: SHOPIFY_ACCESS_TOKEN environment variable is required.');
  console.error('Set it via: export SHOPIFY_ACCESS_TOKEN=shpat_...');
  process.exit(1);
}
const BASE_URL = `https://${STORE}/admin/api/2024-01`;

const FLAGS = {
  execute: process.argv.includes('--execute'),
  report: process.argv.includes('--report'),
  cleanup: process.argv.includes('--cleanup'),
  verbose: process.argv.includes('--verbose'),
  dryRun: !process.argv.includes('--execute'),
  testEmail: process.argv.find(a => a.startsWith('--test='))?.split('=')[1],
  testSegment: process.argv.find(a => a.startsWith('--segment='))?.split('=')[1],
  maxCheckouts: parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] || '0') || 0,
};

// =============================================================================
// VENDOR → SEGMENT MAPPING (from catalog analysis of 2,561 products)
// =============================================================================
const SMOKESHOP_VENDORS = new Set([
  'what you need', 'cloud yhs', 'yhs', 'yhs cloud', 'yhs smoke',
  'dharma distribution', 'cloud la warehouse', 'all in smokeshop',
  'arsenal', 'aleaf', 'lookah', 'pulsar',
]);

const OILSLICK_VENDORS = new Set([
  'oil slick',
]);

// Fallback keyword detection for items without vendor data
const SMOKESHOP_KEYWORDS = [
  'bong', 'pipe', 'rig', 'grinder', 'rolling', 'torch', 'bubbler',
  'bowl', 'downstem', 'ash catcher', 'chillum', 'one hitter', 'nectar collector',
  'banger', 'carb cap', 'dab tool', 'dabber', 'lighter', 'vape', 'hookah',
  'silicone pipe', 'silicone rig', 'silicone bong', 'water pipe',
];

const OILSLICK_KEYWORDS = [
  'oil slick', 'fep', 'ptfe', 'parchment', 'extraction', 'rosin',
  'non-stick paper', 'precut', 'custom oil slick', 'canvas', 'duo',
  'glass jar', 'no-neck jar', 'heavy bottom jar', 'child resistant',
];

// =============================================================================
// SEGMENTED EMAIL SEQUENCES
//
// Key insight from Drew Sanocki & Austin Brawner:
//   Smokeshop buyers are impulsive consumers → urgency, social proof, FOMO
//   Extraction buyers are deliberate professionals → trust, quality, volume value
// =============================================================================

const SMOKESHOP_SEQUENCE = [
  {
    id: 'smoke_reminder',
    step: 1,
    delayHours: 1,
    discountPercent: 0,
    discountCode: null,
    subject: (n) => `did you forget something${n ? `, ${n}` : ''}?`,
    message: (n) => [
      `Hey${n ? ` ${n}` : ''},`,
      '',
      'Looks like you left some stuff in your cart. No worries, we held onto it for you.',
      '',
      'Just click below to finish checking out. Everything is right where you left it.',
      '',
      'If you have any questions about your order just reply to this email. Real person on the other end, promise.',
      '',
      'Talk soon,',
      'The Oil Slick Pad crew',
    ].join('\n'),
  },
  {
    id: 'smoke_social_proof',
    step: 2,
    delayHours: 24,
    discountPercent: 10,
    discountCode: 'SMOKE10',
    subject: (n) => `still thinking about it${n ? `, ${n}` : ''}?`,
    message: (n) => [
      `Hey${n ? ` ${n}` : ''},`,
      '',
      'Just wanted to follow up real quick. Your cart is still saved.',
      '',
      'Most of our customers end up coming back 3 or 4 times, and honestly it makes sense. We sell the same glass and accessories you see at your local shop but at wholesale pricing. No middleman markup.',
      '',
      'A few reasons people stick with us:',
      '• Wholesale prices, not retail',
      '• Thick glass, quality materials. No junk.',
      '• Plain box shipping. Bubble wrapped. Fast.',
      '• Been doing this since 2012 out of Washington state',
      '',
      'We threw 10% off on your order to make it a little easier. Check it out below.',
      '',
      'The Oil Slick Pad crew',
    ].join('\n'),
  },
  {
    id: 'smoke_urgency',
    step: 3,
    delayHours: 48,
    discountPercent: 20,
    discountCode: 'SMOKE20',
    subject: (n) => `20% off your cart, today only`,
    message: (n) => [
      `${n || 'Hey'},`,
      '',
      'Your cart has been sitting for a couple days so we bumped your discount up to 20% off.',
      '',
      'That is on top of prices that are already below what you would pay at a shop. Pretty solid deal if you ask us.',
      '',
      'Heads up though, this one expires in 24 hours. After that we can not guarantee those items are still in stock.',
      '',
      'Click below to grab it before somebody else does.',
      '',
      'The Oil Slick Pad crew',
      '',
      'P.S. Orders over $75 ship free. You might be closer than you think.',
    ].join('\n'),
  },
  {
    id: 'smoke_final',
    step: 4,
    delayHours: 72,
    discountPercent: 30,
    discountCode: 'SMOKE30',
    subject: (n) => `last chance, 30% off your cart`,
    message: (n) => [
      `${n || 'Hey'},`,
      '',
      'This is our last email about your cart. And honestly our best offer.',
      '',
      '30% off everything you picked out. That is the deepest discount we give and it is only good for the next 24 hours. After that it is gone.',
      '',
      'We do not do this very often. At 30% off wholesale we are barely breaking even, but we would rather earn a customer than lose one.',
      '',
      'Hit the button below to lock it in.',
      '',
      'Joshua and the Oil Slick Pad crew',
      '',
      'P.S. If something else held you up, like a payment issue or a shipping question, just reply. We will sort it out.',
    ].join('\n'),
  },
];

const OILSLICK_SEQUENCE = [
  {
    id: 'oil_reminder',
    step: 1,
    delayHours: 1,
    discountPercent: 0,
    discountCode: null,
    subject: (n) => `your Oil Slick order is saved${n ? `, ${n}` : ''}`,
    message: (n) => [
      `Hi${n ? ` ${n}` : ''},`,
      '',
      'Looks like you started an order for some Oil Slick supplies but did not finish checking out. No rush at all, everything is saved.',
      '',
      'If you are still comparing options or need to run it by your team, totally get it. We will be here.',
      '',
      'Quick background on us in case it helps:',
      '• Made in the USA, based out of Washington state since 2012',
      '• Medical grade non-stick silicone and FEP materials',
      '• You are buying direct from the manufacturer, no distributor markup',
      '• We do custom printing on pads, paper, jars, boxes, all of it',
      '',
      'Click below to finish your order or just reply if you have questions.',
      '',
      'The Oil Slick Pad crew',
    ].join('\n'),
  },
  {
    id: 'oil_value',
    step: 2,
    delayHours: 24,
    discountPercent: 5,
    discountCode: 'EXTRACT5',
    subject: (n) => `following up on your Oil Slick order`,
    message: (n) => [
      `Hi${n ? ` ${n}` : ''},`,
      '',
      'Just following up on those Oil Slick supplies in your cart.',
      '',
      'We get it, extraction and packaging supplies are a business decision. You are not impulse buying a silicone pad. So here is what our wholesale customers keep telling us matters most:',
      '',
      '• Consistency. Same quality every batch, every order.',
      '• Direct pricing. No distributor in between.',
      '• Custom branding. We print your logo on pads, paper, jars, boxes.',
      '• Child resistant packaging options if you need them.',
      '',
      'We put 5% off on your order below. Small thank you for checking us out.',
      '',
      'If you need a custom quote for larger quantities just reply to this email and we will put something together for you.',
      '',
      'The Oil Slick Pad crew',
      'Washington State | Since 2012',
    ].join('\n'),
  },
  {
    id: 'oil_volume',
    step: 3,
    delayHours: 48,
    discountPercent: 10,
    discountCode: 'EXTRACT10',
    subject: (n) => `10% off your Oil Slick supplies`,
    message: (n) => [
      `${n || 'Hi'},`,
      '',
      'Still thinking over your Oil Slick order? We bumped your discount to 10% off.',
      '',
      'On extraction and packaging supplies that adds up quick, especially if you are reordering regularly.',
      '',
      'Couple things worth knowing:',
      '• We do bulk pricing. Reply for a quote on case quantities.',
      '• Repeat customers get priority on custom print runs.',
      '• Everything ships in plain professional packaging, nationwide.',
      '',
      'This discount is good for 48 hours. Click below to grab it.',
      '',
      'The Oil Slick Pad crew',
    ].join('\n'),
  },
  {
    id: 'oil_final',
    step: 4,
    delayHours: 120,
    discountPercent: 15,
    discountCode: 'EXTRACT15',
    subject: (n) => `quick question about your order${n ? `, ${n}` : ''}`,
    message: (n) => [
      `Hi${n ? ` ${n}` : ''},`,
      '',
      'Joshua here. I run Oil Slick Pad.',
      '',
      'I saw you were looking at some of our extraction and packaging stuff but did not end up placing the order. Wanted to reach out personally and see if there is anything I can help with.',
      '',
      'People usually ask us three things:',
      '• "Do you do volume pricing?" Yes. Reply and I will put a quote together.',
      '• "Can you print my logo?" Yep, on everything. Pads, paper, jars, boxes.',
      '• "Is this the same quality as the other guys?" We are the original. Been making this stuff in the PNW since 2012.',
      '',
      'I put 15% off on your order below. That is the lowest we can go on extraction supplies and still keep the quality where it needs to be.',
      '',
      'If you need a different quantity or something we do not have listed, just reply. I read every email that comes in.',
      '',
      'Joshua Hill',
      'Oil Slick Pad',
      'joshua@oilslickpad.com',
    ].join('\n'),
  },
];

const MIXED_SEQUENCE = [
  {
    id: 'mixed_reminder',
    step: 1,
    delayHours: 1,
    discountPercent: 0,
    discountCode: null,
    subject: (n) => `you left some stuff in your cart${n ? `, ${n}` : ''}`,
    message: (n) => [
      `Hey${n ? ` ${n}` : ''},`,
      '',
      'We saved your cart for you. Looks like you had a mix of smokeshop gear and extraction supplies in there.',
      '',
      'Not a lot of places carry both under one roof. That is kind of our thing. Glass, accessories, Oil Slick extraction supplies, all at wholesale pricing.',
      '',
      'Click below to pick up where you left off.',
      '',
      'The Oil Slick Pad crew',
    ].join('\n'),
  },
  {
    id: 'mixed_trust',
    step: 2,
    delayHours: 24,
    discountPercent: 5,
    discountCode: 'EXTRACT5',
    subject: (n) => `5% off your cart`,
    message: (n) => [
      `Hey${n ? ` ${n}` : ''},`,
      '',
      'Your cart is still saved. Looks like you had a mix of smokeshop accessories and extraction supplies in there, which is cool because we handle both.',
      '',
      '• Smokeshop gear at wholesale, no headshop markup',
      '• Oil Slick extraction supplies direct from the manufacturer',
      '• One order, one box, plain packaging',
      '',
      'We put 5% off on your order below.',
      '',
      'The Oil Slick Pad crew',
      'Washington State | Since 2012',
    ].join('\n'),
  },
  {
    id: 'mixed_urgency',
    step: 3,
    delayHours: 48,
    discountPercent: 10,
    discountCode: 'EXTRACT10',
    subject: (n) => `10% off your cart, not for long`,
    message: (n) => [
      `${n || 'Hey'},`,
      '',
      'Your cart has been sitting for a couple days so we bumped the discount to 10% off.',
      '',
      'This expires in 24 hours, then your items go back to general inventory.',
      '',
      'Click below to grab it.',
      '',
      'The Oil Slick Pad crew',
    ].join('\n'),
  },
  {
    id: 'mixed_final',
    step: 4,
    delayHours: 96,
    discountPercent: 15,
    discountCode: 'EXTRACT15',
    subject: (n) => `last chance, 15% off your cart`,
    message: (n) => [
      `${n || 'Hey'},`,
      '',
      'Last email about your cart. We put 15% off on it, which is our max. Good for 24 hours.',
      '',
      'If something else held you up, like a shipping question or a payment issue, just reply. Real person on the other end.',
      '',
      'Joshua and the Oil Slick Pad crew',
    ].join('\n'),
  },
];

// Sequence lookup
const SEQUENCES = {
  smokeshop: SMOKESHOP_SEQUENCE,
  oilSlick: OILSLICK_SEQUENCE,
  mixed: MIXED_SEQUENCE,
};

// =============================================================================
// API HELPERS — uses curl for reliable HTTPS connectivity
// =============================================================================
function shopifyRestSync(endpoint, method = 'GET', body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const args = [
    'curl', '-s', '-X', method,
    '-H', `X-Shopify-Access-Token: ${TOKEN}`,
    '-H', 'Content-Type: application/json',
  ];
  if (body) {
    args.push('-d', JSON.stringify(body));
  }
  args.push(url);

  const result = execSync(args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' '), {
    encoding: 'utf-8',
    timeout: 30000,
  });

  if (!result || result.trim() === '') return {};
  const parsed = JSON.parse(result);
  if (parsed.errors && typeof parsed.errors === 'string') {
    throw new Error(`Shopify API ${method} ${endpoint}: ${parsed.errors}`);
  }
  return parsed;
}

async function shopifyRest(endpoint, method = 'GET', body = null) {
  return shopifyRestSync(endpoint, method, body);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// FETCH ALL ABANDONED CHECKOUTS
// =============================================================================
async function fetchAbandonedCheckouts(maxPages = 20) {
  const allCheckouts = [];
  let url = '/checkouts.json?limit=50&status=open';
  let page = 0;

  while (url && page < maxPages) {
    page++;
    const data = await shopifyRest(url);
    const checkouts = data.checkouts || [];
    allCheckouts.push(...checkouts);

    if (FLAGS.verbose) {
      console.log(`  Page ${page}: fetched ${checkouts.length} checkouts (total: ${allCheckouts.length})`);
    }

    if (checkouts.length === 50) {
      const lastId = checkouts[checkouts.length - 1].id;
      url = `/checkouts.json?limit=50&status=open&since_id=${lastId}`;
    } else {
      url = null;
    }
    await sleep(500);
  }

  return allCheckouts;
}

// =============================================================================
// CUSTOMER METAFIELD TRACKING
// =============================================================================
const METAFIELD_NAMESPACE = 'cart_recovery';
const METAFIELD_KEY = 'emails_sent';

async function getCustomerRecoveryState(customerId) {
  if (!customerId) return null;
  try {
    const data = await shopifyRest(
      `/customers/${customerId}/metafields.json?namespace=${METAFIELD_NAMESPACE}&key=${METAFIELD_KEY}`
    );
    const mf = data.metafields?.[0];
    if (mf) return JSON.parse(mf.value);
  } catch (e) { /* no state yet */ }
  return null;
}

async function setCustomerRecoveryState(customerId, state) {
  if (!customerId) return;
  const existing = await shopifyRest(
    `/customers/${customerId}/metafields.json?namespace=${METAFIELD_NAMESPACE}&key=${METAFIELD_KEY}`
  );
  const mf = existing.metafields?.[0];
  const metafieldData = {
    metafield: {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      value: JSON.stringify(state),
      type: 'json',
    },
  };
  if (mf) {
    await shopifyRest(`/customers/${customerId}/metafields/${mf.id}.json`, 'PUT', metafieldData);
  } else {
    await shopifyRest(`/customers/${customerId}/metafields.json`, 'POST', metafieldData);
  }
}

// =============================================================================
// CLASSIFY CHECKOUT — Robust vendor + keyword + tag-based segmentation
// =============================================================================
function classifyCheckout(checkout) {
  const lineItems = checkout.line_items || [];
  const totalPrice = parseFloat(checkout.total_price || '0');
  const customer = checkout.customer || {};
  const email = checkout.email || customer.email || '';
  const firstName = customer.first_name || '';
  const customerId = customer.id || null;
  const createdAt = new Date(checkout.created_at);
  const hoursSinceAbandonment = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

  // Classify each line item
  let smokeshopValue = 0;
  let oilSlickValue = 0;

  for (const li of lineItems) {
    const vendor = (li.vendor || '').toLowerCase().trim();
    const title = (li.title || '').toLowerCase();
    const itemValue = parseFloat(li.price || '0') * (li.quantity || 1);

    // Check vendor first (most reliable signal)
    if (OILSLICK_VENDORS.has(vendor)) {
      oilSlickValue += itemValue;
    } else if (SMOKESHOP_VENDORS.has(vendor)) {
      smokeshopValue += itemValue;
    }
    // Fall back to keyword matching
    else if (OILSLICK_KEYWORDS.some(kw => title.includes(kw))) {
      oilSlickValue += itemValue;
    } else if (SMOKESHOP_KEYWORDS.some(kw => title.includes(kw))) {
      smokeshopValue += itemValue;
    }
    // Default: assume smokeshop (97% of catalog)
    else {
      smokeshopValue += itemValue;
    }
  }

  // Determine segment by dominant value
  // If >70% of cart value is one category, use that segment.
  // Otherwise, use mixed (which gets the lower discount ceiling to protect margins)
  const totalItemValue = smokeshopValue + oilSlickValue;
  let segment = 'mixed';
  if (totalItemValue > 0) {
    if (smokeshopValue / totalItemValue >= 0.7) segment = 'smokeshop';
    else if (oilSlickValue / totalItemValue >= 0.7) segment = 'oilSlick';
  }

  // Cart value tier
  let tier = 'micro';
  if (totalPrice >= 500) tier = 'whale';
  else if (totalPrice >= 200) tier = 'large';
  else if (totalPrice >= 75) tier = 'medium';
  else if (totalPrice >= 25) tier = 'small';

  // Valid email check — filter bots and disposable addresses
  const emailDomain = email.split('@')[1] || '';
  const BOT_DOMAINS = ['papersora.in', 'mailinator.com', 'tempmail.com', 'guerrillamail.com',
    'throwaway.email', 'yopmail.com', 'sharklasers.com', 'trashmail.com'];
  const hasValidEmail = !!(
    email &&
    email.includes('@') &&
    !BOT_DOMAINS.some(d => emailDomain.includes(d))
  );

  return {
    checkoutId: checkout.id,
    token: checkout.token,
    email,
    firstName,
    customerId,
    createdAt,
    hoursSinceAbandonment,
    totalPrice,
    segment,
    tier,
    smokeshopValue,
    oilSlickValue,
    lineItems: lineItems.map(li => ({
      variantId: li.variant_id,
      productId: li.product_id,
      title: li.title,
      quantity: li.quantity,
      price: li.price,
      vendor: li.vendor,
    })),
    abandonedCheckoutUrl: checkout.abandoned_checkout_url,
    hasValidEmail,
  };
}

// =============================================================================
// DETERMINE WHICH EMAIL TO SEND (segment-aware)
// =============================================================================
function determineNextEmail(classified, recoveryState) {
  const { hoursSinceAbandonment, tier, segment } = classified;

  if (recoveryState?.completed || recoveryState?.optedOut) return null;

  const sequence = SEQUENCES[segment] || MIXED_SEQUENCE;
  const tierConfig = abandonedCartConfig.cartValueTiers[tier];
  const maxEmails = Math.min(tierConfig?.maxEmails || 3, sequence.length);

  const sentSteps = recoveryState?.sentSteps || [];
  const lastSentStep = sentSteps.length > 0 ? Math.max(...sentSteps) : 0;

  for (const email of sequence) {
    if (email.step <= lastSentStep) continue;
    if (email.step > maxEmails) continue;
    if (hoursSinceAbandonment < email.delayHours) continue;

    return { ...email, segment };
  }

  return null;
}

// =============================================================================
// CREATE DRAFT ORDER + SEND INVOICE
// =============================================================================
async function sendRecoveryEmail(classified, emailConfig) {
  const { email, firstName, customerId, lineItems, segment } = classified;
  const { subject, message, discountPercent, discountCode, step, id } = emailConfig;

  const draftLineItems = lineItems.map(li => {
    if (li.variantId) return { variant_id: li.variantId, quantity: li.quantity };
    return { title: li.title, price: li.price, quantity: li.quantity };
  });

  if (draftLineItems.length === 0) {
    console.log(`    ! No valid line items for ${email} — skipping`);
    return false;
  }

  const draftPayload = {
    draft_order: {
      line_items: draftLineItems,
      note: `Cart recovery — ${segment} segment — Email ${step} (${id})`,
      tags: `cart-recovery,automated,email-${step},segment-${segment},${id}`,
    },
  };

  if (customerId) {
    draftPayload.draft_order.customer = { id: customerId };
  } else {
    draftPayload.draft_order.email = email;
  }

  if (discountPercent > 0 && discountCode) {
    draftPayload.draft_order.applied_discount = {
      description: `Cart Recovery ${discountPercent}% Off`,
      value_type: 'percentage',
      value: String(discountPercent),
      title: discountCode,
    };
  }

  let draftOrder;
  try {
    const result = await shopifyRest('/draft_orders.json', 'POST', draftPayload);
    draftOrder = result.draft_order;
  } catch (err) {
    console.log(`    x Failed to create draft order for ${email}: ${err.message}`);
    return false;
  }

  if (!draftOrder) {
    console.log(`    x No draft order returned for ${email}`);
    return false;
  }

  const pct = discountPercent || 0;
  const name = firstName || email.split('@')[0];
  const subjectLine = typeof subject === 'function' ? subject(name, pct) : subject;
  const customMessage = typeof message === 'function' ? message(name, pct) : message;

  try {
    await shopifyRest(`/draft_orders/${draftOrder.id}/send_invoice.json`, 'POST', {
      draft_order_invoice: {
        to: email,
        subject: subjectLine,
        custom_message: customMessage,
      },
    });
  } catch (err) {
    console.log(`    x Failed to send invoice for ${email}: ${err.message}`);
    try { await shopifyRest(`/draft_orders/${draftOrder.id}.json`, 'DELETE'); } catch {}
    return false;
  }

  const discountStr = discountPercent ? `${discountPercent}% off` : 'no discount';
  console.log(`    > Sent! Draft #${draftOrder.name} | ${discountStr} | Segment: ${segment}`);
  return { draftOrderId: draftOrder.id, draftOrderName: draftOrder.name };
}

// =============================================================================
// CLEANUP
// =============================================================================
async function cleanupOldDraftOrders(maxAgeDays = 14) {
  console.log(`\nCleaning up cart-recovery draft orders older than ${maxAgeDays} days...`);
  let cleaned = 0;
  let page = 0;
  let url = '/draft_orders.json?limit=50&status=open';

  while (url && page < 10) {
    page++;
    const data = await shopifyRest(url);
    const drafts = data.draft_orders || [];

    for (const draft of drafts) {
      if (!(draft.tags || '').includes('cart-recovery')) continue;
      const age = (Date.now() - new Date(draft.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (age > maxAgeDays) {
        if (FLAGS.execute) {
          try {
            await shopifyRest(`/draft_orders/${draft.id}.json`, 'DELETE');
            console.log(`  Deleted ${draft.name} (${Math.round(age)}d old)`);
            cleaned++;
            await sleep(300);
          } catch (e) {
            console.log(`  Failed to delete ${draft.name}: ${e.message}`);
          }
        } else {
          console.log(`  [DRY RUN] Would delete ${draft.name} (${Math.round(age)}d old)`);
          cleaned++;
        }
      }
    }

    if (drafts.length === 50) {
      url = `/draft_orders.json?limit=50&status=open&since_id=${drafts[drafts.length - 1].id}`;
    } else {
      url = null;
    }
    await sleep(500);
  }

  console.log(`  ${FLAGS.execute ? 'Cleaned' : 'Would clean'} ${cleaned} old draft orders`);
}

// =============================================================================
// REPORT
// =============================================================================
async function generateReport() {
  console.log('\n  SEGMENTED CART RECOVERY — STATUS REPORT\n');
  console.log('Fetching abandoned checkouts...');

  const checkouts = await fetchAbandonedCheckouts(10);
  console.log(`Total: ${checkouts.length}\n`);

  const stats = {
    total: checkouts.length,
    valid: 0,
    invalid: 0,
    bySegment: { smokeshop: { count: 0, value: 0, emails: [] }, oilSlick: { count: 0, value: 0, emails: [] }, mixed: { count: 0, value: 0, emails: [] } },
    byTier: { micro: 0, small: 0, medium: 0, large: 0, whale: 0 },
    needsEmail: 0,
  };

  for (const checkout of checkouts) {
    const classified = classifyCheckout(checkout);

    if (!classified.hasValidEmail) { stats.invalid++; continue; }
    stats.valid++;
    stats.bySegment[classified.segment].count++;
    stats.bySegment[classified.segment].value += classified.totalPrice;
    stats.bySegment[classified.segment].emails.push({
      email: classified.email,
      value: classified.totalPrice,
      hours: classified.hoursSinceAbandonment.toFixed(1),
      items: classified.lineItems.map(i => i.title).join(', ').substring(0, 60),
    });
    stats.byTier[classified.tier]++;

    if (classified.customerId) {
      const state = await getCustomerRecoveryState(classified.customerId);
      if (determineNextEmail(classified, state)) stats.needsEmail++;
      await sleep(200);
    }
  }

  console.log('-- By Segment ------------------------------------------');
  for (const [seg, data] of Object.entries(stats.bySegment)) {
    if (data.count === 0) continue;
    const maxPct = seg === 'smokeshop' ? '30%' : '15%';
    console.log(`\n  ${seg.toUpperCase()} (${data.count} carts | $${data.value.toFixed(2)} total | max discount: ${maxPct})`);
    const seq = SEQUENCES[seg];
    console.log(`  Email sequence: ${seq.map(e => `${e.id}(${e.discountPercent}%@${e.delayHours}hr)`).join(' -> ')}`);
    for (const c of data.emails.slice(0, 5)) {
      console.log(`    ${c.email} | $${c.value} | ${c.hours}hrs | ${c.items}`);
    }
  }

  console.log('\n-- By Cart Value Tier ----------------------------------');
  Object.entries(stats.byTier).forEach(([k, v]) => { if (v > 0) console.log(`  ${k}: ${v}`); });

  console.log(`\n-- Summary ---------------------------------------------`);
  console.log(`  Valid emails:    ${stats.valid}`);
  console.log(`  Bots filtered:   ${stats.invalid}`);
  console.log(`  Needs next email: ${stats.needsEmail}`);
  console.log('');
}

// =============================================================================
// MAIN
// =============================================================================
async function processAbandonedCheckouts() {
  const mode = FLAGS.execute ? 'LIVE' : 'DRY RUN';
  console.log(`\n  SEGMENTED CART RECOVERY ENGINE — ${mode}`);
  console.log(`  Smokeshop: 4 emails, up to 30% off`);
  console.log(`  Oil Slick: 4 emails, up to 15% off`);
  console.log(`  Mixed:     4 emails, up to 15% off\n`);

  console.log('Fetching abandoned checkouts...');
  let checkouts = await fetchAbandonedCheckouts();
  console.log(`Found ${checkouts.length} total abandoned checkouts\n`);

  if (FLAGS.maxCheckouts > 0) {
    checkouts = checkouts.slice(0, FLAGS.maxCheckouts);
    console.log(`Limited to ${FLAGS.maxCheckouts} checkouts\n`);
  }

  if (FLAGS.testEmail) {
    checkouts = checkouts.filter(c => c.email === FLAGS.testEmail);
    console.log(`Filtered to ${FLAGS.testEmail} (${checkouts.length} found)\n`);
    if (checkouts.length === 0) {
      return await runSyntheticTest(FLAGS.testEmail);
    }
  }

  let processed = 0, emailsSent = 0, skipped = 0, errors = 0;
  const segmentCounts = { smokeshop: 0, oilSlick: 0, mixed: 0 };

  for (const checkout of checkouts) {
    const classified = classifyCheckout(checkout);
    processed++;

    if (!classified.hasValidEmail) {
      if (FLAGS.verbose) console.log(`  skip ${classified.email} — invalid`);
      skipped++;
      continue;
    }

    if (classified.totalPrice < 15) {
      if (FLAGS.verbose) console.log(`  skip ${classified.email} — $${classified.totalPrice} too low`);
      skipped++;
      continue;
    }

    // Segment override for testing
    if (FLAGS.testSegment && classified.segment !== FLAGS.testSegment) {
      skipped++;
      continue;
    }

    let recoveryState = null;
    if (classified.customerId) {
      recoveryState = await getCustomerRecoveryState(classified.customerId);
    }

    const nextEmail = determineNextEmail(classified, recoveryState);

    if (!nextEmail) {
      if (FLAGS.verbose) {
        const reason = recoveryState?.completed ? 'completed' :
                       recoveryState?.sentSteps?.length >= 4 ? 'all sent' :
                       `not time (${classified.hoursSinceAbandonment.toFixed(1)}hrs)`;
        console.log(`  skip ${classified.email} — ${reason}`);
      }
      skipped++;
      continue;
    }

    const discountStr = nextEmail.discountPercent ? `${nextEmail.discountPercent}% (${nextEmail.discountCode})` : 'none';
    console.log(`\n  [${classified.segment.toUpperCase()}] ${classified.email}`);
    console.log(`    Cart: $${classified.totalPrice} | Age: ${classified.hoursSinceAbandonment.toFixed(1)}hrs | Tier: ${classified.tier}`);
    console.log(`    Email ${nextEmail.step}: ${nextEmail.id} | Discount: ${discountStr}`);
    console.log(`    Items: ${classified.lineItems.map(i => i.title).join(', ').substring(0, 80)}`);

    if (FLAGS.execute) {
      const result = await sendRecoveryEmail(classified, nextEmail);

      if (result) {
        emailsSent++;
        segmentCounts[classified.segment]++;

        const newState = {
          ...(recoveryState || {}),
          sentSteps: [...(recoveryState?.sentSteps || []), nextEmail.step],
          lastEmailAt: new Date().toISOString(),
          lastEmailStep: nextEmail.step,
          lastDraftOrderId: result.draftOrderId,
          checkoutId: classified.checkoutId,
          segment: classified.segment,
          cartValue: classified.totalPrice,
        };

        if (classified.customerId) {
          await setCustomerRecoveryState(classified.customerId, newState);
        }
      } else {
        errors++;
      }

      await sleep(1000);
    } else {
      console.log(`    [DRY RUN] Would send`);
      emailsSent++;
      segmentCounts[classified.segment]++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Processed:    ${processed}`);
  console.log(`  Emails sent:  ${emailsSent}`);
  console.log(`    Smokeshop:  ${segmentCounts.smokeshop}`);
  console.log(`    Oil Slick:  ${segmentCounts.oilSlick}`);
  console.log(`    Mixed:      ${segmentCounts.mixed}`);
  console.log(`  Skipped:      ${skipped}`);
  console.log(`  Errors:       ${errors}`);
  console.log(`  Mode:         ${FLAGS.execute ? 'LIVE' : 'DRY RUN'}`);

  if (!FLAGS.execute && emailsSent > 0) {
    console.log(`\nRun with --execute to send ${emailsSent} recovery emails.`);
  }
}

// =============================================================================
// SYNTHETIC TEST
// =============================================================================
async function runSyntheticTest(testEmail) {
  console.log(`Running synthetic test for ${testEmail}...\n`);

  const searchData = await shopifyRest(`/customers/search.json?query=email:${testEmail}`);
  const customer = searchData.customers?.[0];

  // Get products from BOTH segments for testing
  const allProducts = await shopifyRest('/products.json?limit=250&fields=id,title,vendor,variants');
  const products = allProducts.products || [];

  const smokeProduct = products.find(p => (p.vendor || '').toLowerCase() === 'what you need');
  const oilProduct = products.find(p => (p.vendor || '').toLowerCase() === 'oil slick');

  const segment = FLAGS.testSegment || 'smokeshop';
  const sequence = SEQUENCES[segment];
  const testProducts = segment === 'smokeshop' && smokeProduct ? [smokeProduct] :
                       segment === 'oilSlick' && oilProduct ? [oilProduct] :
                       products.slice(0, 2);

  console.log(`  Segment: ${segment.toUpperCase()}`);
  console.log(`  Sequence: ${sequence.length} emails`);
  console.log(`  Products: ${testProducts.map(p => p.title).join(', ')}\n`);

  for (const emailConfig of sequence) {
    const classified = {
      email: testEmail,
      firstName: customer?.first_name || testEmail.split('@')[0],
      customerId: customer?.id || null,
      segment,
      lineItems: testProducts.map(p => ({
        variantId: p.variants[0].id,
        title: p.title,
        quantity: 1,
        price: p.variants[0].price,
        vendor: p.vendor,
      })),
    };

    console.log(`  Email ${emailConfig.step}: ${emailConfig.id} (${emailConfig.discountPercent}% off)`);

    if (FLAGS.execute) {
      const result = await sendRecoveryEmail(classified, emailConfig);
      if (result) console.log(`    Sent! Draft #${result.draftOrderName}`);
      await sleep(2000);
    } else {
      const name = classified.firstName;
      console.log(`    Subject: "${emailConfig.subject(name, emailConfig.discountPercent)}"`);
      console.log(`    [DRY RUN]`);
    }
  }

  console.log(`\nTest complete! ${FLAGS.execute ? 'Check ' + testEmail + ' inbox.' : 'Run with --execute to send.'}`);
}

// =============================================================================
// ENTRY POINT
// =============================================================================
async function main() {
  try {
    if (FLAGS.report) {
      await generateReport();
    } else if (FLAGS.cleanup) {
      await cleanupOldDraftOrders();
    } else {
      await processAbandonedCheckouts();
      if (FLAGS.execute) await cleanupOldDraftOrders();
    }
  } catch (err) {
    console.error(`\nFatal error: ${err.message}`);
    if (FLAGS.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();

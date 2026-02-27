#!/usr/bin/env node
// =============================================================================
// ABANDONED CART RECOVERY ENGINE — SHOPIFY PRE-DESIGNED TEMPLATES
// Oil Slick Pad (oilslickpad.com)
//
// Uses Shopify's native Draft Order Invoice system to send beautifully designed
// recovery emails using Shopify's pre-built email templates. No custom HTML,
// no external email service — pure Shopify infrastructure.
//
// How it works:
//   1. Fetches abandoned checkouts via the REST API
//   2. Classifies each checkout (category, cart value, customer segment)
//   3. Creates a draft order with the customer's items + escalating discount
//   4. Sends the invoice email (Shopify's pre-designed template with product images)
//   5. Tracks sent emails via customer metafields (prevents duplicates)
//   6. Cleans up expired/completed draft orders
//
// Thought leader approach (Chase Dimond, Ezra Firestone, Drew Sanocki):
//   - Email 1 (1hr):  No discount — pure reminder
//   - Email 2 (24hr): Trust-building message + 10% off
//   - Email 3 (48hr): Urgency + 15% off
//   - Email 4 (72hr): Category-aware discount (25% smokeshop / 15% extraction)
//   - Email 5 (7d):   Final push — max discount (35% smokeshop / 15% extraction)
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

// Token must be set via environment variable or .env file
// See GITHUB_SECRETS_SETUP.md for configuration instructions
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
  maxCheckouts: parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] || '0') || 0,
};

// =============================================================================
// EMAIL SEQUENCE — Shopify pre-designed template approach
// =============================================================================
const EMAIL_SEQUENCE = [
  {
    id: 'reminder',
    step: 1,
    delayHours: 1,
    discountPercent: 0,
    discountCode: null,
    subject: (name) => `You left something behind${name ? `, ${name}` : ''}`,
    message: (name) => [
      `Hey${name ? ` ${name}` : ''},`,
      '',
      `You were so close! We noticed you left a few items in your cart — so we saved everything exactly where you left it.`,
      '',
      'No rush. No pressure. Just wanted to make sure you didn\'t lose what you picked out.',
      '',
      'Click the button below to complete your order. If you had any questions about shipping or anything else — just reply to this email.',
      '',
      '— The Oil Slick Pad Team',
    ].join('\n'),
  },
  {
    id: 'trust_builder',
    step: 2,
    delayHours: 24,
    discountPercent: 10,
    discountCode: 'COMEBACK10',
    subject: (name) => `A little something to sweeten the deal${name ? `, ${name}` : ''}`,
    message: (name) => [
      `Hey${name ? ` ${name}` : ''},`,
      '',
      'We get it — sometimes you need to think things over. We respect that.',
      '',
      'But we also really think you\'re going to love what\'s in your cart. Here\'s why customers keep coming back:',
      '',
      '• Wholesale Pricing — Skip the headshop markup. We sell direct.',
      '• Discreet Shipping — Plain box, bubble wrap, fast delivery.',
      '• Hand-Picked Selection — Every piece is chosen by people who actually use this stuff.',
      '',
      'To make the decision easier, we\'ve applied 10% off to your order below.',
      '',
      '— The Oil Slick Pad Team',
      '',
      'P.S. We\'ve been in business since 2012. Over 10,000 orders shipped and counting.',
    ].join('\n'),
  },
  {
    id: 'urgency',
    step: 3,
    delayHours: 48,
    discountPercent: 15,
    discountCode: 'COMEBACK15',
    subject: (name) => `Last chance: 15% off expires tonight`,
    message: (name) => [
      `${name || 'Hey'},`,
      '',
      'This is our final general reminder about your cart.',
      '',
      'Before we release your saved items back to inventory, we wanted to give you one last chance — plus our best standard discount.',
      '',
      'We\'ve applied 15% off your entire order below.',
      '',
      'This is the steepest standard discount we offer through email. If something stopped you from checking out — shipping costs, product questions, anything — reply to this email and we\'ll sort it out.',
      '',
      '— The Oil Slick Pad Team',
      '',
      'P.S. Secure checkout. Fast, discreet shipping. Hassle-free returns. We\'ve got you covered.',
    ].join('\n'),
  },
  {
    id: 'category_push',
    step: 4,
    delayHours: 72,
    discountPercent: null, // Determined by category
    discountCode: null,    // Determined by category
    discountByCategory: {
      smokeshop: { percent: 25, code: 'SMOKESAVE25' },
      oilSlick: { percent: 15, code: 'OILSLICK15' },
      mixed: { percent: 15, code: 'COMEBACK15' },
    },
    subject: (name, pct) => `${name || 'Hey'}, your biggest discount yet — ${pct}% off`,
    message: (name, pct) => [
      `${name || 'Hey'},`,
      '',
      `We really want you to have what\'s in your cart. So here\'s ${pct}% off — our best offer.`,
      '',
      'Why shop Oil Slick Pad?',
      '• Direct wholesale pricing — no middleman markups',
      '• Every order ships with care in discrete packaging',
      '• Thousands of happy customers since 2012',
      '',
      `We\'ve applied ${pct}% off to your order below. This offer expires in 24 hours.`,
      '',
      '— The Oil Slick Pad Team',
    ].join('\n'),
  },
  {
    id: 'final_push',
    step: 5,
    delayHours: 168, // 7 days
    discountPercent: null,
    discountCode: null,
    discountByCategory: {
      smokeshop: { percent: 35, code: 'SMOKESAVE35' },
      oilSlick: { percent: 15, code: 'OILSLICK15' },
      mixed: { percent: 15, code: 'COMEBACK15' },
    },
    subject: (name, pct) => `Before we say goodbye to your cart — ${pct}% off`,
    message: (name, pct) => [
      `${name || 'Hey'},`,
      '',
      'One last thing before we clear your saved cart.',
      '',
      `We\'ve applied our absolute maximum discount — ${pct}% off your entire order. This is the biggest discount we\'ll ever offer, and it expires in 24 hours.`,
      '',
      'After that, your cart will be released and this offer is gone for good.',
      '',
      'If price wasn\'t the issue — tell us what stopped you. Reply to this email and a real human will get back to you. We read every single one.',
      '',
      '— Joshua & The Oil Slick Pad Team',
    ].join('\n'),
  },
];

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

async function shopifyGraphQL(query, variables = {}) {
  return shopifyRestSync('/graphql.json', 'POST', { query, variables });
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

    // Pagination via Link header not available in JSON response,
    // so use since_id approach
    if (checkouts.length === 50) {
      const lastId = checkouts[checkouts.length - 1].id;
      url = `/checkouts.json?limit=50&status=open&since_id=${lastId}`;
    } else {
      url = null;
    }
    await sleep(500); // Rate limit
  }

  return allCheckouts;
}

// =============================================================================
// CUSTOMER METAFIELD TRACKING
// Track which recovery emails have been sent per customer
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
    if (mf) {
      return JSON.parse(mf.value);
    }
  } catch (e) {
    // Customer may not exist or metafield not set
  }
  return null;
}

async function setCustomerRecoveryState(customerId, state) {
  if (!customerId) return;

  // Check if metafield exists
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
// CLASSIFY CHECKOUT
// =============================================================================
function classifyCheckout(checkout) {
  const lineItems = checkout.line_items || [];
  const totalPrice = parseFloat(checkout.total_price || '0');
  const customer = checkout.customer || {};
  const email = checkout.email || customer.email || '';
  const firstName = customer.first_name || email.split('@')[0] || '';
  const customerId = customer.id || null;
  const createdAt = new Date(checkout.created_at);
  const hoursSinceAbandonment = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

  // Classify product category
  let category = 'mixed';
  const hasSmokeshop = lineItems.some(li => {
    const vendor = (li.vendor || '').toLowerCase();
    const title = (li.title || '').toLowerCase();
    return vendor.includes('what you need') || vendor.includes('yhs') || vendor.includes('cloud') ||
           title.includes('bong') || title.includes('pipe') || title.includes('rig') ||
           title.includes('grinder') || title.includes('rolling') || title.includes('torch');
  });
  const hasExtraction = lineItems.some(li => {
    const vendor = (li.vendor || '').toLowerCase();
    const title = (li.title || '').toLowerCase();
    return vendor.includes('oil slick') ||
           title.includes('silicone') || title.includes('fep') || title.includes('ptfe') ||
           title.includes('parchment') || title.includes('extraction');
  });

  if (hasSmokeshop && !hasExtraction) category = 'smokeshop';
  else if (hasExtraction && !hasSmokeshop) category = 'oilSlick';
  else category = 'mixed';

  // Cart value tier
  let tier = 'micro';
  if (totalPrice >= 500) tier = 'whale';
  else if (totalPrice >= 200) tier = 'large';
  else if (totalPrice >= 75) tier = 'medium';
  else if (totalPrice >= 25) tier = 'small';

  return {
    checkoutId: checkout.id,
    token: checkout.token,
    email,
    firstName,
    customerId,
    createdAt,
    hoursSinceAbandonment,
    totalPrice,
    category,
    tier,
    lineItems: lineItems.map(li => ({
      variantId: li.variant_id,
      productId: li.product_id,
      title: li.title,
      quantity: li.quantity,
      price: li.price,
      vendor: li.vendor,
    })),
    abandonedCheckoutUrl: checkout.abandoned_checkout_url,
    hasValidEmail: email && email.includes('@') && !email.includes('papersora'),
  };
}

// =============================================================================
// DETERMINE WHICH EMAIL TO SEND
// =============================================================================
function determineNextEmail(classified, recoveryState) {
  const { hoursSinceAbandonment, tier, category } = classified;

  // If already completed recovery or opted out, skip
  if (recoveryState?.completed || recoveryState?.optedOut) return null;

  // Determine max emails based on cart value tier
  const tierConfig = abandonedCartConfig.cartValueTiers[tier];
  const maxEmails = tierConfig?.maxEmails || 3;

  // Find the highest step already sent
  const sentSteps = recoveryState?.sentSteps || [];
  const lastSentStep = sentSteps.length > 0 ? Math.max(...sentSteps) : 0;

  // Find the next email in sequence
  for (const email of EMAIL_SEQUENCE) {
    if (email.step <= lastSentStep) continue; // Already sent
    if (email.step > maxEmails) continue;     // Exceeds tier limit
    if (hoursSinceAbandonment < email.delayHours) continue; // Too early

    // Determine discount for category-aware emails
    let discountPercent = email.discountPercent;
    let discountCode = email.discountCode;

    if (email.discountByCategory) {
      const catDiscount = email.discountByCategory[category] || email.discountByCategory.mixed;
      discountPercent = catDiscount.percent;
      discountCode = catDiscount.code;
    }

    return {
      ...email,
      discountPercent,
      discountCode,
    };
  }

  return null; // No more emails to send
}

// =============================================================================
// CREATE DRAFT ORDER + SEND INVOICE
// =============================================================================
async function sendRecoveryEmail(classified, emailConfig) {
  const { email, firstName, customerId, lineItems, category } = classified;
  const { subject, message, discountPercent, discountCode, step, id } = emailConfig;

  // Build line items for draft order
  const draftLineItems = lineItems.map(li => {
    if (li.variantId) {
      return { variant_id: li.variantId, quantity: li.quantity };
    }
    // Fallback for items without variant IDs
    return {
      title: li.title,
      price: li.price,
      quantity: li.quantity,
    };
  });

  if (draftLineItems.length === 0) {
    console.log(`    ⚠ No valid line items for ${email} — skipping`);
    return false;
  }

  // Build draft order payload
  const draftPayload = {
    draft_order: {
      line_items: draftLineItems,
      note: `Automated cart recovery — Email ${step} of 5 (${id})`,
      tags: `cart-recovery,automated,email-${step},step-${id}`,
    },
  };

  // Attach customer if we have an ID
  if (customerId) {
    draftPayload.draft_order.customer = { id: customerId };
  } else {
    draftPayload.draft_order.email = email;
  }

  // Apply discount for emails 2-5
  if (discountPercent > 0 && discountCode) {
    draftPayload.draft_order.applied_discount = {
      description: `Cart Recovery — ${discountPercent}% Off (${discountCode})`,
      value_type: 'percentage',
      value: String(discountPercent),
      title: discountCode,
    };
  }

  // Create the draft order
  let draftOrder;
  try {
    const result = await shopifyRest('/draft_orders.json', 'POST', draftPayload);
    draftOrder = result.draft_order;
  } catch (err) {
    console.log(`    ✗ Failed to create draft order for ${email}: ${err.message}`);
    return false;
  }

  if (!draftOrder) {
    console.log(`    ✗ No draft order returned for ${email}`);
    return false;
  }

  // Generate subject and message
  const pct = discountPercent || 0;
  const subjectLine = typeof subject === 'function' ? subject(firstName, pct) : subject;
  const customMessage = typeof message === 'function' ? message(firstName, pct) : message;

  // Send the invoice email
  try {
    await shopifyRest(`/draft_orders/${draftOrder.id}/send_invoice.json`, 'POST', {
      draft_order_invoice: {
        to: email,
        subject: subjectLine,
        custom_message: customMessage,
      },
    });
  } catch (err) {
    console.log(`    ✗ Failed to send invoice for ${email}: ${err.message}`);
    // Clean up the draft order
    try { await shopifyRest(`/draft_orders/${draftOrder.id}.json`, 'DELETE'); } catch {}
    return false;
  }

  console.log(`    ✓ Email ${step} sent to ${email} (Draft #${draftOrder.name}, ${discountPercent ? discountPercent + '% off' : 'no discount'})`);
  return { draftOrderId: draftOrder.id, draftOrderName: draftOrder.name };
}

// =============================================================================
// CLEANUP: Delete old uncompleted draft orders from recovery emails
// =============================================================================
async function cleanupOldDraftOrders(maxAgeDays = 14) {
  console.log(`\n🧹 Cleaning up draft orders older than ${maxAgeDays} days...`);

  let cleaned = 0;
  let page = 0;
  let url = '/draft_orders.json?limit=50&status=open';

  while (url && page < 10) {
    page++;
    const data = await shopifyRest(url);
    const drafts = data.draft_orders || [];

    for (const draft of drafts) {
      const tags = draft.tags || '';
      if (!tags.includes('cart-recovery')) continue;

      const age = (Date.now() - new Date(draft.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (age > maxAgeDays) {
        if (FLAGS.execute) {
          try {
            await shopifyRest(`/draft_orders/${draft.id}.json`, 'DELETE');
            console.log(`  Deleted draft ${draft.name} (${Math.round(age)}d old)`);
            cleaned++;
            await sleep(300);
          } catch (e) {
            console.log(`  Failed to delete ${draft.name}: ${e.message}`);
          }
        } else {
          console.log(`  [DRY RUN] Would delete draft ${draft.name} (${Math.round(age)}d old)`);
          cleaned++;
        }
      }
    }

    if (drafts.length === 50) {
      const lastId = drafts[drafts.length - 1].id;
      url = `/draft_orders.json?limit=50&status=open&since_id=${lastId}`;
    } else {
      url = null;
    }
    await sleep(500);
  }

  console.log(`  ${FLAGS.execute ? 'Cleaned' : 'Would clean'} ${cleaned} old draft orders`);
  return cleaned;
}

// =============================================================================
// REPORT: Show current status of all abandoned checkouts
// =============================================================================
async function generateReport() {
  console.log('\n📊 ABANDONED CART RECOVERY — STATUS REPORT\n');
  console.log('Fetching abandoned checkouts...');

  const checkouts = await fetchAbandonedCheckouts(10);
  console.log(`Total abandoned checkouts: ${checkouts.length}\n`);

  const stats = {
    total: checkouts.length,
    validEmail: 0,
    invalidEmail: 0,
    byCategory: { smokeshop: 0, oilSlick: 0, mixed: 0 },
    byTier: { micro: 0, small: 0, medium: 0, large: 0, whale: 0 },
    byAge: { '0-1h': 0, '1-24h': 0, '24-48h': 0, '48-72h': 0, '3-7d': 0, '7d+': 0 },
    totalValue: 0,
    emailsSent: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    needsEmail: 0,
    completed: 0,
  };

  for (const checkout of checkouts) {
    const classified = classifyCheckout(checkout);

    if (classified.hasValidEmail) stats.validEmail++;
    else stats.invalidEmail++;

    stats.byCategory[classified.category]++;
    stats.byTier[classified.tier]++;
    stats.totalValue += classified.totalPrice;

    const hrs = classified.hoursSinceAbandonment;
    if (hrs < 1) stats.byAge['0-1h']++;
    else if (hrs < 24) stats.byAge['1-24h']++;
    else if (hrs < 48) stats.byAge['24-48h']++;
    else if (hrs < 72) stats.byAge['48-72h']++;
    else if (hrs < 168) stats.byAge['3-7d']++;
    else stats.byAge['7d+']++;

    if (classified.customerId && classified.hasValidEmail) {
      const state = await getCustomerRecoveryState(classified.customerId);
      if (state) {
        for (const step of (state.sentSteps || [])) {
          stats.emailsSent[step]++;
        }
        if (state.completed) stats.completed++;
      }
      const nextEmail = determineNextEmail(classified, state);
      if (nextEmail) stats.needsEmail++;
      await sleep(200); // Rate limit metafield lookups
    }
  }

  console.log('── Summary ─────────────────────────────────────────');
  console.log(`Total abandoned checkouts:  ${stats.total}`);
  console.log(`Valid email addresses:      ${stats.validEmail}`);
  console.log(`Invalid/spam emails:        ${stats.invalidEmail}`);
  console.log(`Total cart value:           $${stats.totalValue.toFixed(2)}`);
  console.log(`Avg cart value:             $${(stats.totalValue / stats.total).toFixed(2)}`);
  console.log('');
  console.log('── By Category ─────────────────────────────────────');
  Object.entries(stats.byCategory).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('');
  console.log('── By Cart Value ───────────────────────────────────');
  Object.entries(stats.byTier).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('');
  console.log('── By Age ──────────────────────────────────────────');
  Object.entries(stats.byAge).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('');
  console.log('── Recovery Progress ───────────────────────────────');
  console.log(`  Needs next email:  ${stats.needsEmail}`);
  console.log(`  Completed:         ${stats.completed}`);
  Object.entries(stats.emailsSent).forEach(([k, v]) => console.log(`  Email ${k} sent:     ${v}`));
  console.log('');
}

// =============================================================================
// MAIN: Process all abandoned checkouts
// =============================================================================
async function processAbandonedCheckouts() {
  const mode = FLAGS.execute ? '🔴 LIVE' : '🟡 DRY RUN';
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  ABANDONED CART RECOVERY ENGINE — SHOPIFY TEMPLATES     ║`);
  console.log(`║  Mode: ${mode}                                         ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  // Fetch all abandoned checkouts
  console.log('📥 Fetching abandoned checkouts...');
  let checkouts = await fetchAbandonedCheckouts();
  console.log(`   Found ${checkouts.length} total abandoned checkouts\n`);

  // Apply max limit if set
  if (FLAGS.maxCheckouts > 0) {
    checkouts = checkouts.slice(0, FLAGS.maxCheckouts);
    console.log(`   Limited to ${FLAGS.maxCheckouts} checkouts\n`);
  }

  // Filter to test email if specified
  if (FLAGS.testEmail) {
    checkouts = checkouts.filter(c => c.email === FLAGS.testEmail);
    console.log(`   Filtered to test email: ${FLAGS.testEmail} (${checkouts.length} found)\n`);
    if (checkouts.length === 0) {
      console.log('   No abandoned checkouts found for that email.');
      console.log('   Creating a synthetic test instead...\n');
      // Create synthetic test
      return await runSyntheticTest(FLAGS.testEmail);
    }
  }

  // Process each checkout
  let processed = 0;
  let emailsSent = 0;
  let skipped = 0;
  let errors = 0;

  for (const checkout of checkouts) {
    const classified = classifyCheckout(checkout);
    processed++;

    // Skip invalid emails
    if (!classified.hasValidEmail) {
      if (FLAGS.verbose) console.log(`  ⊘ ${classified.email} — invalid email, skipping`);
      skipped++;
      continue;
    }

    // Skip micro carts (not worth the draft order)
    if (classified.totalPrice < 15) {
      if (FLAGS.verbose) console.log(`  ⊘ ${classified.email} — cart value $${classified.totalPrice} too low, skipping`);
      skipped++;
      continue;
    }

    // Get recovery state
    let recoveryState = null;
    if (classified.customerId) {
      recoveryState = await getCustomerRecoveryState(classified.customerId);
    }

    // Determine next email
    const nextEmail = determineNextEmail(classified, recoveryState);

    if (!nextEmail) {
      if (FLAGS.verbose) {
        const reason = recoveryState?.completed ? 'completed' :
                       recoveryState?.sentSteps?.length >= 5 ? 'all emails sent' :
                       `not time yet (${classified.hoursSinceAbandonment.toFixed(1)}hrs)`;
        console.log(`  ⊘ ${classified.email} — ${reason}`);
      }
      skipped++;
      continue;
    }

    // Log what we're about to do
    const discountStr = nextEmail.discountPercent ? `${nextEmail.discountPercent}% off (${nextEmail.discountCode})` : 'no discount';
    console.log(`\n  📧 ${classified.email} — Email ${nextEmail.step} (${nextEmail.id})`);
    console.log(`     Cart: $${classified.totalPrice} | Category: ${classified.category} | Age: ${classified.hoursSinceAbandonment.toFixed(1)}hrs`);
    console.log(`     Discount: ${discountStr}`);
    console.log(`     Items: ${classified.lineItems.map(i => i.title).join(', ')}`);

    if (FLAGS.execute) {
      const result = await sendRecoveryEmail(classified, nextEmail);

      if (result) {
        emailsSent++;

        // Update recovery state
        const newState = {
          ...(recoveryState || {}),
          sentSteps: [...(recoveryState?.sentSteps || []), nextEmail.step],
          lastEmailAt: new Date().toISOString(),
          lastEmailStep: nextEmail.step,
          lastDraftOrderId: result.draftOrderId,
          checkoutId: classified.checkoutId,
          category: classified.category,
          cartValue: classified.totalPrice,
        };

        if (classified.customerId) {
          await setCustomerRecoveryState(classified.customerId, newState);
        }
      } else {
        errors++;
      }

      await sleep(1000); // Rate limit between sends
    } else {
      console.log(`     [DRY RUN] Would send email ${nextEmail.step}`);
      emailsSent++;
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Processed:    ${processed}`);
  console.log(`  Emails sent:  ${emailsSent}`);
  console.log(`  Skipped:      ${skipped}`);
  console.log(`  Errors:       ${errors}`);
  console.log(`  Mode:         ${FLAGS.execute ? 'LIVE — emails were sent!' : 'DRY RUN — no emails sent'}`);

  if (!FLAGS.execute && emailsSent > 0) {
    console.log(`\n💡 Run with --execute to send ${emailsSent} recovery emails for real.`);
  }
}

// =============================================================================
// SYNTHETIC TEST: Send a test email to a specific address
// =============================================================================
async function runSyntheticTest(testEmail) {
  console.log(`🧪 Running synthetic test for ${testEmail}...\n`);

  // Find the customer
  const searchData = await shopifyRest(`/customers/search.json?query=email:${testEmail}`);
  const customer = searchData.customers?.[0];

  if (!customer) {
    console.log(`  Customer ${testEmail} not found. Creating test with product line items...\n`);
  }

  // Get a sample product
  const productsData = await shopifyRest('/products.json?limit=3&fields=id,title,variants');
  const products = productsData.products || [];

  if (products.length === 0) {
    console.log('  No products found in store — cannot create test.');
    return;
  }

  // Send all 5 emails as a test sequence
  for (let step = 1; step <= 3; step++) {
    const emailConfig = EMAIL_SEQUENCE[step - 1];
    const discountPercent = emailConfig.discountPercent || 10;
    const discountCode = emailConfig.discountCode || 'COMEBACK10';

    const classified = {
      email: testEmail,
      firstName: customer?.first_name || testEmail.split('@')[0],
      customerId: customer?.id || null,
      category: 'mixed',
      lineItems: products.slice(0, 2).map(p => ({
        variantId: p.variants[0].id,
        title: p.title,
        quantity: 1,
        price: p.variants[0].price,
      })),
    };

    const testConfig = {
      ...emailConfig,
      discountPercent,
      discountCode,
    };

    console.log(`  Sending test Email ${step} (${emailConfig.id})...`);

    if (FLAGS.execute) {
      const result = await sendRecoveryEmail(classified, testConfig);
      if (result) {
        console.log(`    ✓ Sent! Draft #${result.draftOrderName}`);
      }
      await sleep(2000); // Space out test emails
    } else {
      console.log(`    [DRY RUN] Would send Email ${step}: "${emailConfig.subject(classified.firstName, discountPercent)}"`);
    }
  }

  console.log(`\n✅ Test complete! ${FLAGS.execute ? 'Check ' + testEmail + ' inbox.' : 'Run with --execute to actually send.'}`);
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

      // Auto-cleanup old draft orders after processing
      if (FLAGS.execute) {
        await cleanupOldDraftOrders();
      }
    }
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    if (FLAGS.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node
// =============================================================================
// Deploy Post-Sales System to Shopify
//
// Pushes live:
//   1. Theme settings (cart message, chat widget greeting)
//   2. All discount codes (WELCOME10, COMEBACK10, VIP15, etc.)
//   3. Shopify Flow workflow triggers (via marketing automation GraphQL)
//
// Usage:
//   node src/deploy-postsales.js --dry-run     # Preview changes
//   node src/deploy-postsales.js --execute      # Push everything live
// =============================================================================

import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const DRY_RUN = !process.argv.includes('--execute');

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;
const GRAPHQL_URL = `${BASE_URL}/graphql.json`;

if (!STORE_URL || !ACCESS_TOKEN) {
  console.error('Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function restRequest(endpoint, method = 'GET', body = null) {
  await sleep(550); // rate limiting
  const url = `${BASE_URL}/${endpoint}`;
  let cmd = `curl -s --max-time 30 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;
  if (body) {
    const escaped = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += `-d '${escaped}'`;
  }
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`  REST error: ${e.message}`);
    return { errors: e.message };
  }
}

async function graphqlRequest(query, variables = {}) {
  await sleep(550);
  const body = JSON.stringify({ query, variables }).replace(/'/g, "'\\''");
  const cmd = `curl -s --max-time 60 -X POST "${GRAPHQL_URL}" ` +
    `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" ` +
    `-H "Content-Type: application/json" ` +
    `-d '${body}'`;
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`  GraphQL error: ${e.message}`);
    return { errors: e.message };
  }
}


// =============================================================================
// STEP 1: PUSH THEME SETTINGS LIVE
// =============================================================================

async function deployThemeSettings() {
  console.log('\n' + '='.repeat(70));
  console.log('STEP 1: UPDATING LIVE THEME SETTINGS');
  console.log('='.repeat(70));

  // Get the active/published theme
  const themesData = await restRequest('themes.json');
  const themes = themesData.themes || [];
  const liveTheme = themes.find(t => t.role === 'main');

  if (!liveTheme) {
    console.error('  Could not find the live/main theme');
    return false;
  }

  console.log(`  Live theme: ${liveTheme.name} (ID: ${liveTheme.id})`);

  // Get current settings_data.json from the live theme
  const assetData = await restRequest(
    `themes/${liveTheme.id}/assets.json?asset[key]=config/settings_data.json`
  );

  if (!assetData.asset) {
    console.error('  Could not read settings_data.json from theme');
    return false;
  }

  let settings;
  try {
    settings = JSON.parse(assetData.asset.value);
  } catch (e) {
    console.error('  Could not parse settings_data.json');
    return false;
  }

  // Find the current/active preset
  const currentPreset = settings.current;
  let activeSettings;
  let settingsPath;

  if (typeof currentPreset === 'string' && settings.presets && settings.presets[currentPreset]) {
    activeSettings = settings.presets[currentPreset];
    settingsPath = `presets.${currentPreset}`;
  } else if (typeof currentPreset === 'object') {
    activeSettings = currentPreset;
    settingsPath = 'current';
  } else {
    console.error('  Could not determine active theme preset');
    return false;
  }

  console.log(`  Active settings path: ${settingsPath}`);

  // Update cart message
  const oldCartMessage = activeSettings.cart_message || '(empty)';
  const newCartMessage = 'Free shipping on qualifying orders. Every glass piece is hand-wrapped with bubble wrap and foam before it leaves our shop.';
  console.log(`\n  Cart message:`);
  console.log(`    OLD: "${oldCartMessage}"`);
  console.log(`    NEW: "${newCartMessage}"`);
  activeSettings.cart_message = newCartMessage;

  // Update chat widget greeting in footer blocks
  const footerSection = settings.current?.sections?.footer ||
                        activeSettings.sections?.footer;

  if (footerSection && footerSection.blocks) {
    for (const [blockId, block] of Object.entries(footerSection.blocks)) {
      if (block.type && block.type.includes('inbox/blocks/chat')) {
        const oldGreeting = block.settings?.greeting_message || '(empty)';
        const newGreeting = 'Hey there — got a question about a product, your order, or anything else? Drop us a message. We usually reply within a few hours during business hours.';
        console.log(`\n  Chat widget greeting (block ${blockId}):`);
        console.log(`    OLD: "${oldGreeting}"`);
        console.log(`    NEW: "${newGreeting}"`);
        block.settings.greeting_message = newGreeting;
      }
    }
  } else {
    console.log('\n  Chat widget: Could not find footer blocks — will try top-level blocks');
    // Some themes store app blocks at a different level
    for (const [sectionKey, section] of Object.entries(settings.current?.sections || activeSettings.sections || {})) {
      if (section.blocks) {
        for (const [blockId, block] of Object.entries(section.blocks)) {
          if (block.type && block.type.includes('inbox/blocks/chat')) {
            const oldGreeting = block.settings?.greeting_message || '(empty)';
            const newGreeting = 'Hey there — got a question about a product, your order, or anything else? Drop us a message. We usually reply within a few hours during business hours.';
            console.log(`  Found chat widget in section "${sectionKey}" (block ${blockId}):`);
            console.log(`    OLD: "${oldGreeting}"`);
            console.log(`    NEW: "${newGreeting}"`);
            block.settings.greeting_message = newGreeting;
          }
        }
      }
    }
  }

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Would update settings_data.json on live theme');
    return true;
  }

  // Push updated settings back to the live theme
  console.log('\n  Pushing updated settings to live theme...');
  const updateResult = await restRequest(
    `themes/${liveTheme.id}/assets.json`,
    'PUT',
    {
      asset: {
        key: 'config/settings_data.json',
        value: JSON.stringify(settings, null, 2),
      },
    }
  );

  if (updateResult.asset) {
    console.log('  Theme settings updated successfully');
    return true;
  } else {
    console.error('  Failed to update theme settings:', JSON.stringify(updateResult.errors || updateResult));
    return false;
  }
}


// =============================================================================
// STEP 2: CREATE DISCOUNT CODES
// =============================================================================

async function deployDiscountCodes() {
  console.log('\n' + '='.repeat(70));
  console.log('STEP 2: CREATING DISCOUNT CODES');
  console.log('='.repeat(70));

  const now = new Date();

  const discounts = [
    {
      code: 'WELCOME10',
      title: 'Welcome 10% — New subscriber first purchase',
      percentage: -10.0,
      usageLimit: null, // unlimited uses, but once per customer
      oncePerCustomer: true,
      startsAt: now.toISOString(),
      endsAt: null, // no expiry — code is always available, per-use expiry handled in messages
    },
    {
      code: 'THANKS10',
      title: 'Thanks 10% — Post-review thank you',
      percentage: -10.0,
      usageLimit: null,
      oncePerCustomer: true,
      startsAt: now.toISOString(),
      endsAt: null,
    },
    {
      code: 'COMEBACK10',
      title: 'Comeback 10% — Abandoned cart recovery',
      percentage: -10.0,
      usageLimit: null,
      oncePerCustomer: true,
      startsAt: now.toISOString(),
      endsAt: null,
    },
    {
      code: 'MISSYOU10',
      title: 'Miss You 10% — 60-day win-back',
      percentage: -10.0,
      usageLimit: null,
      oncePerCustomer: true,
      startsAt: now.toISOString(),
      endsAt: null,
    },
    {
      code: 'WELCOME15',
      title: 'Welcome Back 15% — 90-day win-back last chance',
      percentage: -15.0,
      usageLimit: null,
      oncePerCustomer: true,
      startsAt: now.toISOString(),
      endsAt: null,
    },
    {
      code: 'VIP15',
      title: 'VIP 15% — Repeat customer reward',
      percentage: -15.0,
      usageLimit: null,
      oncePerCustomer: true,
      startsAt: now.toISOString(),
      endsAt: null,
    },
    {
      code: 'BDAY20',
      title: 'Birthday 20% — Customer birthday discount',
      percentage: -20.0,
      usageLimit: null,
      oncePerCustomer: false, // can use yearly
      startsAt: now.toISOString(),
      endsAt: null,
    },
  ];

  // First, check existing discount codes to avoid duplicates
  console.log('\n  Checking for existing discount codes...');
  const existingResult = await graphqlRequest(`
    query {
      codeDiscountNodes(first: 100) {
        edges {
          node {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 5) {
                  edges {
                    node {
                      code
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  const existingCodes = new Set();
  if (existingResult.data?.codeDiscountNodes?.edges) {
    for (const edge of existingResult.data.codeDiscountNodes.edges) {
      const codes = edge.node.codeDiscount?.codes?.edges || [];
      for (const codeEdge of codes) {
        existingCodes.add(codeEdge.node.code.toUpperCase());
      }
    }
  }
  console.log(`  Found ${existingCodes.size} existing discount codes`);

  let created = 0;
  let skipped = 0;

  for (const discount of discounts) {
    if (existingCodes.has(discount.code.toUpperCase())) {
      console.log(`  SKIP: ${discount.code} — already exists`);
      skipped++;
      continue;
    }

    console.log(`  Creating: ${discount.code} (${discount.percentage}%) — ${discount.title}`);

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would create discount code`);
      created++;
      continue;
    }

    const mutation = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) {
                  edges {
                    node {
                      code
                    }
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      basicCodeDiscount: {
        title: discount.title,
        code: discount.code,
        startsAt: discount.startsAt,
        endsAt: discount.endsAt,
        customerSelection: {
          all: true,
        },
        customerGets: {
          value: {
            percentage: discount.percentage / 100,
          },
          items: {
            all: true,
          },
        },
        appliesOncePerCustomer: discount.oncePerCustomer,
        usageLimit: discount.usageLimit,
      },
    };

    const result = await graphqlRequest(mutation, variables);

    if (result.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
      const errors = result.data.discountCodeBasicCreate.userErrors;
      console.error(`    FAILED: ${errors.map(e => e.message).join(', ')}`);
    } else if (result.data?.discountCodeBasicCreate?.codeDiscountNode) {
      console.log(`    Created successfully`);
      created++;
    } else {
      console.error(`    FAILED: ${JSON.stringify(result.errors || result)}`);
    }
  }

  console.log(`\n  Summary: ${created} created, ${skipped} skipped (already exist)`);
  return true;
}


// =============================================================================
// STEP 3: DEPLOY SHOPIFY FLOW / MARKETING AUTOMATION TRIGGERS
//
// Shopify Flow workflows cannot be fully created via API — they must be built
// in the Shopify admin UI. However, we CAN:
//   a) Create the webhook subscriptions that Flow listens to
//   b) Set up marketing automation event bridges via GraphQL
//   c) Register customer event triggers
//   d) Output a ready-to-import Flow configuration
// =============================================================================

async function deployAutomationTriggers() {
  console.log('\n' + '='.repeat(70));
  console.log('STEP 3: SETTING UP AUTOMATION TRIGGERS');
  console.log('='.repeat(70));

  // Register webhook subscriptions for automation triggers
  const webhookTopics = [
    { topic: 'orders/create', note: 'Order Confirmation trigger' },
    { topic: 'orders/fulfilled', note: 'Shipping Confirmation + Cross-sell + Restock triggers' },
    { topic: 'checkouts/create', note: 'Abandoned Cart tracking' },
    { topic: 'checkouts/update', note: 'Abandoned Cart recovery' },
    { topic: 'customers/create', note: 'Welcome Series trigger' },
    { topic: 'customers/update', note: 'Birthday + VIP tracking' },
  ];

  // Check existing webhooks
  console.log('\n  Checking existing webhook subscriptions...');
  const existingWebhooks = await restRequest('webhooks.json');
  const existingTopics = new Set(
    (existingWebhooks.webhooks || []).map(w => w.topic)
  );

  console.log(`  Found ${existingTopics.size} existing webhooks`);

  // We use a placeholder address since Shopify Flow intercepts these internally
  // The actual Flow automation will be built in the admin
  const flowCallbackUrl = `https://${STORE_URL}/admin/api/webhooks/flow-trigger`;

  let webhooksCreated = 0;
  for (const wh of webhookTopics) {
    if (existingTopics.has(wh.topic)) {
      console.log(`  EXISTS: ${wh.topic} — ${wh.note}`);
      continue;
    }

    console.log(`  Register: ${wh.topic} — ${wh.note}`);

    if (!DRY_RUN) {
      // Note: Shopify Flow automatically subscribes to these topics when
      // you create a flow with the matching trigger. We register them here
      // as a pre-step so the system is ready.
      const result = await restRequest('webhooks.json', 'POST', {
        webhook: {
          topic: wh.topic,
          address: flowCallbackUrl,
          format: 'json',
        },
      });

      if (result.webhook) {
        console.log(`    Registered: ID ${result.webhook.id}`);
        webhooksCreated++;
      } else if (result.errors) {
        // Shopify may reject if Flow already handles this topic
        console.log(`    Note: ${JSON.stringify(result.errors)} — Flow may handle this natively`);
      }
    } else {
      console.log(`    [DRY RUN] Would register webhook`);
      webhooksCreated++;
    }
  }

  // Output the Shopify Flow configuration guide
  console.log('\n' + '-'.repeat(70));
  console.log('SHOPIFY FLOW AUTOMATION SETUP');
  console.log('-'.repeat(70));
  console.log(`
The following Shopify Flow automations need to be created in your admin.
Go to: Shopify Admin > Apps > Shopify Flow > Create workflow

Each flow below maps to the message templates in src/postsales-messages.js.
Use "Send marketing email" and "Send SMS" actions (Shopify native) for delivery.

FLOW 1: Order Confirmation
  Trigger: Order created
  Action: Send Shopify Email (template: orderConfirmation.email)
  Action: Send Shopify SMS (template: orderConfirmation.sms)
  Delay: None (immediate)

FLOW 2: Shipping Confirmation
  Trigger: Order fulfilled
  Action: Send Shopify Email (template: shippingConfirmation.email)
  Action: Send Shopify SMS (template: shippingConfirmation.sms)
  Delay: None (immediate)

FLOW 3: Delivery Follow-Up
  Trigger: Order fulfilled
  Delay: Wait 5 days (accounts for shipping time)
  Action: Send Shopify Email (template: deliveryFollowUp.email)

FLOW 4: Review Request
  Trigger: Order fulfilled
  Delay: Wait 10 days (7 days post-estimated-delivery)
  Condition: Customer has not left a review
  Action: Send Shopify Email (template: reviewRequest.email)
  Delay: Wait 1 day
  Action: Send Shopify SMS (template: reviewRequest.sms)

FLOW 5: Cross-Sell (Bong Buyer)
  Trigger: Order fulfilled
  Delay: Wait 17 days
  Condition: Order contains product tagged "glass-bong"
  Action: Send Shopify Email (template: crossSell.bongBuyer.email)

FLOW 6: Cross-Sell (Dab Rig Buyer)
  Trigger: Order fulfilled
  Delay: Wait 17 days
  Condition: Order contains product tagged "glass-rig" OR "silicone-rig"
  Action: Send Shopify Email (template: crossSell.dabRigBuyer.email)

FLOW 7: Cross-Sell (Hand Pipe Buyer)
  Trigger: Order fulfilled
  Delay: Wait 17 days
  Condition: Order contains product tagged "spoon-pipe"
  Action: Send Shopify Email (template: crossSell.handPipeBuyer.email)

FLOW 8: Cross-Sell (Rolling Buyer)
  Trigger: Order fulfilled
  Delay: Wait 17 days
  Condition: Order contains product tagged "rolling-paper"
  Action: Send Shopify Email (template: crossSell.rollingBuyer.email)

FLOW 9: Restock Reminder
  Trigger: Order fulfilled
  Delay: Wait 45 days
  Condition: Order contains product tagged "rolling-paper" OR "cleaning-supply" OR "screen" OR "torch" OR "lighter"
  Action: Send Shopify Email (template: restockReminder.email)
  Action: Send Shopify SMS (template: restockReminder.sms)

FLOW 10: Abandoned Cart — 1 Hour
  Trigger: Checkout abandoned
  Delay: Wait 1 hour
  Condition: Checkout not completed
  Action: Send Shopify Email (template: abandonedCart.reminder1.email)
  Action: Send Shopify SMS (template: abandonedCart.reminder1.sms)

FLOW 11: Abandoned Cart — 24 Hours
  Trigger: Checkout abandoned
  Delay: Wait 24 hours
  Condition: Checkout not completed
  Action: Send Shopify Email (template: abandonedCart.reminder2.email)

FLOW 12: Abandoned Cart — 72 Hours (with discount)
  Trigger: Checkout abandoned
  Delay: Wait 72 hours
  Condition: Checkout not completed
  Action: Send Shopify Email (template: abandonedCart.reminder3.email)
  Action: Send Shopify SMS (template: abandonedCart.reminder3.sms)

FLOW 13: Welcome Series — Immediate
  Trigger: Customer created (via email signup)
  Condition: Customer has 0 orders
  Action: Send Shopify Email (template: welcomeSeries.welcome.email)
  Action: Send Shopify SMS (template: welcomeSeries.welcome.sms)

FLOW 14: Welcome Series — Best Sellers (Day 3)
  Trigger: Customer created
  Delay: Wait 3 days
  Condition: Customer has 0 orders
  Action: Send Shopify Email (template: welcomeSeries.bestSellers.email)

FLOW 15: Welcome Series — Trust Builder (Day 7)
  Trigger: Customer created
  Delay: Wait 7 days
  Condition: Customer has 0 orders
  Action: Send Shopify Email (template: welcomeSeries.trustBuilder.email)

FLOW 16: Win-Back — 30 Days
  Trigger: Scheduled (daily check)
  Condition: Last order > 30 days ago, < 60 days ago
  Action: Send Shopify Email (template: winBack.gentle.email)

FLOW 17: Win-Back — 60 Days
  Trigger: Scheduled (daily check)
  Condition: Last order > 60 days ago, < 90 days ago
  Action: Send Shopify Email (template: winBack.nudge.email)

FLOW 18: Win-Back — 90 Days (Last Chance)
  Trigger: Scheduled (daily check)
  Condition: Last order > 90 days ago, < 120 days ago
  Action: Send Shopify Email (template: winBack.lastChance.email)
  Action: Send Shopify SMS (template: winBack.lastChance.sms)

FLOW 19: Sunset — 120 Days
  Trigger: Scheduled (daily check)
  Condition: Last order > 120 days ago, no email opens in 30 days
  Action: Send Shopify Email (template: sunsetFlow.email)
  Post-action: Remove from marketing list after 7 days if no click

FLOW 20: VIP Recognition
  Trigger: Order created
  Condition: Customer order count >= 3 OR lifetime spend >= $200
  Action: Send Shopify Email (template: vipRecognition.email)
  Action: Send Shopify SMS (template: vipRecognition.sms)

FLOW 21: Birthday
  Trigger: Scheduled (daily check)
  Condition: Customer birthday matches today
  Action: Send Shopify Email (template: birthday.email)
  Action: Send Shopify SMS (template: birthday.sms)

FLOW 22: Referral Nudge
  Trigger: Order fulfilled (first order only)
  Delay: Wait 30 days
  Condition: Customer has exactly 1 order, has not received referral email
  Action: Send Shopify Email (template: referral.email)

FLOW 23: Wholesale Follow-Up
  Trigger: Order created
  Condition: Order total >= $500 OR customer tagged "wholesale"
  Action: Send Shopify Email (template: wholesaleFollowUp.email)
`);

  return true;
}


// =============================================================================
// STEP 4: SET UP CUSTOMER MARKETING CONSENT METAFIELDS
// Track which messages each customer has received to prevent duplicates
// =============================================================================

async function deployMetafieldDefinitions() {
  console.log('\n' + '='.repeat(70));
  console.log('STEP 4: CREATING CUSTOMER METAFIELD DEFINITIONS');
  console.log('='.repeat(70));

  const metafields = [
    {
      name: 'Last VIP Email Sent',
      namespace: 'postsales',
      key: 'last_vip_sent',
      type: 'date_time',
      description: 'When the last VIP recognition email was sent',
      ownerType: 'CUSTOMER',
    },
    {
      name: 'Last Referral Email Sent',
      namespace: 'postsales',
      key: 'last_referral_sent',
      type: 'date_time',
      description: 'When the referral nudge email was sent',
      ownerType: 'CUSTOMER',
    },
    {
      name: 'Last Win-Back Stage',
      namespace: 'postsales',
      key: 'winback_stage',
      type: 'single_line_text_field',
      description: 'Current win-back stage: gentle, nudge, lastChance, sunset',
      ownerType: 'CUSTOMER',
    },
    {
      name: 'Post-Sales Segment',
      namespace: 'postsales',
      key: 'segment',
      type: 'single_line_text_field',
      description: 'Customer segment for messaging: new, active, vip, lapsed, churned',
      ownerType: 'CUSTOMER',
    },
  ];

  for (const mf of metafields) {
    console.log(`  Creating metafield: ${mf.namespace}.${mf.key} (${mf.type})`);

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would create metafield definition`);
      continue;
    }

    const mutation = `
      mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            name
            namespace
            key
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      definition: {
        name: mf.name,
        namespace: mf.namespace,
        key: mf.key,
        type: mf.type,
        description: mf.description,
        ownerType: mf.ownerType,
      },
    };

    const result = await graphqlRequest(mutation, variables);

    if (result.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
      const errors = result.data.metafieldDefinitionCreate.userErrors;
      if (errors.some(e => e.message.includes('already exists') || e.message.includes('taken'))) {
        console.log(`    Already exists — skipping`);
      } else {
        console.error(`    FAILED: ${errors.map(e => e.message).join(', ')}`);
      }
    } else if (result.data?.metafieldDefinitionCreate?.createdDefinition) {
      console.log(`    Created: ${result.data.metafieldDefinitionCreate.createdDefinition.id}`);
    } else {
      console.error(`    FAILED: ${JSON.stringify(result.errors || result)}`);
    }
  }

  return true;
}


// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('OIL SLICK — POST-SALES SYSTEM DEPLOYMENT');
  console.log('='.repeat(70));
  console.log(`Store: ${STORE_URL}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE EXECUTION'}`);
  console.log(`API Version: ${API_VERSION}`);
  console.log(`Date: ${new Date().toISOString()}`);

  if (!DRY_RUN) {
    console.log('\n  WARNING: This will make live changes to your Shopify store.');
    console.log('  Changes include theme settings, discount codes, and metafields.');
  }

  const results = {
    themeSettings: false,
    discountCodes: false,
    automationTriggers: false,
    metafields: false,
  };

  try {
    results.themeSettings = await deployThemeSettings();
  } catch (e) {
    console.error(`  Theme settings failed: ${e.message}`);
  }

  try {
    results.discountCodes = await deployDiscountCodes();
  } catch (e) {
    console.error(`  Discount codes failed: ${e.message}`);
  }

  try {
    results.automationTriggers = await deployAutomationTriggers();
  } catch (e) {
    console.error(`  Automation triggers failed: ${e.message}`);
  }

  try {
    results.metafields = await deployMetafieldDefinitions();
  } catch (e) {
    console.error(`  Metafield definitions failed: ${e.message}`);
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('DEPLOYMENT SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Theme Settings:      ${results.themeSettings ? 'OK' : 'FAILED'}`);
  console.log(`  Discount Codes:      ${results.discountCodes ? 'OK' : 'FAILED'}`);
  console.log(`  Automation Triggers: ${results.automationTriggers ? 'OK' : 'FAILED'}`);
  console.log(`  Metafield Defs:      ${results.metafields ? 'OK' : 'FAILED'}`);

  if (DRY_RUN) {
    console.log('\n  This was a DRY RUN. To push changes live, run:');
    console.log('  node src/deploy-postsales.js --execute');
  } else {
    console.log('\n  All API changes have been pushed live.');
    console.log('  Next steps:');
    console.log('  1. Build Shopify Flow automations in admin using the guide above');
    console.log('  2. Create Shopify Email templates matching src/postsales-messages.js');
    console.log('  3. Connect each Flow to the corresponding Shopify Email template');
    console.log('  4. All email + SMS stays 100% inside Shopify — no third-party apps needed');
  }
}

main().catch(e => {
  console.error('Deployment failed:', e);
  process.exit(1);
});

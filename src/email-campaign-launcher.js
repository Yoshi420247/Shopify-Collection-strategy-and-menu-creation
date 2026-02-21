#!/usr/bin/env node
/**
 * Email Campaign Launcher: Smokeshop Collection Expansion
 *
 * Orchestrates a 5-tier segmented email campaign to drive sales into the
 * expanded Smoke & Vape collection. Uses existing customer segment tags
 * to target the right audience with the right messaging.
 *
 * What this script does:
 *   1. Loads extracted customer data (from extract-customer-data.js)
 *   2. Tiers customers into 5 priority groups with proper suppression
 *   3. Creates a Shopify Price Rule for 30% off smokeshop collection
 *   4. Batch-generates unique one-time discount codes per customer
 *   5. Tags customers with campaign tier tags for Shopify Email targeting
 *   6. Generates HTML email templates for each tier × email position
 *   7. Exports campaign-ready files (CSVs, templates, playbook)
 *
 * Usage:
 *   node src/email-campaign-launcher.js                    # Dry run
 *   node src/email-campaign-launcher.js --execute          # Create codes + tag customers
 *   node src/email-campaign-launcher.js --report           # Show campaign stats only
 *   node src/email-campaign-launcher.js --templates-only   # Generate email templates only
 *   node src/email-campaign-launcher.js --max=100          # Limit to 100 customers
 *   node src/email-campaign-launcher.js --tier=tier1       # Process only tier 1
 *
 * Prerequisites:
 *   Run "npm run customers" first to generate data/customer-master-list.json
 *   Run "npm run customers:tag:execute" to push segment tags to Shopify
 */

import { config } from './config.js';
import { campaignConfig } from './email-campaign-config.js';
import { paginateAll, graphqlFetch, graphqlQuery, post, get } from './shopify-api.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const CAMPAIGN_DIR = join(DATA_DIR, 'campaign');

// ─── CLI FLAGS ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const REPORT_ONLY = args.includes('--report');
const TEMPLATES_ONLY = args.includes('--templates-only');
const MAX_ARG = args.find(a => a.startsWith('--max='));
const MAX_CUSTOMERS = MAX_ARG ? parseInt(MAX_ARG.split('=')[1]) : Infinity;
const TIER_ARG = args.find(a => a.startsWith('--tier='));
const TIER_FILTER = TIER_ARG ? TIER_ARG.split('=')[1] : null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// CUSTOMER TIERING ENGINE
// ============================================================================

/**
 * Loads customer data and assigns each customer to exactly one campaign tier.
 * Higher tiers suppress lower ones — a VIP won't also appear in the warm buyers tier.
 */
function tierCustomers(customers) {
  const tiers = campaignConfig.tiers;
  const tieredCustomers = {};
  const assigned = new Set();

  // Initialize tier buckets
  for (const tier of tiers) {
    tieredCustomers[tier.id] = [];
  }

  // Filter to only eligible customers
  const eligible = customers.filter(c => {
    if (!c.shopify_customer_id) return false;
    if (!c.email) return false;
    // Require opted-in if configured
    if (campaignConfig.suppression.requireOptedIn) {
      const tags = (c.customer_tags || '').split(',').map(t => t.trim());
      if (!tags.includes(campaignConfig.suppression.optedInTag)) return false;
    }
    return true;
  });

  // Assign customers to tiers (top-down, first match wins)
  for (const tier of tiers) {
    if (TIER_FILTER && tier.id !== TIER_FILTER) continue;

    for (const customer of eligible) {
      if (assigned.has(customer.shopify_customer_id)) continue;

      const tags = (customer.customer_tags || '').split(',').map(t => t.trim());

      // Check if customer already has this campaign tag (skip if already tagged)
      if (campaignConfig.suppression.skipAlreadyTagged) {
        const hasCampaignTag = tags.some(t =>
          t.startsWith(campaignConfig.suppression.campaignTagPrefix)
        );
        if (hasCampaignTag) continue;
      }

      let matches = false;

      if (tier.matchLogic === 'any') {
        // Customer has ANY of the include tags
        matches = tier.includeTags.some(tag => tags.includes(tag));
      } else if (tier.matchLogic === 'include_any_and_require_any') {
        // Customer has ANY include tag AND ANY require tag
        // This handles tier 2: must be smokeshop-buyer AND (active or high-value)
        const hasInclude = tier.includeTags.some(tag => tags.includes(tag));
        const hasRequire = tier.requireActiveTags.some(tag => tags.includes(tag));
        matches = hasInclude && hasRequire;
      }

      if (matches) {
        assigned.add(customer.shopify_customer_id);
        tieredCustomers[tier.id].push(customer);
      }
    }
  }

  return { tieredCustomers, totalEligible: eligible.length, totalAssigned: assigned.size };
}

// ============================================================================
// DISCOUNT CODE GENERATOR
// ============================================================================

/**
 * Generates a unique discount code for a customer.
 * Format: SMOKE30-{TIER}-{RANDOM6}
 * Example: SMOKE30-VIP-A3B5C2
 */
function generateDiscountCode(segmentCode) {
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${campaignConfig.discount.codePrefix}-${segmentCode}-${random}`;
}

/**
 * Creates a Shopify Price Rule for the campaign discount.
 * Returns the price rule ID needed for discount code creation.
 */
async function createPriceRule() {
  const { discount } = campaignConfig;
  const expiresAt = new Date(Date.now() + discount.expiryDays * 24 * 60 * 60 * 1000).toISOString();

  // First, find the smoke-and-vape collection ID
  const collectionsData = await get('smart_collections.json?limit=250');
  const collections = collectionsData.smart_collections || [];
  const smokeshopCollection = collections.find(c => c.handle === discount.targetCollectionHandle);

  if (!smokeshopCollection) {
    // Try custom collections
    const customData = await get('custom_collections.json?limit=250');
    const customs = customData.custom_collections || [];
    const found = customs.find(c => c.handle === discount.targetCollectionHandle);
    if (!found) {
      console.error(`  ERROR: Collection "${discount.targetCollectionHandle}" not found`);
      console.error('  Available collections (first 20):');
      collections.slice(0, 20).forEach(c => console.log(`    - ${c.handle} (${c.title})`));
      return null;
    }
    return await createPriceRuleWithCollection(found.id, expiresAt);
  }

  return await createPriceRuleWithCollection(smokeshopCollection.id, expiresAt);
}

async function createPriceRuleWithCollection(collectionId, expiresAt) {
  const { discount } = campaignConfig;

  const priceRule = {
    price_rule: {
      title: `${campaignConfig.campaign.name} - ${discount.percent}% Off`,
      target_type: 'line_item',
      target_selection: 'entitled',
      allocation_method: 'across',
      value_type: 'percentage',
      value: String(discount.value),
      customer_selection: 'all',
      entitled_collection_ids: [collectionId],
      usage_limit: null,  // No overall usage limit
      once_per_customer: discount.oncePerCustomer,
      starts_at: new Date().toISOString(),
      ends_at: expiresAt,
    },
  };

  console.log(`  Creating price rule: ${discount.percent}% off collection ${collectionId}`);
  console.log(`  Expires: ${expiresAt}`);

  const result = await post('price_rules.json', priceRule);

  if (result.price_rule) {
    console.log(`  Price rule created: ID ${result.price_rule.id}`);
    return result.price_rule.id;
  }

  if (result.errors) {
    console.error(`  Price rule error: ${JSON.stringify(result.errors)}`);
    return null;
  }

  return null;
}

/**
 * Creates discount codes in batches under the given price rule.
 * Each code is unique and one-time use (enforced by the price rule).
 *
 * Returns a map of customerId → discountCode
 */
async function createDiscountCodes(priceRuleId, tieredCustomers) {
  const codeMap = {};
  const allCodes = [];

  // Generate codes for all customers
  for (const [tierId, customers] of Object.entries(tieredCustomers)) {
    const tier = campaignConfig.tiers.find(t => t.id === tierId);
    if (!tier) continue;

    for (const customer of customers) {
      const code = generateDiscountCode(tier.segmentCode);
      codeMap[customer.shopify_customer_id] = {
        code,
        email: customer.email,
        firstName: customer.first_name || '',
        tier: tierId,
        tierName: tier.name,
      };
      allCodes.push(code);
    }
  }

  console.log(`  Generated ${allCodes.length} unique discount codes`);

  // Create codes in Shopify in batches of 100
  const BATCH_SIZE = 100;
  let created = 0;
  let errors = 0;

  for (let i = 0; i < allCodes.length; i += BATCH_SIZE) {
    const batch = allCodes.slice(i, i + BATCH_SIZE);
    const codes = batch.map(code => ({ code }));

    try {
      const result = await post(
        `price_rules/${priceRuleId}/batch.json`,
        { discount_codes: codes }
      );

      if (result.discount_codes) {
        created += result.discount_codes.length;
      } else if (result.discount_code_creation) {
        // Batch creation returns a job — codes created asynchronously
        created += batch.length;
      } else if (result.errors) {
        // Batch endpoint may not be available — fall back to single creates
        console.log('  Batch creation not available, falling back to individual creates...');
        for (const codeObj of codes) {
          try {
            await post(
              `price_rules/${priceRuleId}/discount_codes.json`,
              { discount_code: codeObj }
            );
            created++;
          } catch (err) {
            errors++;
          }
          // Respect rate limits
          if (created % 2 === 0) await sleep(550);
        }
      }

      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= allCodes.length) {
        const pct = (Math.min(i + BATCH_SIZE, allCodes.length) / allCodes.length * 100).toFixed(1);
        console.log(`  Codes: ${created} created, ${errors} errors (${pct}%)`);
      }

      // Rate limit between batches
      await sleep(1000);
    } catch (err) {
      console.error(`  Batch error at offset ${i}: ${err.message}`);
      errors += batch.length;
    }
  }

  console.log(`  Discount code creation complete: ${created} created, ${errors} errors`);
  return codeMap;
}

// ============================================================================
// CUSTOMER CAMPAIGN TAGGING
// ============================================================================

/**
 * Tags customers with campaign-specific tier tags so they can be targeted
 * in Shopify Email using customer tag segments.
 */
async function tagCustomersWithCampaign(tieredCustomers, codeMap) {
  const BATCH_SIZE = 10;
  const CONCURRENCY = 3;
  let success = 0;
  let errors = 0;
  const errorLog = [];

  const allUpdates = [];
  for (const [tierId, customers] of Object.entries(tieredCustomers)) {
    const tier = campaignConfig.tiers.find(t => t.id === tierId);
    if (!tier) continue;

    for (const customer of customers) {
      allUpdates.push({
        id: customer.shopify_customer_id,
        email: customer.email,
        existingTags: customer.customer_tags || '',
        newTag: tier.tag,
        code: codeMap[customer.shopify_customer_id]?.code || '',
      });
    }
  }

  console.log(`  Tagging ${allUpdates.length} customers with campaign tier tags...`);

  // Split into batches
  const batches = [];
  for (let i = 0; i < allUpdates.length; i += BATCH_SIZE) {
    batches.push(allUpdates.slice(i, i + BATCH_SIZE));
  }

  let batchIndex = 0;
  const startTime = Date.now();

  async function tagWorker() {
    while (true) {
      const idx = batchIndex++;
      if (idx >= batches.length) break;

      const batch = batches[idx];

      // Build batched GraphQL mutation
      const mutations = batch.map((u, j) => {
        const gid = `gid://shopify/Customer/${u.id}`;
        // Merge existing tags with the new campaign tag
        const existingTags = u.existingTags.split(',').map(t => t.trim()).filter(Boolean);
        if (!existingTags.includes(u.newTag)) {
          existingTags.push(u.newTag);
        }
        const tagsStr = existingTags.map(t => JSON.stringify(t)).join(', ');
        return `c${j}: customerUpdate(input: {id: "${gid}", tags: [${tagsStr}]}) {
      customer { id }
      userErrors { field message }
    }`;
      });

      const query = `mutation {\n  ${mutations.join('\n  ')}\n}`;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await graphqlFetch(query);

          if (result.errors?.some(e => e.extensions?.code === 'THROTTLED')) {
            await sleep(2000 * attempt);
            if (attempt < 3) continue;
          }

          for (let j = 0; j < batch.length; j++) {
            const res = result.data?.[`c${j}`];
            if (res?.userErrors?.length > 0) {
              errors++;
              errorLog.push({ email: batch[j].email, error: res.userErrors[0].message });
            } else {
              success++;
            }
          }

          // Cost-based throttling
          const available = result.extensions?.cost?.throttleStatus?.currentlyAvailable;
          if (available !== undefined) {
            if (available < 100) await sleep(3000);
            else if (available < 200) await sleep(1000);
            else if (available < 400) await sleep(200);
          }

          break;
        } catch (err) {
          if (attempt >= 3) {
            errors += batch.length;
            batch.forEach(u => errorLog.push({ email: u.email, error: err.message }));
          } else {
            await sleep(2000 * attempt);
          }
        }
      }

      // Progress
      const processed = Math.min((idx + 1) * BATCH_SIZE, allUpdates.length);
      if (processed % 500 === 0 || processed >= allUpdates.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const pct = (processed / allUpdates.length * 100).toFixed(1);
        console.log(`  Tagging: ${processed}/${allUpdates.length} (${pct}%) - ${success} ok, ${errors} err [${elapsed}s]`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => tagWorker()));

  console.log(`  Campaign tagging complete: ${success} tagged, ${errors} errors`);
  return { success, errors, errorLog };
}

// ============================================================================
// EMAIL TEMPLATE GENERATOR
// ============================================================================

/**
 * Generates HTML email templates for each tier × email position.
 * Templates use {{discount_code}} and {{first_name}} placeholders
 * for personalization in Shopify Email.
 */
function generateEmailTemplates() {
  const { styling, productShowcase, discount } = campaignConfig;
  const templates = {};

  for (const [tierId, sequence] of Object.entries(campaignConfig.emailSequences)) {
    templates[tierId] = [];

    for (const email of sequence) {
      const html = buildEmailHTML(email, styling, productShowcase, discount);
      const text = buildEmailText(email, productShowcase, discount);

      templates[tierId].push({
        id: email.id,
        name: email.name,
        subject: email.subject,
        preheader: email.preheader,
        html,
        text,
        dayOffset: email.dayOffset,
      });
    }
  }

  return templates;
}

function buildEmailHTML(email, styling, productShowcase, discount) {
  const sections = [];

  // ── Header ──
  sections.push(`
    <div style="background:${styling.headerBg};padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:300;">${styling.storeName}</h1>
    </div>
  `);

  // ── Greeting ──
  sections.push(`
    <div style="padding:32px 24px 0;">
      <p style="font-size:16px;line-height:1.6;color:${styling.textColor};margin:0;">
        ${getGreetingForStrategy(email.strategy)}
      </p>
    </div>
  `);

  // ── Discount Block ──
  if (email.showDiscount) {
    sections.push(`
    <div style="background:${styling.headerBg};border-radius:12px;padding:32px;margin:24px;text-align:center;">
      <h2 style="color:${styling.accentColor};margin:0 0 12px;font-size:28px;font-weight:800;">${discount.percent}% OFF Our Entire Smokeshop</h2>
      <p style="color:#fff;font-size:15px;margin:0 0 20px;line-height:1.5;">Use your exclusive one-time code at checkout:</p>
      <div style="background:#fff;display:inline-block;padding:14px 36px;border-radius:8px;border:2px dashed ${styling.accentColor};">
        <span style="font-size:24px;font-weight:700;color:#1a1a2e;letter-spacing:3px;">{{discount_code}}</span>
      </div>
      <p style="color:${styling.accentColor};font-size:13px;margin:16px 0 0;">Valid for ${discount.expiryDays} days &bull; One-time use &bull; Smokeshop products only</p>
    </div>
    `);
  }

  // ── Product Showcase ──
  if (email.showProducts) {
    const categories = productShowcase.categories.slice(0, 4);
    const categoryCards = categories.map(cat => `
      <div style="flex:1;min-width:240px;background:#fff;border:1px solid #eee;border-radius:8px;padding:20px;text-align:center;">
        <h4 style="color:${styling.textColor};margin:0 0 8px;font-size:16px;">${cat.title}</h4>
        <p style="color:${styling.mutedColor};font-size:13px;margin:0 0 8px;line-height:1.4;">${cat.description}</p>
        <p style="color:${styling.accentColor};font-size:14px;font-weight:600;margin:0 0 12px;">${cat.priceRange}</p>
        <a href="${cat.url}?discount={{discount_code}}" style="display:inline-block;padding:8px 20px;background:${styling.accentColor};color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">Shop Now</a>
      </div>
    `).join('\n');

    sections.push(`
    <div style="padding:0 24px;">
      <h3 style="color:${styling.textColor};font-size:20px;text-align:center;margin:24px 0 16px;">Explore Our Expanded Collection</h3>
      <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;">
        ${categoryCards}
      </div>
    </div>
    `);
  }

  // ── Social Proof ──
  if (email.showSocialProof) {
    sections.push(`
    <div style="background:#fafafa;border-radius:8px;padding:24px;margin:24px;">
      <h3 style="color:${styling.textColor};margin:0 0 16px;font-size:18px;text-align:center;">Why Shop Our Smokeshop?</h3>
      <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;">
        <div style="flex:1;min-width:150px;text-align:center;">
          <div style="font-size:28px;">💰</div>
          <p style="font-size:13px;font-weight:600;color:${styling.textColor};margin:8px 0 4px;">Wholesale Prices</p>
          <p style="font-size:12px;color:${styling.mutedColor};margin:0;">Skip the headshop markup</p>
        </div>
        <div style="flex:1;min-width:150px;text-align:center;">
          <div style="font-size:28px;">📦</div>
          <p style="font-size:13px;font-weight:600;color:${styling.textColor};margin:8px 0 4px;">Discreet Shipping</p>
          <p style="font-size:12px;color:${styling.mutedColor};margin:0;">Padded, plain packaging</p>
        </div>
        <div style="flex:1;min-width:150px;text-align:center;">
          <div style="font-size:28px;">✅</div>
          <p style="font-size:13px;font-weight:600;color:${styling.textColor};margin:8px 0 4px;">Hand-Picked Quality</p>
          <p style="font-size:12px;color:${styling.mutedColor};margin:0;">Every piece curated by us</p>
        </div>
      </div>
    </div>
    `);
  }

  // ── Urgency Block ──
  if (email.showUrgency) {
    sections.push(`
    <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:16px 20px;margin:24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#856404;margin:0;font-weight:600;">⏰ Your code <strong>{{discount_code}}</strong> expires soon. Don't miss your chance to save ${discount.percent}% on our entire smokeshop collection.</p>
    </div>
    `);
  }

  // ── Main CTA ──
  sections.push(`
    <div style="text-align:center;margin:32px 0;">
      <a href="${email.ctaUrl}?discount={{discount_code}}" style="display:inline-block;background:${styling.accentColor};color:#fff;padding:16px 48px;border-radius:8px;font-size:18px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">${email.ctaText}</a>
    </div>
  `);

  // ── Trust Badges ──
  sections.push(`
    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin:20px 24px;padding:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee;">
      <div style="text-align:center;flex:1;min-width:100px;">
        <div style="font-size:20px;">🔒</div>
        <div style="font-size:11px;font-weight:700;color:${styling.textColor};">Secure Checkout</div>
      </div>
      <div style="text-align:center;flex:1;min-width:100px;">
        <div style="font-size:20px;">🚚</div>
        <div style="font-size:11px;font-weight:700;color:${styling.textColor};">Fast Shipping</div>
      </div>
      <div style="text-align:center;flex:1;min-width:100px;">
        <div style="font-size:20px;">↩️</div>
        <div style="font-size:11px;font-weight:700;color:${styling.textColor};">Easy Returns</div>
      </div>
    </div>
  `);

  // ── Footer ──
  sections.push(`
    <div style="border-top:1px solid #eee;padding:24px;text-align:center;">
      <p style="font-size:14px;font-weight:600;color:${styling.textColor};margin:0 0 4px;">${styling.storeName}</p>
      <p style="font-size:12px;color:${styling.mutedColor};margin:0 0 12px;">Premium extraction supplies & smokeshop</p>
      <p style="font-size:11px;color:#aaa;margin:0;">
        You're receiving this because you're a valued ${styling.storeName} customer.<br>
        <a href="${styling.privacyUrl}" style="color:#aaa;">Privacy Policy</a> &bull;
        <a href="${styling.storeUrl}" style="color:#aaa;">Visit Store</a>
      </p>
    </div>
  `);

  // ── Assemble ──
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${email.subject.replace(/\{\{.*?\}\}/g, '')}</title>
  <!--[if mso]><style>table{border-collapse:collapse;}div{display:block;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${styling.bodyBg};font-family:${styling.fontFamily};">
  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;">${email.preheader}</div>
  <div style="max-width:600px;margin:0 auto;background:${styling.cardBg};border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
    ${sections.join('\n')}
  </div>
</body>
</html>`;
}

function getGreetingForStrategy(strategy) {
  const greetings = {
    exclusivity: `{{first_name}}, this isn't going out to everyone.<br><br>You're one of the few getting <strong>first access</strong> to our massive smokeshop expansion — 500+ new pieces, live now — before we announce it publicly. Here's the thing: your code below won't last, so take a look while the best glass is still in stock.`,
    announcement: `500+ new bongs, rigs, pipes, and accessories just dropped, {{first_name}}.<br><br>We rebuilt our entire Smoke & Vape collection from the ground up — brand-name glass at wholesale prices, all in one place. Look — we also set aside a <strong>personal discount code</strong> for you below.`,
    social_proof: `{{first_name}}, our new smokeshop collection is moving fast.<br><br>Over the past week, dozens of customers have already grabbed pieces from the drop — and <strong>some of our most popular rigs are starting to sell out</strong>. Your exclusive discount is still active, but the inventory won't wait.`,
    scarcity: `{{first_name}}, your 30% off code has <strong>limited time left</strong>.<br><br>We wanted to give you a heads-up before it expires. The pieces below are worth every penny at full price — at 30% off, it's a no-brainer.`,
    last_chance: `{{first_name}} — <strong>24 hours</strong>. That's all that's left on your 30% off code.<br><br>After that, it's gone and there's no extending it. If anything below catches your eye, now is the time.`,
    reengagement: `It's been a minute, {{first_name}} — and honestly, you've been missing out.<br><br>We've added <strong>500+ new smokeshop pieces</strong> since you last stopped by. To make it worth your while, we're giving you an exclusive code to come back and save 30%.`,
    winback: `Hey {{first_name}}, we get it — life gets busy.<br><br>But Oil Slick Pad has changed a lot since your last order. We've built out an <strong>entire smokeshop</strong> with 500+ bongs, rigs, pipes, and accessories at wholesale prices. We saved you a welcome-back discount below — no strings attached.`,
    activation: `Tired of overpaying at headshops, {{first_name}}?<br><br>We built the online smokeshop that solves that problem — <strong>500+ brand-name pieces at wholesale prices</strong>, shipped fast and discreet to your door. Here's a code to try us out at 30% off.`,
  };

  return greetings[strategy] || greetings.announcement;
}

function buildEmailText(email, productShowcase, discount) {
  const lines = [];

  const textGreetings = {
    exclusivity: `{{first_name}}, this isn't going out to everyone. You're one of the few getting first access to our massive smokeshop expansion - 500+ new pieces, live now - before we announce it publicly. Here's the thing: your code below won't last, so take a look while the best glass is still in stock.`,
    announcement: `500+ new bongs, rigs, pipes, and accessories just dropped, {{first_name}}. We rebuilt our entire Smoke & Vape collection from the ground up - brand-name glass at wholesale prices, all in one place. Look - we also set aside a personal discount code for you below.`,
    social_proof: `{{first_name}}, our new smokeshop collection is moving fast. Over the past week, dozens of customers have already grabbed pieces from the drop - and some of our most popular rigs are starting to sell out. Your exclusive discount is still active, but the inventory won't wait.`,
    scarcity: `{{first_name}}, your 30% off code has limited time left. We wanted to give you a heads-up before it expires. The pieces below are worth every penny at full price - at 30% off, it's a no-brainer.`,
    last_chance: `{{first_name}} - 24 hours. That's all that's left on your 30% off code. After that, it's gone and there's no extending it. If anything below catches your eye, now is the time.`,
    reengagement: `It's been a minute, {{first_name}} - and honestly, you've been missing out. We've added 500+ new smokeshop pieces since you last stopped by. To make it worth your while, we're giving you an exclusive code to come back and save 30%.`,
    winback: `Hey {{first_name}}, we get it - life gets busy. But Oil Slick Pad has changed a lot since your last order. We've built out an entire smokeshop with 500+ bongs, rigs, pipes, and accessories at wholesale prices. We saved you a welcome-back discount below - no strings attached.`,
    activation: `Tired of overpaying at headshops, {{first_name}}? We built the online smokeshop that solves that problem - 500+ brand-name pieces at wholesale prices, shipped fast and discreet to your door. Here's a code to try us out at 30% off.`,
  };

  lines.push(textGreetings[email.strategy] || textGreetings.announcement);
  lines.push('');

  if (email.showDiscount) {
    lines.push(`=== ${discount.percent}% OFF OUR ENTIRE SMOKESHOP ===`);
    lines.push(`Use code: {{discount_code}}`);
    lines.push(`Valid for ${discount.expiryDays} days | One-time use | Smokeshop products only`);
    lines.push('');
  }

  if (email.showProducts) {
    lines.push('--- EXPLORE OUR COLLECTION ---');
    for (const cat of productShowcase.categories.slice(0, 4)) {
      lines.push(`${cat.title} (${cat.priceRange})`);
      lines.push(`  ${cat.description}`);
      lines.push(`  Shop: ${cat.url}`);
      lines.push('');
    }
  }

  if (email.showUrgency) {
    lines.push(`⏰ Your code {{discount_code}} expires soon!`);
    lines.push('');
  }

  lines.push(`${email.ctaText}: ${email.ctaUrl}`);
  lines.push('');
  lines.push('---');
  lines.push('Oil Slick Pad — oilslickpad.com');
  lines.push('Premium extraction supplies & smokeshop');

  return lines.join('\n');
}

// ============================================================================
// CAMPAIGN EXPORT
// ============================================================================

/**
 * Exports campaign data to files for execution and tracking.
 */
function exportCampaignData(tieredCustomers, codeMap, templates) {
  mkdirSync(CAMPAIGN_DIR, { recursive: true });

  // ── Per-tier CSV exports (email, first_name, code, tier) ──
  for (const [tierId, customers] of Object.entries(tieredCustomers)) {
    if (customers.length === 0) continue;

    const tier = campaignConfig.tiers.find(t => t.id === tierId);
    const rows = ['email,first_name,last_name,discount_code,tier,tier_name'];

    for (const c of customers) {
      const mapping = codeMap[c.shopify_customer_id];
      const code = mapping?.code || '';
      const firstName = (c.first_name || '').replace(/,/g, '');
      const lastName = (c.last_name || '').replace(/,/g, '');
      rows.push(`${c.email},${firstName},${lastName},${code},${tierId},${tier?.name || ''}`);
    }

    writeFileSync(join(CAMPAIGN_DIR, `${tierId}-customers.csv`), rows.join('\n'));
    console.log(`  Exported ${customers.length} customers → campaign/${tierId}-customers.csv`);
  }

  // ── Master code mapping ──
  const allMappings = Object.entries(codeMap).map(([customerId, data]) => ({
    shopify_customer_id: customerId,
    ...data,
  }));
  writeFileSync(
    join(CAMPAIGN_DIR, 'discount-code-map.json'),
    JSON.stringify(allMappings, null, 2)
  );
  console.log(`  Exported ${allMappings.length} code mappings → campaign/discount-code-map.json`);

  // ── HTML email templates ──
  for (const [tierId, emailTemplates] of Object.entries(templates)) {
    for (const tmpl of emailTemplates) {
      writeFileSync(
        join(CAMPAIGN_DIR, `${tmpl.id}-template.html`),
        tmpl.html
      );
      writeFileSync(
        join(CAMPAIGN_DIR, `${tmpl.id}-template.txt`),
        tmpl.text
      );
    }
    console.log(`  Exported ${emailTemplates.length} email templates for ${tierId}`);
  }

  // ── Campaign playbook ──
  const playbook = generatePlaybook(tieredCustomers, codeMap, templates);
  writeFileSync(join(CAMPAIGN_DIR, 'CAMPAIGN_PLAYBOOK.md'), playbook);
  console.log(`  Exported campaign playbook → campaign/CAMPAIGN_PLAYBOOK.md`);

  // ── Campaign summary JSON ──
  const summary = {
    campaign: campaignConfig.campaign,
    generated_at: new Date().toISOString(),
    discount: {
      percent: campaignConfig.discount.percent,
      expiryDays: campaignConfig.discount.expiryDays,
      codePrefix: campaignConfig.discount.codePrefix,
    },
    tiers: campaignConfig.tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      customerCount: tieredCustomers[tier.id]?.length || 0,
      emailCount: tier.emailCount,
      totalSends: (tieredCustomers[tier.id]?.length || 0) * tier.emailCount,
      rolloutDay: campaignConfig.rollout[`${tier.id}_day`],
    })),
    totals: {
      totalCustomers: Object.values(tieredCustomers).reduce((sum, arr) => sum + arr.length, 0),
      totalCodes: Object.keys(codeMap).length,
      totalEmails: Object.values(tieredCustomers).reduce((sum, arr, i) => {
        const tier = campaignConfig.tiers[i];
        return sum + arr.length * (tier?.emailCount || 0);
      }, 0),
    },
  };
  writeFileSync(join(CAMPAIGN_DIR, 'campaign-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`  Exported campaign summary → campaign/campaign-summary.json`);
}

function generatePlaybook(tieredCustomers, codeMap, templates) {
  const { rollout, discount, tiers } = campaignConfig;
  const totalCustomers = Object.values(tieredCustomers).reduce((sum, arr) => sum + arr.length, 0);
  const totalEmails = tiers.reduce((sum, tier) => {
    return sum + (tieredCustomers[tier.id]?.length || 0) * tier.emailCount;
  }, 0);

  // Shopify Email cost calculation
  const freeEmails = 10000;
  const paidEmails = Math.max(0, totalEmails - freeEmails);
  const emailCost = Math.ceil(paidEmails / 1000);

  let md = `# Campaign Playbook: Smokeshop Collection Expansion Launch

**Generated:** ${new Date().toISOString()}
**Campaign:** ${campaignConfig.campaign.name}
**Discount:** ${discount.percent}% off entire Smoke & Vape collection
**Code Expiry:** ${discount.expiryDays} days from launch

---

## Quick Stats

| Metric | Value |
|--------|-------|
| Total Customers | ${totalCustomers.toLocaleString()} |
| Total Discount Codes | ${Object.keys(codeMap).length.toLocaleString()} |
| Total Email Sends | ${totalEmails.toLocaleString()} |
| Estimated Shopify Email Cost | $${emailCost} (${freeEmails.toLocaleString()} free + ${paidEmails.toLocaleString()} × $0.001) |
| Campaign Duration | ${Math.max(...Object.values(rollout))} days (staggered) + ${discount.expiryDays} days (code validity) |

---

## Tier Breakdown

`;

  for (const tier of tiers) {
    const customers = tieredCustomers[tier.id] || [];
    const rolloutDay = rollout[`${tier.id}_day`];
    const sequence = campaignConfig.emailSequences[tier.id] || [];

    md += `### ${tier.name} (${tier.id})
- **Customers:** ${customers.length.toLocaleString()}
- **Emails per customer:** ${tier.emailCount}
- **Total sends:** ${(customers.length * tier.emailCount).toLocaleString()}
- **Rollout day:** Day ${rolloutDay}
- **Tag for targeting:** \`${tier.tag}\`
- **Description:** ${tier.description}

**Email Sequence:**
`;

    for (const email of sequence) {
      md += `| Day ${rolloutDay + email.dayOffset} | ${email.name} | Subject: "${email.subject}" |\n`;
    }

    md += '\n';
  }

  md += `---

## Shopify Email Setup Instructions

### Step 1: Discount Codes (Already Created)
${Object.keys(codeMap).length > 0
    ? '✅ Discount codes have been created in Shopify via the Price Rules API.\nEach customer has a unique one-time code assigned.'
    : '⚠️ Run this script with --execute to create discount codes in Shopify.'}

### Step 2: Customer Tags (Already Applied)
Each customer has been tagged with their campaign tier tag:
${tiers.map(t => `- \`${t.tag}\` → ${(tieredCustomers[t.id] || []).length} customers`).join('\n')}

### Step 3: Create Email Campaigns in Shopify
For each tier, create campaigns in **Shopify Admin → Marketing → Campaigns**:

1. Click **Create campaign** → **Shopify Email**
2. Choose a pre-built template or start from scratch
3. Paste the HTML from the template files in \`data/campaign/\`
4. Under **Recipients**, use **Customer tag is equal to** and enter the tier tag
5. Replace \`{{discount_code}}\` with the merge tag for discount codes
6. Replace \`{{first_name}}\` with the Shopify merge tag for first name
7. Schedule or send

### Step 4: Staggered Rollout Schedule

| Day | Tier | Action | Customers |
|-----|------|--------|-----------|
`;

  for (const tier of tiers) {
    const customers = tieredCustomers[tier.id] || [];
    const rolloutDay = rollout[`${tier.id}_day`];
    md += `| ${rolloutDay} | ${tier.name} | Send Email 1 | ${customers.length.toLocaleString()} |\n`;
  }

  md += `
### Step 5: Automation Setup (Shopify Flow)

To automate the follow-up emails, create a Shopify Flow workflow:

1. **Trigger:** Customer tagged with \`campaign:smokeshop-launch-tier*\`
2. **Wait:** 3 days
3. **Action:** Send marketing email (Email 2 template)
4. **Wait:** 3 more days
5. **Action:** Send marketing email (Email 3 template)
6. **Wait:** 3 more days
7. **Action:** Send marketing email (Email 4 template)

Repeat for each tier with appropriate timing and templates.

---

## Cost Estimate

| Item | Cost |
|------|------|
| Shopify Email (${totalEmails.toLocaleString()} sends) | $${emailCost} |
| Discount margin impact (est. 4% conversion × $45 AOV × 30%) | ~$${Math.round(totalCustomers * 0.04 * 45 * 0.30).toLocaleString()} |
| **Total out-of-pocket** | **$${emailCost}** |

> Note: The discount margin impact is not a cash cost — it's reduced margin on orders
> that likely would not have happened without the campaign. Net revenue should be positive.

---

## Files Generated

| File | Description |
|------|-------------|
| \`tier*-customers.csv\` | Customer lists per tier with discount codes |
| \`discount-code-map.json\` | Complete customer → code mapping |
| \`tier*-e*-template.html\` | HTML email templates |
| \`tier*-e*-template.txt\` | Plain text email versions |
| \`campaign-summary.json\` | Machine-readable campaign summary |
| \`CAMPAIGN_PLAYBOOK.md\` | This file |
`;

  return md;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   EMAIL CAMPAIGN LAUNCHER                                  ║');
  console.log('║   Smokeshop Collection Expansion — 30% Off Campaign        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Store:    ${config.shopify.storeUrl}`);
  console.log(`Campaign: ${campaignConfig.campaign.name}`);
  console.log(`Discount: ${campaignConfig.discount.percent}% off ${campaignConfig.discount.targetCollectionHandle}`);
  console.log(`Mode:     ${EXECUTE ? 'EXECUTE — will create codes + tag customers' : TEMPLATES_ONLY ? 'TEMPLATES ONLY' : REPORT_ONLY ? 'REPORT ONLY' : 'DRY RUN'}`);
  if (MAX_CUSTOMERS < Infinity) console.log(`Limit:    ${MAX_CUSTOMERS} customers`);
  if (TIER_FILTER) console.log(`Tier:     ${TIER_FILTER} only`);
  console.log('');

  // ── Load customer data ──────────────────────────────────────────────
  const dataFile = join(DATA_DIR, 'customer-master-list.json');

  if (!existsSync(dataFile)) {
    console.error('ERROR: data/customer-master-list.json not found.');
    console.error('Run "npm run customers" first to extract customer data.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const customers = data.customers || [];
  console.log(`Loaded ${customers.length.toLocaleString()} customers from extraction data`);
  console.log(`Extracted at: ${data.extracted_at}`);
  console.log('');

  // ── Tier customers ──────────────────────────────────────────────────
  console.log('━━━ CUSTOMER TIERING ━━━');
  const limitedCustomers = MAX_CUSTOMERS < Infinity ? customers.slice(0, MAX_CUSTOMERS) : customers;
  const { tieredCustomers, totalEligible, totalAssigned } = tierCustomers(limitedCustomers);

  console.log(`  Total customers loaded: ${limitedCustomers.length.toLocaleString()}`);
  console.log(`  Eligible (opted-in + has email + has account): ${totalEligible.toLocaleString()}`);
  console.log(`  Assigned to tiers: ${totalAssigned.toLocaleString()}`);
  console.log(`  Unassigned (no matching segment tags): ${(totalEligible - totalAssigned).toLocaleString()}`);
  console.log('');

  for (const tier of campaignConfig.tiers) {
    const count = tieredCustomers[tier.id]?.length || 0;
    const bar = '█'.repeat(Math.min(Math.round(count / totalEligible * 40), 40));
    console.log(`  ${tier.name.padEnd(20)} ${String(count).padStart(6)}  ${bar}`);
  }
  console.log('');

  // ── Calculate campaign metrics ──────────────────────────────────────
  const totalEmails = campaignConfig.tiers.reduce((sum, tier) => {
    return sum + (tieredCustomers[tier.id]?.length || 0) * tier.emailCount;
  }, 0);
  const freeEmails = 10000;
  const paidEmails = Math.max(0, totalEmails - freeEmails);
  const emailCost = Math.ceil(paidEmails / 1000);

  console.log('━━━ CAMPAIGN METRICS ━━━');
  console.log(`  Total email sends:         ${totalEmails.toLocaleString()}`);
  console.log(`  Shopify Email cost:         $${emailCost} (${freeEmails.toLocaleString()} free + ${paidEmails.toLocaleString()} paid)`);
  console.log(`  Discount:                   ${campaignConfig.discount.percent}% off × ${campaignConfig.discount.expiryDays} day validity`);
  console.log(`  Est. conversion (4%):       ~${Math.round(totalAssigned * 0.04).toLocaleString()} orders`);
  console.log(`  Est. revenue ($45 AOV):     ~$${Math.round(totalAssigned * 0.04 * 45).toLocaleString()}`);
  console.log(`  Est. discount cost:         ~$${Math.round(totalAssigned * 0.04 * 45 * 0.30).toLocaleString()}`);
  console.log(`  Est. net revenue:           ~$${Math.round(totalAssigned * 0.04 * 45 * 0.70).toLocaleString()}`);
  console.log('');

  if (REPORT_ONLY) {
    console.log('Report mode — no actions taken.');
    return;
  }

  // ── Generate email templates ────────────────────────────────────────
  console.log('━━━ GENERATING EMAIL TEMPLATES ━━━');
  const templates = generateEmailTemplates();

  let templateCount = 0;
  for (const [tierId, emailTemplates] of Object.entries(templates)) {
    templateCount += emailTemplates.length;
  }
  console.log(`  Generated ${templateCount} email templates (HTML + text)`);
  console.log('');

  // ── Generate discount codes (in-memory only for dry run) ────────────
  console.log('━━━ GENERATING DISCOUNT CODES ━━━');
  const codeMap = {};
  for (const [tierId, customerList] of Object.entries(tieredCustomers)) {
    const tier = campaignConfig.tiers.find(t => t.id === tierId);
    if (!tier) continue;
    for (const customer of customerList) {
      codeMap[customer.shopify_customer_id] = {
        code: generateDiscountCode(tier.segmentCode),
        email: customer.email,
        firstName: customer.first_name || '',
        tier: tierId,
        tierName: tier.name,
      };
    }
  }
  console.log(`  Generated ${Object.keys(codeMap).length.toLocaleString()} unique codes (in-memory)`);

  // Show examples
  const examples = Object.values(codeMap).slice(0, 5);
  for (const ex of examples) {
    console.log(`    ${ex.email.padEnd(30)} → ${ex.code} (${ex.tierName})`);
  }
  console.log('');

  // ── Export campaign data ────────────────────────────────────────────
  console.log('━━━ EXPORTING CAMPAIGN DATA ━━━');
  exportCampaignData(tieredCustomers, codeMap, templates);
  console.log('');

  if (TEMPLATES_ONLY) {
    console.log('Templates-only mode — email templates and data exported. No Shopify changes.');
    return;
  }

  if (!EXECUTE) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  DRY RUN — No changes made to Shopify.');
    console.log('');
    console.log('  Campaign data exported to data/campaign/');
    console.log('  Review the files, then run with --execute to:');
    console.log('    1. Create Shopify Price Rule (30% off smokeshop)');
    console.log('    2. Create unique discount codes in Shopify');
    console.log('    3. Tag customers with campaign tier tags');
    console.log('');
    console.log('  Run: node src/email-campaign-launcher.js --execute');
    console.log('═══════════════════════════════════════════════════════════');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════
  // EXECUTE MODE — Create real codes + tag customers
  // ══════════════════════════════════════════════════════════════════════

  // Step 1: Create Shopify Price Rule
  console.log('━━━ CREATING SHOPIFY PRICE RULE ━━━');
  const priceRuleId = await createPriceRule();

  if (!priceRuleId) {
    console.error('Failed to create price rule. Aborting.');
    console.error('Campaign data has been exported to data/campaign/ for manual setup.');
    process.exit(1);
  }
  console.log('');

  // Step 2: Create discount codes in Shopify
  console.log('━━━ CREATING DISCOUNT CODES IN SHOPIFY ━━━');
  const shopifyCodes = await createDiscountCodes(priceRuleId, tieredCustomers);
  console.log('');

  // Step 3: Tag customers
  console.log('━━━ TAGGING CUSTOMERS WITH CAMPAIGN TIERS ━━━');
  const tagResult = await tagCustomersWithCampaign(tieredCustomers, shopifyCodes);
  console.log('');

  // Re-export with real codes
  console.log('━━━ RE-EXPORTING WITH SHOPIFY CODES ━━━');
  exportCampaignData(tieredCustomers, shopifyCodes, templates);
  console.log('');

  // ── Final Summary ──────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CAMPAIGN LAUNCH COMPLETE                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Price Rule ID:        ${priceRuleId}`);
  console.log(`  Discount Codes:       ${Object.keys(shopifyCodes).length.toLocaleString()} created`);
  console.log(`  Customers Tagged:     ${tagResult.success.toLocaleString()} ok, ${tagResult.errors} errors`);
  console.log(`  Email Templates:      ${templateCount} generated`);
  console.log(`  Shopify Email Cost:   ~$${emailCost}`);
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────┐');
  console.log('  │  NEXT STEPS:                                           │');
  console.log('  │                                                        │');
  console.log('  │  1. Go to Shopify Admin → Marketing → Campaigns        │');
  console.log('  │  2. Create email campaigns using the HTML templates    │');
  console.log('  │     in data/campaign/ (one per tier × email)           │');
  console.log('  │  3. Target by campaign tier tags:                      │');
  for (const tier of campaignConfig.tiers) {
    const count = tieredCustomers[tier.id]?.length || 0;
    if (count > 0) {
      console.log(`  │     ${tier.tag.padEnd(42)} (${count.toLocaleString()} customers) │`);
    }
  }
  console.log('  │                                                        │');
  console.log('  │  4. Follow the staggered rollout schedule in           │');
  console.log('  │     data/campaign/CAMPAIGN_PLAYBOOK.md                 │');
  console.log('  │                                                        │');
  console.log('  │  5. Set up Shopify Flow automations for follow-up      │');
  console.log('  │     emails (see playbook for timing details)           │');
  console.log('  └─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('  Campaign files exported to data/campaign/');
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});

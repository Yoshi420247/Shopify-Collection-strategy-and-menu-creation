#!/usr/bin/env node
/**
 * Customer Segment Tagging for Shopify Email Campaigns
 *
 * Reads extracted customer data and pushes segment tags directly onto
 * customer records in Shopify. This makes segments targetable in
 * Shopify Email without any CSV import.
 *
 * How it works:
 *   1. Reads customer-master-list.json (from extract-customer-data.js)
 *   2. Computes segment tags for each customer (prefixed with "segment:")
 *   3. Merges new segment tags with existing customer tags (preserving non-segment tags)
 *   4. PUTs updated tags to Shopify via Customer API
 *
 * In Shopify Email, target campaigns using:
 *   Customer tag = "segment:smokeshop-buyer"
 *   Customer tag = "segment:vip"
 *   etc.
 *
 * Usage:
 *   node src/tag-customer-segments.js                # Dry run - shows what would change
 *   node src/tag-customer-segments.js --execute      # Actually push tags to Shopify
 *   node src/tag-customer-segments.js --clear        # Remove all segment: tags (dry run)
 *   node src/tag-customer-segments.js --clear --execute  # Remove all segment: tags (live)
 *   node src/tag-customer-segments.js --max=50       # Process only first 50 customers
 *
 * Prerequisites:
 *   Run "npm run customers" first to generate data/customer-master-list.json
 */

import { config } from './config.js';
import { updateCustomer, getCustomers } from './shopify-api.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');

// ─── CLI FLAGS ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const CLEAR_MODE = args.includes('--clear');
const MAX_ARG = args.find(a => a.startsWith('--max='));
const MAX_CUSTOMERS = MAX_ARG ? parseInt(MAX_ARG.split('=')[1]) : Infinity;

// ─── SEGMENT TAG PREFIX ─────────────────────────────────────────────────────
// All automated segment tags use this prefix so they're easy to identify,
// filter on in Shopify Email, and clear/update without touching manual tags.
const SEGMENT_PREFIX = 'segment:';
const RFM_PREFIX = 'rfm:';
const ALL_PREFIXES = [SEGMENT_PREFIX, RFM_PREFIX];

// ─── SEGMENT RULES ─────────────────────────────────────────────────────────
// Each rule maps a tag name to a condition function on the customer record.
// These match the segments from extract-customer-data.js.
function computeSegmentTags(customer) {
  const tags = [];

  const orderCount = customer.order_count || 0;
  const totalSpent = parseFloat(customer.total_spent) || 0;
  const avgOrderValue = parseFloat(customer.avg_order_value) || 0;
  const daysSinceLast = customer.days_since_last_order;
  const smokeshopOrders = customer.smokeshop_order_count || 0;
  const smokeshopSpend = parseFloat(customer.smokeshop_spend) || 0;
  const rfmTotal = customer.rfm_total || 0;
  const recency = customer.recency_score || 0;
  const frequency = customer.frequency_score || 0;
  const monetary = customer.monetary_score || 0;
  const optedIn = customer.accepts_marketing === 'yes' || customer.marketing_consent === 'subscribed';

  // ── Purchase status ────────────────────────────────────────────────
  if (orderCount > 0) tags.push('segment:purchaser');
  if (orderCount === 0) tags.push('segment:no-purchase');

  // ── Smokeshop segments (your priority for the new product launch) ──
  if (smokeshopOrders > 0) tags.push('segment:smokeshop-buyer');
  if (smokeshopSpend >= 100) tags.push('segment:smokeshop-high-value');
  if (smokeshopOrders >= 2) tags.push('segment:smokeshop-repeat');

  // ── Value tiers ────────────────────────────────────────────────────
  if (rfmTotal >= 12) tags.push('segment:vip');
  if (recency >= 5 && frequency >= 4 && monetary >= 4) tags.push('segment:champion');
  if (totalSpent >= 200) tags.push('segment:high-value');
  if (avgOrderValue >= 75) tags.push('segment:high-aov');

  // ── Frequency ──────────────────────────────────────────────────────
  if (orderCount >= 3) tags.push('segment:loyal');
  if (orderCount >= 2) tags.push('segment:repeat-buyer');
  if (orderCount === 1) tags.push('segment:one-time-buyer');

  // ── Recency ────────────────────────────────────────────────────────
  if (daysSinceLast !== '' && daysSinceLast !== null && daysSinceLast !== undefined) {
    const days = parseInt(daysSinceLast);
    if (days <= 30) tags.push('segment:active-30d');
    else if (days <= 90) tags.push('segment:active-90d');
    else if (days <= 180) tags.push('segment:cooling-off');
    else if (days <= 365) tags.push('segment:at-risk');
    else tags.push('segment:lost');
  }

  // ── RFM tier ───────────────────────────────────────────────────────
  if (rfmTotal >= 10) tags.push('rfm:high');
  else if (rfmTotal >= 5) tags.push('rfm:medium');
  else if (rfmTotal >= 1) tags.push('rfm:low');

  // ── Consent tracking ──────────────────────────────────────────────
  if (optedIn) tags.push('segment:opted-in');
  else tags.push('segment:not-opted-in');

  return tags;
}

// ─── TAG MERGING ────────────────────────────────────────────────────────────
// Preserves all existing customer tags that aren't segment/rfm tags,
// then appends the new computed segment tags.
function mergeTags(existingTagString, newSegmentTags) {
  const existing = (existingTagString || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  // Remove old segment/rfm tags
  const preserved = existing.filter(tag =>
    !ALL_PREFIXES.some(prefix => tag.startsWith(prefix))
  );

  // Combine preserved + new
  const merged = [...preserved, ...newSegmentTags];

  // Dedupe and sort
  return [...new Set(merged)].sort().join(', ');
}

function clearSegmentTags(existingTagString) {
  const existing = (existingTagString || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  return existing
    .filter(tag => !ALL_PREFIXES.some(prefix => tag.startsWith(prefix)))
    .sort()
    .join(', ');
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CUSTOMER SEGMENT TAGGING                                 ║');
  console.log('║   Push segment tags to Shopify for Email campaigns         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Store: ${config.shopify.storeUrl}`);
  console.log(`Mode:  ${CLEAR_MODE ? 'CLEAR segment tags' : 'APPLY segment tags'}`);
  console.log(`Live:  ${EXECUTE ? 'YES - will modify Shopify data' : 'DRY RUN - no changes'}`);
  if (MAX_CUSTOMERS < Infinity) console.log(`Limit: ${MAX_CUSTOMERS} customers`);
  console.log('');

  // ─── Load extracted data ──────────────────────────────────────────
  const dataFile = join(DATA_DIR, 'customer-master-list.json');

  if (!existsSync(dataFile)) {
    console.error('ERROR: data/customer-master-list.json not found.');
    console.error('Run "npm run customers" first to extract customer data.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const customers = data.customers || [];
  console.log(`Loaded ${customers.length} customers from extraction data`);
  console.log(`Extracted at: ${data.extracted_at}`);
  console.log('');

  // ─── Compute tags ─────────────────────────────────────────────────
  const toProcess = customers.slice(0, MAX_CUSTOMERS);
  const updates = [];
  const tagStats = {};

  for (const customer of toProcess) {
    if (!customer.shopify_customer_id) continue;

    let newTagString;

    if (CLEAR_MODE) {
      newTagString = clearSegmentTags(customer.customer_tags);
    } else {
      const segmentTags = computeSegmentTags(customer);
      newTagString = mergeTags(customer.customer_tags, segmentTags);

      // Track tag distribution
      for (const tag of segmentTags) {
        tagStats[tag] = (tagStats[tag] || 0) + 1;
      }
    }

    // Only update if tags actually changed
    const currentTags = (customer.customer_tags || '').split(',').map(t => t.trim()).filter(Boolean).sort().join(', ');
    const proposedTags = newTagString.split(',').map(t => t.trim()).filter(Boolean).sort().join(', ');

    if (currentTags !== proposedTags) {
      updates.push({
        id: customer.shopify_customer_id,
        email: customer.email,
        currentTags: currentTags,
        newTags: proposedTags,
      });
    }
  }

  // ─── Show plan ────────────────────────────────────────────────────
  console.log('━━━ TAG DISTRIBUTION ━━━');
  if (!CLEAR_MODE) {
    const sorted = Object.entries(tagStats).sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of sorted) {
      const bar = '█'.repeat(Math.min(Math.round(count / toProcess.length * 40), 40));
      console.log(`  ${tag.padEnd(35)} ${String(count).padStart(6)}  ${bar}`);
    }
  }
  console.log('');

  console.log('━━━ UPDATE PLAN ━━━');
  console.log(`  Customers analyzed:  ${toProcess.length}`);
  console.log(`  Need tag updates:    ${updates.length}`);
  console.log(`  Already up to date:  ${toProcess.length - updates.length}`);
  console.log('');

  if (updates.length === 0) {
    console.log('All customers already have correct segment tags. Nothing to do.');
    return;
  }

  // Show first 10 examples
  console.log('Examples of changes (first 10):');
  for (const u of updates.slice(0, 10)) {
    const added = u.newTags.split(', ').filter(t =>
      ALL_PREFIXES.some(p => t.startsWith(p)) && !u.currentTags.includes(t)
    );
    const removed = u.currentTags.split(', ').filter(t =>
      ALL_PREFIXES.some(p => t.startsWith(p)) && !u.newTags.includes(t)
    );

    console.log(`  ${u.email}`);
    if (added.length > 0) console.log(`    + ${added.join(', ')}`);
    if (removed.length > 0) console.log(`    - ${removed.join(', ')}`);
  }
  console.log('');

  if (!EXECUTE) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  DRY RUN - No changes made to Shopify.');
    console.log('  Run with --execute to push tags to Shopify.');
    console.log('═══════════════════════════════════════════════════════════');

    // Write dry run report
    mkdirSync(DATA_DIR, { recursive: true });
    const report = {
      mode: CLEAR_MODE ? 'clear' : 'apply',
      dry_run: true,
      timestamp: new Date().toISOString(),
      customers_analyzed: toProcess.length,
      customers_needing_update: updates.length,
      tag_distribution: tagStats,
      updates_planned: updates.slice(0, 100).map(u => ({
        email: u.email,
        current: u.currentTags,
        proposed: u.newTags,
      })),
    };
    writeFileSync(join(DATA_DIR, 'tagging-dry-run.json'), JSON.stringify(report, null, 2));
    console.log('  Dry run report saved to data/tagging-dry-run.json');
    return;
  }

  // ─── Execute updates ──────────────────────────────────────────────
  console.log('━━━ PUSHING TAGS TO SHOPIFY ━━━');

  let success = 0;
  let errors = 0;
  const errorLog = [];

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];

    try {
      await updateCustomer(u.id, { id: u.id, tags: u.newTags });
      success++;

      if ((i + 1) % 25 === 0 || i === updates.length - 1) {
        const pct = ((i + 1) / updates.length * 100).toFixed(1);
        console.log(`  Progress: ${i + 1}/${updates.length} (${pct}%) - ${success} ok, ${errors} errors`);
      }
    } catch (err) {
      errors++;
      errorLog.push({ email: u.email, id: u.id, error: err.message });
      console.log(`  ✗ Failed: ${u.email} - ${err.message}`);
    }
  }

  // ─── Results ──────────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TAGGING COMPLETE                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Successfully tagged:  ${success}`);
  console.log(`  Errors:               ${errors}`);
  console.log('');

  if (success > 0 && !CLEAR_MODE) {
    console.log('  ┌─────────────────────────────────────────────────────────┐');
    console.log('  │  NEXT STEPS - Create campaigns in Shopify Email:       │');
    console.log('  │                                                        │');
    console.log('  │  1. Go to Shopify Admin → Marketing → Campaigns        │');
    console.log('  │  2. Create campaign → Choose Shopify Email             │');
    console.log('  │  3. Under Recipients, use "Customer tags"              │');
    console.log('  │  4. Target any of these tags:                          │');
    console.log('  │                                                        │');
    console.log('  │     segment:smokeshop-buyer                            │');
    console.log('  │     segment:smokeshop-high-value                       │');
    console.log('  │     segment:vip                                        │');
    console.log('  │     segment:at-risk                                    │');
    console.log('  │     segment:one-time-buyer                             │');
    console.log('  │     rfm:high                                           │');
    console.log('  │     ... and more (see tag distribution above)          │');
    console.log('  │                                                        │');
    console.log('  │  Note: Shopify Email will only send to customers       │');
    console.log('  │  with segment:opted-in who accepted marketing.         │');
    console.log('  │  Use a re-engagement flow for segment:not-opted-in.    │');
    console.log('  └─────────────────────────────────────────────────────────┘');
  }

  // Save execution report
  const report = {
    mode: CLEAR_MODE ? 'clear' : 'apply',
    dry_run: false,
    timestamp: new Date().toISOString(),
    customers_updated: success,
    errors: errors,
    tag_distribution: tagStats,
    error_log: errorLog,
  };
  writeFileSync(join(DATA_DIR, 'tagging-results.json'), JSON.stringify(report, null, 2));
  console.log(`  Results saved to data/tagging-results.json`);
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});

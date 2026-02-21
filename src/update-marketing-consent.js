#!/usr/bin/env node
/**
 * Update Email Marketing Consent for ALL Shopify Customers
 *
 * Fetches every customer directly from Shopify (not from extracted JSON)
 * and sets emailMarketingConsent to SUBSCRIBED using the dedicated
 * GraphQL customerEmailMarketingConsentUpdate mutation.
 *
 * Usage:
 *   node src/update-marketing-consent.js                # Dry run
 *   node src/update-marketing-consent.js --execute      # Actually update
 *   node src/update-marketing-consent.js --execute --max=100  # Limit to first 100
 */

import { config } from './config.js';
import { paginateAll, graphqlFetch } from './shopify-api.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');

// CLI flags
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const MAX_ARG = args.find(a => a.startsWith('--max='));
const MAX_CUSTOMERS = MAX_ARG ? parseInt(MAX_ARG.split('=')[1]) : Infinity;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   EMAIL MARKETING CONSENT UPDATE                               ║');
  console.log('║   Subscribe ALL customers to email marketing via GraphQL       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`Store: ${config.shopify.storeUrl}`);
  console.log(`Mode:  ${EXECUTE ? 'EXECUTE - will update Shopify' : 'DRY RUN - no changes'}`);
  if (MAX_CUSTOMERS < Infinity) console.log(`Limit: ${MAX_CUSTOMERS} customers`);
  console.log('');

  // ─── Step 1: Fetch ALL customers directly from Shopify ──────────────
  console.log('━━━ FETCHING ALL CUSTOMERS FROM SHOPIFY ━━━');
  console.log('  (Paginating through entire customer database...)');
  console.log('');

  const allCustomers = await paginateAll('customers.json', 'customers', {
    limit: 250,
    fields: 'id,email,email_marketing_consent,accepts_marketing,first_name,last_name',
  });

  console.log(`\n  Total customers fetched: ${allCustomers.length}`);
  console.log('');

  // ─── Step 2: Categorize customers ───────────────────────────────────
  const alreadySubscribed = [];
  const needsUpdate = [];
  const noEmail = [];

  for (const customer of allCustomers) {
    if (!customer.email) {
      noEmail.push(customer);
      continue;
    }

    const consentState = customer.email_marketing_consent?.state;
    if (consentState === 'subscribed') {
      alreadySubscribed.push(customer);
    } else {
      needsUpdate.push(customer);
    }
  }

  // Apply max limit
  const toUpdate = needsUpdate.slice(0, MAX_CUSTOMERS);

  console.log('━━━ CONSENT AUDIT ━━━');
  console.log(`  Total customers:              ${allCustomers.length}`);
  console.log(`  Already subscribed:           ${alreadySubscribed.length}`);
  console.log(`  Need consent update:          ${needsUpdate.length}`);
  console.log(`  No email on record:           ${noEmail.length}`);
  console.log(`  Will update this run:         ${toUpdate.length}`);
  console.log('');

  // Show consent state breakdown
  const stateBreakdown = {};
  for (const c of allCustomers) {
    const state = c.email_marketing_consent?.state || 'none';
    stateBreakdown[state] = (stateBreakdown[state] || 0) + 1;
  }
  console.log('  Current consent states:');
  for (const [state, count] of Object.entries(stateBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${state.padEnd(20)} ${count}`);
  }
  console.log('');

  if (toUpdate.length === 0) {
    console.log('All customers are already subscribed. Nothing to do.');
    return;
  }

  // Show examples
  console.log('  Examples (first 10 needing update):');
  for (const c of toUpdate.slice(0, 10)) {
    const state = c.email_marketing_consent?.state || 'none';
    console.log(`    ${(c.email || 'no-email').padEnd(40)} current: ${state}`);
  }
  console.log('');

  if (!EXECUTE) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  DRY RUN - No changes made.');
    console.log(`  Would subscribe ${toUpdate.length} customers to email marketing.`);
    console.log('  Run with --execute to apply.');
    console.log('═══════════════════════════════════════════════════════════════');

    mkdirSync(DATA_DIR, { recursive: true });
    const report = {
      mode: 'consent-update',
      dry_run: true,
      timestamp: new Date().toISOString(),
      total_customers: allCustomers.length,
      already_subscribed: alreadySubscribed.length,
      needs_update: needsUpdate.length,
      no_email: noEmail.length,
      would_update: toUpdate.length,
      consent_state_breakdown: stateBreakdown,
    };
    writeFileSync(join(DATA_DIR, 'consent-update-dry-run.json'), JSON.stringify(report, null, 2));
    console.log('  Dry run report saved to data/consent-update-dry-run.json');
    return;
  }

  // ─── Step 3: Batch update via GraphQL ───────────────────────────────
  // Use customerEmailMarketingConsentUpdate - the dedicated mutation
  console.log('━━━ UPDATING MARKETING CONSENT (GraphQL batched) ━━━');

  const BATCH_SIZE = 10;
  const CONCURRENCY = 3;
  const batches = [];

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    batches.push(toUpdate.slice(i, i + BATCH_SIZE));
  }

  console.log(`  ${toUpdate.length} customers → ${batches.length} batches of ${BATCH_SIZE} × ${CONCURRENCY} workers`);
  console.log('');

  let batchIndex = 0;
  let success = 0;
  let errors = 0;
  const errorLog = [];
  const startTime = Date.now();

  async function consentWorker(workerId) {
    while (true) {
      const idx = batchIndex++;
      if (idx >= batches.length) break;

      const batch = batches[idx];

      // Build batched GraphQL mutation using customerEmailMarketingConsentUpdate
      const mutations = batch.map((customer, j) => {
        const gid = `gid://shopify/Customer/${customer.id}`;
        return `c${j}: customerEmailMarketingConsentUpdate(input: {
          customerId: "${gid}"
          emailMarketingConsent: {
            marketingOptInLevel: SINGLE_OPT_IN
            marketingState: SUBSCRIBED
            consentUpdatedAt: "${new Date().toISOString()}"
          }
        }) {
          customer { id email }
          userErrors { field message }
        }`;
      });

      const query = `mutation {\n  ${mutations.join('\n  ')}\n}`;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await graphqlFetch(query);

          // Handle throttling
          if (result.errors?.some(e => e.extensions?.code === 'THROTTLED')) {
            const wait = 2000 * attempt;
            await sleep(wait);
            if (attempt < 3) continue;
          }

          // Handle top-level GraphQL errors (e.g., syntax/schema errors)
          if (result.errors && !result.data) {
            throw new Error(result.errors.map(e => e.message).join('; '));
          }

          // Process individual results
          for (let j = 0; j < batch.length; j++) {
            const res = result.data?.[`c${j}`];
            if (res?.userErrors?.length > 0) {
              errors++;
              errorLog.push({
                email: batch[j].email,
                id: batch[j].id,
                error: res.userErrors.map(e => e.message).join('; '),
              });
            } else if (res?.customer) {
              success++;
            } else {
              errors++;
              errorLog.push({
                email: batch[j].email,
                id: batch[j].id,
                error: 'No customer returned in response',
              });
            }
          }

          // Cost-based rate limiting
          const available = result.extensions?.cost?.throttleStatus?.currentlyAvailable;
          if (available !== undefined) {
            if (available < 100) await sleep(3000);
            else if (available < 200) await sleep(1000);
            else if (available < 400) await sleep(200);
          }

          break; // Success
        } catch (err) {
          if (attempt >= 3) {
            errors += batch.length;
            for (const c of batch) {
              errorLog.push({ email: c.email, id: c.id, error: err.message });
            }
            console.log(`  ✗ Batch failed: ${err.message}`);
          } else {
            await sleep(2000 * attempt);
          }
        }
      }

      // Progress reporting
      const processed = Math.min((idx + 1) * BATCH_SIZE, toUpdate.length);
      if (processed % 500 === 0 || processed >= toUpdate.length || idx === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = elapsed > 0 ? (processed / elapsed * 60).toFixed(0) : '...';
        const pct = (processed / toUpdate.length * 100).toFixed(1);
        console.log(`  Progress: ${processed}/${toUpdate.length} (${pct}%) - ${success} ok, ${errors} errors [${elapsed}s, ~${rate}/min]`);
      }
    }
  }

  // Launch concurrent workers
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => consentWorker(i))
  );

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const finalRate = totalElapsed > 0 ? (success / totalElapsed * 60).toFixed(0) : 0;
  console.log(`  Completed in ${totalElapsed}s (~${finalRate} customers/min)`);
  console.log('');

  // ─── Results ──────────────────────────────────────────────────────
  const totalSubscribed = alreadySubscribed.length + success;

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   CONSENT UPDATE COMPLETE                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Previously subscribed:  ${alreadySubscribed.length}`);
  console.log(`  Newly subscribed:       ${success}`);
  console.log(`  Errors:                 ${errors}`);
  console.log(`  Total now subscribed:   ${totalSubscribed} / ${allCustomers.length}`);
  console.log(`  No email (skipped):     ${noEmail.length}`);
  console.log('');

  if (errors > 0) {
    console.log('  First 10 errors:');
    for (const e of errorLog.slice(0, 10)) {
      console.log(`    ${e.email}: ${e.error}`);
    }
    console.log('');
  }

  console.log('  All customers with email addresses can now receive');
  console.log('  Shopify Email campaigns. Use your segment: tags to target.');
  console.log('');

  // Save report
  mkdirSync(DATA_DIR, { recursive: true });
  const report = {
    mode: 'consent-update',
    dry_run: false,
    timestamp: new Date().toISOString(),
    total_customers: allCustomers.length,
    previously_subscribed: alreadySubscribed.length,
    newly_subscribed: success,
    errors: errors,
    no_email: noEmail.length,
    total_now_subscribed: totalSubscribed,
    error_log: errorLog,
  };
  writeFileSync(join(DATA_DIR, 'consent-update-results.json'), JSON.stringify(report, null, 2));
  console.log('  Results saved to data/consent-update-results.json');
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});

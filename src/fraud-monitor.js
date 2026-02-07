#!/usr/bin/env node
/**
 * Fraud Monitor — Detects and cancels card-testing bot orders
 *
 * Card testing patterns detected:
 *   - Rapid-fire orders from same IP/email/billing address
 *   - Orders with mismatched billing/shipping info
 *   - Disposable/temporary email domains
 *   - Shopify's own fraud risk assessment (medium/high)
 *   - Tiny orders designed to test card validity
 *   - Multiple failed payment attempts (gateway declines)
 *   - Generic/fake customer names
 *   - Missing or invalid phone numbers
 *
 * Usage:
 *   node src/fraud-monitor.js                    # Report mode (dry run)
 *   node src/fraud-monitor.js --execute          # Cancel flagged orders
 *   node src/fraud-monitor.js --since=24h        # Check last 24 hours (default)
 *   node src/fraud-monitor.js --since=7d         # Check last 7 days
 *   node src/fraud-monitor.js --threshold=3      # Min score to flag (default 3)
 *   node src/fraud-monitor.js --tag-only         # Tag but don't cancel
 */

import { get, post, put } from './shopify-api.js';

// ── CLI flags ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const TAG_ONLY = args.includes('--tag-only');
const sinceArg = args.find(a => a.startsWith('--since='));
const thresholdArg = args.find(a => a.startsWith('--threshold='));

const FRAUD_THRESHOLD = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : 3;

function parseSince(arg) {
  if (!arg) return 24; // default 24 hours
  const val = arg.split('=')[1];
  const num = parseInt(val, 10);
  if (val.endsWith('d')) return num * 24;
  if (val.endsWith('h')) return num;
  return num;
}
const SINCE_HOURS = parseSince(sinceArg);

// ── Disposable email domains (common ones used by bots) ─────────────
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'mailnesia.com', 'maildrop.cc', 'trashmail.com',
  'fakeinbox.com', 'tempail.com', 'temp-mail.org', 'getnada.com',
  'mohmal.com', 'burnermail.io', 'discard.email', 'emailondeck.com',
  '10minutemail.com', 'minutemail.com', 'tempr.email', 'tempmailo.com',
  'emailfake.com', 'crazymailing.com', 'trashmail.net', 'trash-mail.com',
  'mailcatch.com', 'mail-temporaire.fr', 'jetable.com', 'mytemp.email',
  'tempinbox.com', 'binkmail.com', 'safetymail.info', 'filzmail.com',
  'spamgourmet.com', 'tempmailaddress.com', 'tempemails.com',
]);

// Common fake/test names used by bots
const FAKE_NAME_PATTERNS = [
  /^test\b/i, /^fake\b/i, /^asdf/i, /^qwer/i, /^aaa+$/i, /^bbb+$/i,
  /^xxx+$/i, /^john\s+doe$/i, /^jane\s+doe$/i, /^foo\s+bar$/i,
  /^sample/i, /^demo/i, /^\w$/,  // single character names
];

// ── Scoring functions ───────────────────────────────────────────────────

function scoreOrder(order, orderCluster) {
  const flags = [];
  let score = 0;

  // 1. Shopify's own fraud recommendation
  if (order._risks) {
    const highRisk = order._risks.some(r => r.recommendation === 'cancel');
    const mediumRisk = order._risks.some(r => r.recommendation === 'investigate');
    if (highRisk) {
      score += 4;
      flags.push('SHOPIFY_HIGH_RISK');
    } else if (mediumRisk) {
      score += 2;
      flags.push('SHOPIFY_MEDIUM_RISK');
    }
  }

  // 2. Disposable email
  const email = (order.email || '').toLowerCase();
  const domain = email.split('@')[1];
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    score += 3;
    flags.push(`DISPOSABLE_EMAIL(${domain})`);
  }

  // 3. No email at all
  if (!email) {
    score += 2;
    flags.push('NO_EMAIL');
  }

  // 4. Fake-looking name
  const billing = order.billing_address || {};
  const fullName = `${billing.first_name || ''} ${billing.last_name || ''}`.trim();
  for (const pattern of FAKE_NAME_PATTERNS) {
    if (pattern.test(fullName)) {
      score += 2;
      flags.push(`FAKE_NAME(${fullName})`);
      break;
    }
  }

  // 5. Billing/shipping mismatch
  const shipping = order.shipping_address || {};
  if (billing.zip && shipping.zip && billing.zip !== shipping.zip) {
    score += 1;
    flags.push('ZIP_MISMATCH');
  }
  if (billing.country_code && shipping.country_code &&
      billing.country_code !== shipping.country_code) {
    score += 2;
    flags.push('COUNTRY_MISMATCH');
  }

  // 6. Very small order total (card testing uses tiny amounts)
  const total = parseFloat(order.total_price || 0);
  if (total > 0 && total < 5.00) {
    score += 2;
    flags.push(`TINY_ORDER($${total})`);
  }

  // 7. Single quantity of cheapest item (classic card test)
  const itemCount = (order.line_items || []).reduce((sum, li) => sum + li.quantity, 0);
  if (itemCount === 1 && total < 20) {
    score += 1;
    flags.push('SINGLE_CHEAP_ITEM');
  }

  // 8. Missing or invalid phone
  const phone = (billing.phone || order.phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 7) {
    score += 1;
    flags.push('NO_PHONE');
  }

  // 9. IP cluster — same IP placing multiple orders
  if (orderCluster.byIp > 2) {
    score += 3;
    flags.push(`IP_CLUSTER(${orderCluster.byIp} orders)`);
  } else if (orderCluster.byIp > 1) {
    score += 1;
    flags.push(`IP_REPEAT(${orderCluster.byIp} orders)`);
  }

  // 10. Email cluster — same email multiple orders
  if (orderCluster.byEmail > 2) {
    score += 3;
    flags.push(`EMAIL_CLUSTER(${orderCluster.byEmail} orders)`);
  } else if (orderCluster.byEmail > 1) {
    score += 1;
    flags.push(`EMAIL_REPEAT(${orderCluster.byEmail} orders)`);
  }

  // 11. Address cluster — same billing address multiple orders
  if (orderCluster.byAddress > 2) {
    score += 3;
    flags.push(`ADDRESS_CLUSTER(${orderCluster.byAddress} orders)`);
  }

  // 12. Rapid-fire timing — orders within minutes of each other from same source
  if (orderCluster.rapidFire) {
    score += 3;
    flags.push('RAPID_FIRE');
  }

  // 13. Gateway declined but order still open (partial auth / test)
  const financialStatus = order.financial_status || '';
  if (financialStatus === 'pending' || financialStatus === 'voided') {
    score += 1;
    flags.push(`PAYMENT_${financialStatus.toUpperCase()}`);
  }

  // 14. Order placed from foreign country but shipping domestic (or vice versa)
  if (order.browser_ip) {
    // Can't geolocate IP here, but we check billing country vs shipping
  }

  return { score, flags };
}

// ── Build clusters for velocity detection ──────────────────────────────

function buildClusters(orders) {
  const byIp = {};
  const byEmail = {};
  const byAddress = {};
  const timestamps = {};

  for (const order of orders) {
    const ip = order.browser_ip || 'unknown';
    const email = (order.email || 'unknown').toLowerCase();
    const addr = normalizeAddress(order.billing_address);
    const ts = new Date(order.created_at).getTime();

    byIp[ip] = (byIp[ip] || 0) + 1;
    byEmail[email] = (byEmail[email] || 0) + 1;
    byAddress[addr] = (byAddress[addr] || 0) + 1;

    // Track timestamps per IP for rapid-fire detection
    if (!timestamps[ip]) timestamps[ip] = [];
    timestamps[ip].push(ts);
  }

  // Detect rapid-fire: 3+ orders from same IP within 10 minutes
  const rapidFireIps = new Set();
  for (const [ip, times] of Object.entries(timestamps)) {
    if (times.length < 3) continue;
    times.sort((a, b) => a - b);
    for (let i = 0; i < times.length - 2; i++) {
      if (times[i + 2] - times[i] < 10 * 60 * 1000) { // 10 minutes
        rapidFireIps.add(ip);
        break;
      }
    }
  }

  return { byIp, byEmail, byAddress, rapidFireIps };
}

function normalizeAddress(addr) {
  if (!addr) return 'unknown';
  return [
    (addr.address1 || '').toLowerCase().trim(),
    (addr.zip || '').trim(),
    (addr.country_code || '').trim(),
  ].join('|');
}

// ── Fetch orders with risk data ────────────────────────────────────────

async function fetchRecentOrders() {
  const since = new Date(Date.now() - SINCE_HOURS * 60 * 60 * 1000).toISOString();
  console.log(`\nFetching orders since ${since} (last ${SINCE_HOURS}h)...\n`);

  const allOrders = [];
  let page = 1;
  let hasMore = true;
  let sinceId = 0;

  while (hasMore) {
    const params = new URLSearchParams({
      status: 'any',
      limit: '250',
      created_at_min: since,
      fields: 'id,name,email,created_at,total_price,financial_status,fulfillment_status,' +
              'browser_ip,billing_address,shipping_address,line_items,tags,phone,cancel_reason,' +
              'cancelled_at,customer',
    });
    if (sinceId > 0) params.set('since_id', sinceId.toString());

    const data = await get(`orders.json?${params}`);
    const batch = data.orders || [];

    if (batch.length === 0) {
      hasMore = false;
    } else {
      allOrders.push(...batch);
      sinceId = batch[batch.length - 1].id;
      console.log(`  Page ${page}: ${batch.length} orders (total: ${allOrders.length})`);
      page++;
      if (batch.length < 250) hasMore = false;
    }
  }

  // Fetch risk assessments for each order
  console.log(`\nFetching risk assessments for ${allOrders.length} orders...`);
  let riskCount = 0;
  for (const order of allOrders) {
    try {
      const riskData = await get(`orders/${order.id}/risks.json`);
      order._risks = riskData.risks || [];
      riskCount++;
      if (riskCount % 25 === 0) {
        console.log(`  Assessed ${riskCount}/${allOrders.length} orders...`);
      }
    } catch {
      order._risks = [];
    }
  }

  return allOrders;
}

// ── Cancel / tag an order ──────────────────────────────────────────────

async function cancelOrder(order) {
  try {
    const result = await post(`orders/${order.id}/cancel.json`, {
      reason: 'fraud',
      email: false,  // don't notify the fraudster
      restock: true,
    });
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function tagOrder(order, newTags) {
  const existingTags = (order.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const combined = [...new Set([...existingTags, ...newTags])].join(', ');
  try {
    await put(`orders/${order.id}.json`, { order: { id: order.id, tags: combined } });
    return true;
  } catch {
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log('  FRAUD MONITOR — Card Testing Detection');
  console.log('='.repeat(70));
  console.log(`  Mode: ${EXECUTE ? (TAG_ONLY ? 'TAG ONLY' : 'EXECUTE (cancel + tag)') : 'REPORT (dry run)'}`);
  console.log(`  Lookback: ${SINCE_HOURS} hours`);
  console.log(`  Threshold: ${FRAUD_THRESHOLD}+ flags to act`);
  console.log('='.repeat(70));

  const orders = await fetchRecentOrders();

  if (orders.length === 0) {
    console.log('\nNo orders found in the time window.');
    return;
  }

  // Skip already-cancelled orders
  const activeOrders = orders.filter(o => !o.cancelled_at);
  const alreadyCancelled = orders.length - activeOrders.length;
  if (alreadyCancelled > 0) {
    console.log(`\n  Skipping ${alreadyCancelled} already-cancelled orders.`);
  }

  // Build velocity clusters
  const clusters = buildClusters(orders); // include all orders for pattern detection

  // Score every active order
  const scored = activeOrders.map(order => {
    const ip = order.browser_ip || 'unknown';
    const email = (order.email || 'unknown').toLowerCase();
    const addr = normalizeAddress(order.billing_address);

    const clusterInfo = {
      byIp: clusters.byIp[ip] || 0,
      byEmail: clusters.byEmail[email] || 0,
      byAddress: clusters.byAddress[addr] || 0,
      rapidFire: clusters.rapidFireIps.has(ip),
    };

    const { score, flags } = scoreOrder(order, clusterInfo);
    return { order, score, flags };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Separate flagged vs clean
  const flagged = scored.filter(s => s.score >= FRAUD_THRESHOLD);
  const suspicious = scored.filter(s => s.score > 0 && s.score < FRAUD_THRESHOLD);
  const clean = scored.filter(s => s.score === 0);

  // ── Report ────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(70));
  console.log(`  RESULTS: ${flagged.length} FRAUD | ${suspicious.length} SUSPICIOUS | ${clean.length} CLEAN`);
  console.log('='.repeat(70));

  if (flagged.length > 0) {
    console.log('\n  FLAGGED FOR CANCELLATION (score >= ' + FRAUD_THRESHOLD + '):');
    console.log('  ' + '-'.repeat(66));

    for (const { order, score, flags } of flagged) {
      const billing = order.billing_address || {};
      const name = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'N/A';
      console.log(`\n  Order ${order.name} | Score: ${score} | $${order.total_price}`);
      console.log(`    Email: ${order.email || 'N/A'}`);
      console.log(`    Name: ${name}`);
      console.log(`    IP: ${order.browser_ip || 'N/A'}`);
      console.log(`    Status: ${order.financial_status} | ${order.fulfillment_status || 'unfulfilled'}`);
      console.log(`    Flags: ${flags.join(', ')}`);
    }
  }

  if (suspicious.length > 0) {
    console.log('\n\n  SUSPICIOUS (score 1-' + (FRAUD_THRESHOLD - 1) + ', monitoring only):');
    console.log('  ' + '-'.repeat(66));

    for (const { order, score, flags } of suspicious) {
      console.log(`  Order ${order.name} | Score: ${score} | $${order.total_price} | ${flags.join(', ')}`);
    }
  }

  console.log(`\n  Clean orders: ${clean.length}`);

  // ── Execute ───────────────────────────────────────────────────────

  if (flagged.length === 0) {
    console.log('\n  No orders to cancel. Store looks clean!');
    return;
  }

  if (!EXECUTE) {
    console.log('\n  ' + '='.repeat(66));
    console.log(`  DRY RUN — ${flagged.length} orders would be ${TAG_ONLY ? 'tagged' : 'cancelled + tagged'}.`);
    console.log('  Run with --execute to take action.');
    console.log('  Run with --execute --tag-only to tag without cancelling.');
    console.log('  ' + '='.repeat(66));
    return;
  }

  console.log(`\n  Processing ${flagged.length} flagged orders...`);

  let cancelled = 0;
  let tagged = 0;
  let errors = 0;

  for (const { order, score, flags } of flagged) {
    const tags = ['fraud-flagged', `fraud-score-${score}`];

    // Cancel unless tag-only mode
    if (!TAG_ONLY) {
      // Don't cancel already-paid/fulfilled orders — tag them for manual review
      if (order.fulfillment_status === 'fulfilled' || order.financial_status === 'paid') {
        tags.push('fraud-manual-review');
        console.log(`    ${order.name}: SKIPPED cancel (already ${order.financial_status}/${order.fulfillment_status || 'unfulfilled'}) — tagged for manual review`);
      } else {
        const result = await cancelOrder(order);
        if (result.success) {
          cancelled++;
          tags.push('fraud-cancelled');
          console.log(`    ${order.name}: CANCELLED ($${order.total_price}, score ${score})`);
        } else {
          errors++;
          tags.push('fraud-cancel-failed');
          console.log(`    ${order.name}: CANCEL FAILED — ${result.error}`);
        }
      }
    }

    // Tag the order either way
    const tagResult = await tagOrder(order, tags);
    if (tagResult) {
      tagged++;
    }
  }

  console.log('\n  ' + '='.repeat(66));
  console.log(`  DONE: ${cancelled} cancelled, ${tagged} tagged, ${errors} errors`);
  console.log('  ' + '='.repeat(66));

  // Summary of IPs to block (if your firewall supports it)
  const fraudIps = [...new Set(flagged.map(f => f.order.browser_ip).filter(Boolean))];
  if (fraudIps.length > 0) {
    console.log('\n  IPs to consider blocking (firewall/Cloudflare):');
    fraudIps.forEach(ip => console.log(`    ${ip}`));
  }

  // Summary of email domains
  const fraudDomains = [...new Set(
    flagged.map(f => (f.order.email || '').split('@')[1]).filter(Boolean)
  )];
  if (fraudDomains.length > 0) {
    console.log('\n  Email domains from fraud orders:');
    fraudDomains.forEach(d => console.log(`    ${d}`));
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});

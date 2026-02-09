#!/usr/bin/env node
/**
 * Auto-Cancel Orders & Monitor Abandoned Checkouts Under $20
 *
 * SERVER-SIDE safety net for minimum order enforcement.
 *
 *   1. Scans recent ORDERS and cancels any under $20
 *   2. Scans ABANDONED CHECKOUTS and reports card-testing activity
 *   3. Optionally tags fraud IPs/emails for monitoring
 *
 * Usage:
 *   node src/auto-cancel-under-minimum.js           # Report only
 *   node src/auto-cancel-under-minimum.js --execute  # Cancel orders + report checkouts
 *
 * Recommended: Run via GitHub Actions on a schedule (every 5-15 minutes)
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

const EXECUTE = process.argv.includes('--execute');
const MINIMUM_AMOUNT = 20.00;
const CANCEL_REASON = 'fraud';
const CANCEL_NOTE = `Auto-cancelled: Order below $${MINIMUM_AMOUNT.toFixed(2)} minimum. Likely card testing.`;

// How far back to look (hours)
const LOOKBACK_HOURS = 24;

function curlRequest(url, method = 'GET', bodyFile = null) {
  let cmd = `curl -s --max-time 60 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;
  if (bodyFile) {
    cmd += `-d @${bodyFile}`;
  }
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    if (!result || !result.trim()) {
      return {};
    }
    return JSON.parse(result);
  } catch (err) {
    console.error('   API error:', err.message);
    return {};
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== MINIMUM ORDER ENFORCEMENT - SERVER SIDE ===\n');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'REPORT ONLY'}`);
  console.log(`Store: ${STORE_URL}`);
  console.log(`Minimum: $${MINIMUM_AMOUNT.toFixed(2)}`);
  console.log(`Lookback: ${LOOKBACK_HOURS} hours`);
  console.log();

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // =================================================================
  // PART 1: ORDERS - Cancel any completed orders under minimum
  // =================================================================
  console.log('━━━ PART 1: ORDERS ━━━\n');
  console.log('Fetching recent orders...');

  const ordersResponse = curlRequest(
    `${BASE_URL}/orders.json?status=any&created_at_min=${since}&limit=250`
  );

  const orders = ordersResponse.orders || [];
  console.log(`Found ${orders.length} total orders in the last ${LOOKBACK_HOURS}h.\n`);

  const underMinOrders = orders.filter(order => {
    const total = parseFloat(order.total_price);
    const notCancelled = !order.cancelled_at;
    const notRefunded = order.financial_status !== 'refunded' && order.financial_status !== 'voided';
    return total < MINIMUM_AMOUNT && total > 0 && notCancelled && notRefunded;
  });

  let cancelledCount = 0;
  let failedCount = 0;

  if (underMinOrders.length === 0) {
    console.log('No orders under minimum. All clear.\n');
  } else {
    console.log(`Found ${underMinOrders.length} order(s) under $${MINIMUM_AMOUNT.toFixed(2)}:\n`);

    for (const order of underMinOrders) {
      const total = parseFloat(order.total_price);
      const email = order.email || 'no email';
      const ip = order.browser_ip || 'unknown IP';
      const name = order.name;
      const status = order.financial_status;
      const items = order.line_items.map(li => `${li.title} x${li.quantity}`).join(', ');

      console.log(`  ${name} | $${total.toFixed(2)} | ${status} | ${email} | IP: ${ip}`);
      console.log(`    Items: ${items}`);

      const isSuspicious = (
        total < 1.00 ||
        !order.billing_address ||
        (order.line_items.length === 1 && order.line_items[0].quantity === 1)
      );
      if (isSuspicious) {
        console.log(`    *** LIKELY CARD TESTING ***`);
      }

      if (EXECUTE) {
        console.log(`    Cancelling + marking as fraud...`);

        const cancelBody = {
          reason: CANCEL_REASON,
          email: false,
          restock: true
        };
        writeFileSync('/tmp/cancel_order.json', JSON.stringify(cancelBody));
        const cancelResult = curlRequest(
          `${BASE_URL}/orders/${order.id}/cancel.json`,
          'POST',
          '/tmp/cancel_order.json'
        );

        if (cancelResult.order || cancelResult.notice) {
          console.log(`    CANCELLED.`);
          cancelledCount++;

          // Tag the order for tracking
          await sleep(600);
          const tagBody = {
            order: {
              id: order.id,
              note: CANCEL_NOTE,
              tags: (order.tags ? order.tags + ', ' : '') + 'auto-cancelled, card-testing, under-minimum'
            }
          };
          writeFileSync('/tmp/order_tag.json', JSON.stringify(tagBody));
          curlRequest(`${BASE_URL}/orders/${order.id}.json`, 'PUT', '/tmp/order_tag.json');
        } else {
          console.log(`    FAILED:`, JSON.stringify(cancelResult));
          failedCount++;
        }

        await sleep(600);
      }
      console.log();
    }
  }

  // =================================================================
  // PART 2: ABANDONED CHECKOUTS - Monitor card testing activity
  // =================================================================
  console.log('━━━ PART 2: ABANDONED CHECKOUTS ━━━\n');
  console.log('Fetching abandoned checkouts...');

  const checkoutsResponse = curlRequest(
    `${BASE_URL}/checkouts.json?created_at_min=${since}&limit=250`
  );

  const checkouts = checkoutsResponse.checkouts || [];
  console.log(`Found ${checkouts.length} abandoned checkouts in the last ${LOOKBACK_HOURS}h.\n`);

  const suspiciousCheckouts = checkouts.filter(co => {
    const total = parseFloat(co.total_price || 0);
    return total < MINIMUM_AMOUNT && total > 0;
  });

  // Collect IPs and emails from suspicious activity
  const suspiciousIPs = new Map();
  const suspiciousEmails = new Map();

  if (suspiciousCheckouts.length === 0) {
    console.log('No suspicious abandoned checkouts under minimum.\n');
  } else {
    console.log(`Found ${suspiciousCheckouts.length} abandoned checkout(s) under $${MINIMUM_AMOUNT.toFixed(2)}:\n`);

    for (const co of suspiciousCheckouts) {
      const total = parseFloat(co.total_price || 0);
      const email = co.email || 'no email';
      const ip = co.source_url ? '(via storefront)' : 'direct API';
      const created = new Date(co.created_at).toLocaleString();
      const items = (co.line_items || []).map(li => `${li.title} x${li.quantity}`).join(', ');

      console.log(`  $${total.toFixed(2)} | ${email} | ${created}`);
      if (items) console.log(`    Items: ${items}`);

      // Track IPs
      if (co.browser_ip) {
        const count = suspiciousIPs.get(co.browser_ip) || 0;
        suspiciousIPs.set(co.browser_ip, count + 1);
      }

      // Track emails
      if (co.email) {
        const count = suspiciousEmails.get(co.email) || 0;
        suspiciousEmails.set(co.email, count + 1);
      }
    }
    console.log();
  }

  // =================================================================
  // PART 3: FRAUD INTELLIGENCE SUMMARY
  // =================================================================
  console.log('━━━ PART 3: FRAUD INTELLIGENCE ━━━\n');

  // Combine data from orders and checkouts
  for (const order of underMinOrders) {
    if (order.browser_ip) {
      const count = suspiciousIPs.get(order.browser_ip) || 0;
      suspiciousIPs.set(order.browser_ip, count + 1);
    }
    if (order.email) {
      const count = suspiciousEmails.get(order.email) || 0;
      suspiciousEmails.set(order.email, count + 1);
    }
  }

  if (suspiciousIPs.size > 0) {
    console.log('Suspicious IPs (by frequency):');
    const sortedIPs = [...suspiciousIPs.entries()].sort((a, b) => b[1] - a[1]);
    for (const [ip, count] of sortedIPs) {
      console.log(`  ${ip}: ${count} attempt(s) ${count >= 3 ? '*** REPEAT OFFENDER ***' : ''}`);
    }
    console.log();
  }

  if (suspiciousEmails.size > 0) {
    console.log('Suspicious emails (by frequency):');
    const sortedEmails = [...suspiciousEmails.entries()].sort((a, b) => b[1] - a[1]);
    for (const [email, count] of sortedEmails) {
      console.log(`  ${email}: ${count} attempt(s) ${count >= 3 ? '*** REPEAT OFFENDER ***' : ''}`);
    }
    console.log();
  }

  if (suspiciousIPs.size === 0 && suspiciousEmails.size === 0) {
    console.log('No suspicious activity detected.\n');
  }

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log('━━━ SUMMARY ━━━\n');
  console.log(`Orders under minimum:              ${underMinOrders.length}`);
  if (EXECUTE) {
    console.log(`  Cancelled:                       ${cancelledCount}`);
    if (failedCount > 0) console.log(`  Failed:                          ${failedCount}`);
  }
  console.log(`Abandoned checkouts under minimum: ${suspiciousCheckouts.length}`);
  console.log(`Unique suspicious IPs:             ${suspiciousIPs.size}`);
  console.log(`Unique suspicious emails:          ${suspiciousEmails.size}`);

  if (!EXECUTE && underMinOrders.length > 0) {
    console.log('\nTo cancel the flagged orders, re-run with --execute');
  }

  // Recommendations based on activity level
  const totalSuspicious = underMinOrders.length + suspiciousCheckouts.length;
  if (totalSuspicious >= 10) {
    console.log('\n*** HIGH FRAUD ACTIVITY DETECTED ***');
    console.log('Recommendations:');
    console.log('  1. Contact Shopify Support to enable enhanced bot protection');
    console.log('  2. Temporarily enable password protection on the store');
    console.log('  3. Consider a fraud prevention app (Blockify, NoFraud, Signifyd)');
    console.log('  4. If on Shopify Plus, enable Checkout validation functions');
  } else if (totalSuspicious >= 3) {
    console.log('\n* MODERATE FRAUD ACTIVITY *');
    console.log('Recommendations:');
    console.log('  1. Monitor over the next few hours');
    console.log('  2. Contact Shopify Support if it increases');
    console.log('  3. Review Shopify Payments fraud settings');
  }

  console.log('\n=== COMPLETE ===');
}

main().catch(console.error);

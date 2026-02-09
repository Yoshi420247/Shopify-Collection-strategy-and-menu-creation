#!/usr/bin/env node
/**
 * Auto-Cancel Orders Under Minimum Amount ($20)
 *
 * SERVER-SIDE safety net for minimum order enforcement.
 * Scans recent orders and cancels any that are below $20.
 *
 * This catches orders that bypass client-side enforcement (bots, card testers,
 * direct API calls, disabled JavaScript, etc.)
 *
 * Usage:
 *   node src/auto-cancel-under-minimum.js           # Report only (show orders under $20)
 *   node src/auto-cancel-under-minimum.js --execute  # Cancel orders under $20
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
const CANCEL_REASON = 'other'; // Shopify accepts: customer, fraud, inventory, declined, other
const CANCEL_NOTE = `Auto-cancelled: Order below $${MINIMUM_AMOUNT.toFixed(2)} minimum order amount.`;

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
      console.error('   Empty response from API');
      return {};
    }
    return JSON.parse(result);
  } catch (err) {
    console.error('   curl/parse error:', err.message);
    return {};
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== AUTO-CANCEL ORDERS UNDER MINIMUM ($20) ===\n');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (will cancel orders)' : 'REPORT ONLY'}`);
  console.log(`Store: ${STORE_URL}`);
  console.log(`Minimum: $${MINIMUM_AMOUNT.toFixed(2)}`);
  console.log();

  // ---------------------------------------------------------------
  // Step 1: Fetch recent open/unfulfilled orders
  // ---------------------------------------------------------------
  console.log('1. Fetching recent orders...');

  // Get orders from the last 24 hours that are still open
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const ordersUrl = `${BASE_URL}/orders.json?status=any&created_at_min=${since}&limit=250`;
  const ordersResponse = curlRequest(ordersUrl);

  if (!ordersResponse.orders) {
    console.error('   ERROR: Could not fetch orders.');
    console.error('   Response:', JSON.stringify(ordersResponse, null, 2));
    return;
  }

  const orders = ordersResponse.orders;
  console.log(`   Found ${orders.length} orders in the last 24 hours.`);

  // ---------------------------------------------------------------
  // Step 2: Filter for orders under minimum that haven't been cancelled
  // ---------------------------------------------------------------
  console.log('\n2. Checking for orders under minimum...');

  const underMinimum = orders.filter(order => {
    const total = parseFloat(order.total_price);
    const notCancelled = !order.cancelled_at;
    const notRefunded = order.financial_status !== 'refunded' && order.financial_status !== 'voided';
    return total < MINIMUM_AMOUNT && total > 0 && notCancelled && notRefunded;
  });

  if (underMinimum.length === 0) {
    console.log('   No orders found under the minimum amount. All clear!');
    console.log('\n=== COMPLETE ===');
    return;
  }

  console.log(`   Found ${underMinimum.length} order(s) under $${MINIMUM_AMOUNT.toFixed(2)}:\n`);

  // ---------------------------------------------------------------
  // Step 3: Report and optionally cancel
  // ---------------------------------------------------------------
  let cancelledCount = 0;
  let failedCount = 0;

  for (const order of underMinimum) {
    const total = parseFloat(order.total_price);
    const email = order.email || 'no email';
    const name = order.name; // e.g., #1234
    const status = order.financial_status;
    const items = order.line_items.map(li => `${li.title} x${li.quantity}`).join(', ');

    console.log(`   ${name} | $${total.toFixed(2)} | ${status} | ${email}`);
    console.log(`     Items: ${items}`);

    // Flag likely card testing patterns
    const isSuspicious = (
      total < 1.00 ||
      !order.billing_address ||
      order.line_items.length === 1 && order.line_items[0].quantity === 1
    );
    if (isSuspicious) {
      console.log(`     *** LIKELY CARD TESTING ***`);
    }

    if (EXECUTE) {
      console.log(`     Cancelling...`);

      // Cancel the order
      const cancelBody = {
        reason: CANCEL_REASON,
        email: false, // Don't email the card tester
        restock: true
      };
      writeFileSync('/tmp/cancel_order.json', JSON.stringify(cancelBody));
      const cancelResult = curlRequest(
        `${BASE_URL}/orders/${order.id}/cancel.json`,
        'POST',
        '/tmp/cancel_order.json'
      );

      if (cancelResult.order || cancelResult.notice) {
        console.log(`     CANCELLED successfully.`);
        cancelledCount++;

        // Add a note to the order
        await sleep(600); // rate limit
        const noteBody = { order: { id: order.id, note: CANCEL_NOTE } };
        writeFileSync('/tmp/order_note.json', JSON.stringify(noteBody));
        curlRequest(
          `${BASE_URL}/orders/${order.id}.json`,
          'PUT',
          '/tmp/order_note.json'
        );
      } else {
        console.log(`     FAILED to cancel:`, JSON.stringify(cancelResult));
        failedCount++;
      }

      await sleep(600); // rate limit between cancellations
    }
    console.log();
  }

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log('=== SUMMARY ===');
  console.log(`Orders under $${MINIMUM_AMOUNT.toFixed(2)}: ${underMinimum.length}`);
  if (EXECUTE) {
    console.log(`Cancelled: ${cancelledCount}`);
    if (failedCount > 0) console.log(`Failed: ${failedCount}`);
  } else {
    console.log('\nThis was a report only. To cancel these orders:');
    console.log('  node src/auto-cancel-under-minimum.js --execute');
  }

  console.log('\n=== COMPLETE ===');
}

main().catch(console.error);

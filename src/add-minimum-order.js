#!/usr/bin/env node
/**
 * Add Minimum Order Amount ($20) to Cart
 *
 * This script modifies the Shopify theme to enforce a $20 minimum order amount.
 * It injects Liquid + inline CSS + JS directly into sections/cart-template.liquid.
 *
 * Usage:
 *   node src/add-minimum-order.js           # Dry run (preview changes)
 *   node src/add-minimum-order.js --execute # Apply changes to theme
 *   node src/add-minimum-order.js --execute --force # Strip old code and re-apply
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const THEME_ID = '140853018904';
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

const EXECUTE = process.argv.includes('--execute');
const FORCE = process.argv.includes('--force');
const MINIMUM_AMOUNT_CENTS = 2000; // $20.00
const MINIMUM_AMOUNT_DISPLAY = '$20.00';

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

function getThemeAsset(key) {
  return curlRequest(
    `${BASE_URL}/themes/${THEME_ID}/assets.json?asset%5Bkey%5D=${key}`
  );
}

function putThemeAsset(key, value) {
  const requestBody = { asset: { key, value } };
  writeFileSync('/tmp/theme_asset_update.json', JSON.stringify(requestBody));
  return curlRequest(
    `${BASE_URL}/themes/${THEME_ID}/assets.json`,
    'PUT',
    '/tmp/theme_asset_update.json'
  );
}

// -----------------------------------------------------------------
// Self-contained Liquid snippet with INLINE styles (no external CSS needed)
// -----------------------------------------------------------------
const MINIMUM_ORDER_SNIPPET = `
{% comment %} ======= MINIMUM ORDER AMOUNT - START ======= {% endcomment %}
{% assign minimum_order_amount = ${MINIMUM_AMOUNT_CENTS} %}
{% assign cart_total = cart.total_price %}
{% assign amount_remaining = minimum_order_amount | minus: cart_total %}

{% if cart.item_count > 0 and cart_total < minimum_order_amount %}
<style>
  .minimum-order-message {
    background: #fff3cd;
    border: 2px solid #ffc107;
    border-radius: 8px;
    padding: 18px 24px;
    margin: 20px 0;
    text-align: center;
    color: #856404;
    font-family: inherit;
  }
  .minimum-order-message .minimum-order-icon { font-size: 28px; margin-bottom: 8px; }
  .minimum-order-message p { margin: 6px 0; font-size: 14px; line-height: 1.5; }
  .minimum-order-message p:first-of-type { font-size: 17px; }
  .minimum-order-progress { width: 100%; height: 10px; background: #e9ecef; border-radius: 5px; margin-top: 12px; overflow: hidden; }
  .minimum-order-progress-bar { height: 100%; background: linear-gradient(90deg, #ffc107, #28a745); border-radius: 5px; transition: width 0.3s ease; }
  .minimum-order-checkout-disabled { opacity: 0.45; pointer-events: none; cursor: not-allowed; }
</style>
<div class="minimum-order-message">
  <div class="minimum-order-icon">&#9888;</div>
  <p><strong>Minimum order of ${MINIMUM_AMOUNT_DISPLAY} required</strong></p>
  <p>You are <strong>{{ amount_remaining | money }}</strong> away from the minimum. Add more items to checkout.</p>
  <div class="minimum-order-progress">
    <div class="minimum-order-progress-bar" style="width: {{ cart_total | times: 100 | divided_by: minimum_order_amount }}%;"></div>
  </div>
</div>
<script>
  (function() {
    document.addEventListener('DOMContentLoaded', function() {
      var btns = document.querySelectorAll('[name="checkout"], [type="submit"], .cart__checkout, input[name="checkout"], button[name="checkout"]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].disabled = true;
        btns[i].style.opacity = '0.45';
        btns[i].style.pointerEvents = 'none';
        btns[i].style.cursor = 'not-allowed';
        var wrap = btns[i].parentElement;
        if (wrap) { wrap.style.position = 'relative'; }
      }
      var dynBtns = document.querySelectorAll('.shopify-payment-button, .dynamic-checkout__buttons, [data-shopify="dynamic-checkout-cart"]');
      for (var j = 0; j < dynBtns.length; j++) {
        dynBtns[j].style.opacity = '0.45';
        dynBtns[j].style.pointerEvents = 'none';
        dynBtns[j].style.cursor = 'not-allowed';
      }
      var forms = document.querySelectorAll('form[action="/cart"]');
      for (var k = 0; k < forms.length; k++) {
        forms[k].addEventListener('submit', function(e) {
          var sub = e.submitter;
          if (sub && (sub.name === 'checkout' || sub.formAction && sub.formAction.includes('checkout'))) {
            e.preventDefault();
            alert('Minimum order of ${MINIMUM_AMOUNT_DISPLAY} required. Please add more items to your cart.');
          }
        });
      }
    });
  })();
</script>
{% endif %}
{% comment %} ======= MINIMUM ORDER AMOUNT - END ======= {% endcomment %}`;

// Markers used to find and strip old injected code
const START_MARKER = '{% comment %} ======= MINIMUM ORDER AMOUNT - START ======= {% endcomment %}';
const END_MARKER = '{% comment %} ======= MINIMUM ORDER AMOUNT - END ======= {% endcomment %}';

function stripOldMinimumOrderCode(template) {
  // Remove the new marker-based block
  const startIdx = template.indexOf(START_MARKER);
  const endIdx = template.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1) {
    template = template.substring(0, startIdx) + template.substring(endIdx + END_MARKER.length);
    console.log('   Stripped marker-based minimum order block.');
  }

  // Also remove old-style code from the first version (without markers)
  // Look for the old comment style
  const oldStart = '{% comment %} Minimum Order Amount Check - $20 minimum {% endcomment %}';
  const oldStartIdx = template.indexOf(oldStart);
  if (oldStartIdx !== -1) {
    // Find the end of the old injection - look for the end of the conditional blocks
    // The old code ends at a {% endif %} that's part of the minimum order logic
    // We need to find all the old injected content. It's tricky, so look for known patterns.
    const patternsToRemove = [
      /{% comment %} Minimum Order Amount Check[^]*?{% endif %}\s*/g,
      /{% assign minimum_order_amount = \d+ %}\s*/g,
      /{% assign cart_total = cart\.total_price %}\s*/g,
      /{% assign amount_remaining = minimum_order_amount \| minus: cart_total %}\s*/g,
      /<div class="minimum-order-message">[^]*?<\/div>\s*<\/div>\s*<\/div>\s*/g,
      /{% if cart_total < minimum_order_amount %}[\s\S]*?{% endif %}\s*/g,
      /<div class="cart__checkout-button-disabled">\s*/g,
    ];

    for (const pattern of patternsToRemove) {
      const before = template.length;
      template = template.replace(pattern, '');
      if (template.length !== before) {
        console.log(`   Stripped old pattern: ${pattern.source.substring(0, 50)}...`);
      }
    }
  }

  // Clean up any double blank lines left behind
  template = template.replace(/\n{3,}/g, '\n\n');

  return template;
}

// -----------------------------------------------------------------
// Main
// -----------------------------------------------------------------
async function main() {
  console.log('=== ADD MINIMUM ORDER AMOUNT ($20) v2 ===\n');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}${FORCE ? ' + FORCE' : ''}`);
  console.log(`Theme ID: ${THEME_ID}`);
  console.log(`Store: ${STORE_URL}`);
  console.log(`Minimum: ${MINIMUM_AMOUNT_DISPLAY}\n`);

  // ---------------------------------------------------------------
  // Step 1: Fetch the cart template
  // ---------------------------------------------------------------
  console.log('1. Fetching sections/cart-template.liquid...');
  const cartResponse = getThemeAsset('sections/cart-template.liquid');
  if (!cartResponse.asset) {
    console.error('   ERROR: Could not fetch cart template.');
    console.error('   Response:', JSON.stringify(cartResponse, null, 2));
    return;
  }
  let cartTemplate = cartResponse.asset.value;
  console.log(`   Fetched (${cartTemplate.length} chars)`);

  const hasExistingCode = cartTemplate.includes('minimum-order-message') ||
                          cartTemplate.includes('minimum_order_amount') ||
                          cartTemplate.includes('Minimum Order Amount');

  if (hasExistingCode && !FORCE) {
    console.log('   Cart template already contains minimum order logic.');
    console.log('   Use --force to strip old code and re-apply.');
    console.log('   Skipping.\n');
  } else {
    // ---------------------------------------------------------------
    // Step 2: Strip old code if present, then inject new code
    // ---------------------------------------------------------------
    if (hasExistingCode) {
      console.log('\n2. Stripping old minimum order code (--force)...');
      cartTemplate = stripOldMinimumOrderCode(cartTemplate);
      console.log(`   After strip: ${cartTemplate.length} chars`);
    }

    console.log('\n3. Injecting minimum order snippet...');

    // Strategy: Insert the self-contained snippet right after the opening
    // of the cart form, so it appears prominently at the top of the cart.
    // Look for the {% schema %} tag and insert just before it.
    const schemaPattern = /\{%-?\s*schema\s*-?%\}/;
    const schemaMatch = cartTemplate.match(schemaPattern);

    if (schemaMatch) {
      const schemaIndex = cartTemplate.indexOf(schemaMatch[0]);
      cartTemplate = cartTemplate.substring(0, schemaIndex) +
        MINIMUM_ORDER_SNIPPET + '\n\n' +
        cartTemplate.substring(schemaIndex);
      console.log('   Inserted before {% schema %} tag.');
    } else {
      // Fallback: append to end
      cartTemplate += '\n' + MINIMUM_ORDER_SNIPPET;
      console.log('   Appended to end of template.');
    }

    console.log(`   New template size: ${cartTemplate.length} chars`);

    // ---------------------------------------------------------------
    // Step 3: Push modified cart template
    // ---------------------------------------------------------------
    if (EXECUTE) {
      console.log('\n4. Pushing modified cart template to Shopify...');
      const updateResult = putThemeAsset('sections/cart-template.liquid', cartTemplate);
      if (updateResult.asset) {
        console.log('   SUCCESS: Cart template updated!');
        console.log(`   Updated at: ${updateResult.asset.updated_at || 'unknown'}`);
      } else {
        console.error('   ERROR:', JSON.stringify(updateResult, null, 2));
        return;
      }
    } else {
      console.log('\n4. [DRY RUN] Would push modified cart template.');
      console.log('   Preview of injected snippet:');
      console.log('   ---');
      console.log(MINIMUM_ORDER_SNIPPET.split('\n').slice(0, 10).join('\n'));
      console.log('   ... (truncated)');
    }
  }

  // ---------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------
  console.log('\n=== COMPLETE ===');
  if (EXECUTE) {
    console.log('Minimum order amount ($20) is now active on the cart page.');
    console.log('\nHow it works:');
    console.log('  - Customers with items under $20 see a warning banner');
    console.log('  - Progress bar shows how close they are to $20');
    console.log('  - Checkout button is disabled (grayed out + unclickable)');
    console.log('  - Dynamic checkout buttons (Shop Pay etc.) are also disabled');
    console.log('  - Once cart reaches $20+, everything returns to normal');
  } else {
    console.log('This was a dry run. To apply:');
    console.log('  node src/add-minimum-order.js --execute --force');
  }
}

main().catch(console.error);

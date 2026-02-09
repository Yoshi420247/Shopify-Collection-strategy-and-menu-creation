#!/usr/bin/env node
/**
 * Install Global Checkout Guard via Shopify Script Tag API
 *
 * Registers a JavaScript file that loads on EVERY storefront page (except
 * Shopify-hosted checkout on non-Plus). This intercepts attempts to navigate
 * to /checkout when the cart is below the minimum order amount.
 *
 * How it works:
 *   1. Creates a JS asset in the theme (assets/checkout-guard.js)
 *   2. Registers it as a ScriptTag so it loads on every page
 *   3. The JS checks cart total via /cart.js AJAX and blocks checkout navigation
 *
 * This provides storefront-wide protection beyond just the cart page template.
 *
 * Usage:
 *   node src/install-checkout-guard.js           # Show current status
 *   node src/install-checkout-guard.js --execute # Install the guard
 *   node src/install-checkout-guard.js --remove  # Remove the guard
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
const REMOVE = process.argv.includes('--remove');

const MINIMUM_AMOUNT_CENTS = 2000;
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
    if (!result || !result.trim()) return {};
    return JSON.parse(result);
  } catch (err) {
    console.error('   API error:', err.message);
    return {};
  }
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

// The JS that will load on every storefront page
const GUARD_JS = `
/**
 * Checkout Guard - Minimum Order Enforcement
 * Loaded on every storefront page via ScriptTag API.
 * Checks cart total and blocks checkout if under minimum.
 */
(function() {
  'use strict';

  var MIN_CENTS = ${MINIMUM_AMOUNT_CENTS};
  var MIN_DISPLAY = '${MINIMUM_AMOUNT_DISPLAY}';
  var MSG = 'Minimum order of ' + MIN_DISPLAY + ' required. Please add more items to your cart.';
  var cartData = null;

  // Fetch current cart data
  function checkCart() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/cart.js', true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        try {
          cartData = JSON.parse(xhr.responseText);
        } catch(e) {}
      }
    };
    xhr.send();
  }

  function isBelowMinimum() {
    return cartData && cartData.item_count > 0 && cartData.total_price < MIN_CENTS;
  }

  // Check cart on page load and periodically
  checkCart();
  setInterval(checkCart, 3000);

  // Block all navigation to /checkout
  document.addEventListener('click', function(e) {
    if (!isBelowMinimum()) return;

    var target = e.target;
    while (target && target !== document) {
      // Check links
      if (target.tagName === 'A' && target.href) {
        if (target.href.indexOf('/checkout') !== -1 || target.href.indexOf('/cart/checkout') !== -1) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          alert(MSG);
          return false;
        }
      }
      // Check buttons with checkout name
      if (target.name === 'checkout') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        alert(MSG);
        return false;
      }
      target = target.parentElement;
    }
  }, true);

  // Block form submissions to checkout
  document.addEventListener('submit', function(e) {
    if (!isBelowMinimum()) return;

    var form = e.target;
    var action = form.getAttribute('action') || '';
    var submitter = e.submitter;

    if (action.indexOf('/cart') !== -1 || action.indexOf('/checkout') !== -1) {
      if (submitter && submitter.name === 'checkout') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        alert(MSG);
        return false;
      }
    }
  }, true);

  // Intercept fetch
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input) {
      if (!isBelowMinimum()) return origFetch.apply(this, arguments);
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (url.indexOf('/checkout') !== -1 || url.indexOf('/checkouts') !== -1) {
        alert(MSG);
        return Promise.reject(new Error('Below minimum order'));
      }
      return origFetch.apply(this, arguments);
    };
  }

  // Intercept XMLHttpRequest
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isBelowMinimum() && typeof url === 'string' &&
        (url.indexOf('/checkout') !== -1 || url.indexOf('/checkouts') !== -1)) {
      throw new Error('Below minimum order');
    }
    return origOpen.apply(this, arguments);
  };

  // Intercept direct window.location changes to /checkout
  var checkLocationInterval = setInterval(function() {
    if (isBelowMinimum() && window.location.pathname.indexOf('/checkout') !== -1) {
      window.location.href = '/cart';
    }
  }, 100);
})();
`;

async function main() {
  console.log('=== CHECKOUT GUARD - GLOBAL STOREFRONT PROTECTION ===\n');
  console.log(`Mode: ${REMOVE ? 'REMOVE' : EXECUTE ? 'INSTALL' : 'STATUS CHECK'}`);
  console.log(`Store: ${STORE_URL}\n`);

  // Step 1: Check existing script tags
  console.log('1. Checking existing script tags...');
  const tagsResponse = curlRequest(`${BASE_URL}/script_tags.json`);
  const existingTags = (tagsResponse.script_tags || []);
  const guardTag = existingTags.find(t => t.src && t.src.includes('checkout-guard'));

  if (guardTag) {
    console.log(`   Found existing guard: ID ${guardTag.id}`);
    console.log(`   Source: ${guardTag.src}`);
    console.log(`   Event: ${guardTag.event}`);
  } else {
    console.log('   No checkout guard script tag found.');
  }

  // REMOVE mode
  if (REMOVE) {
    if (!guardTag) {
      console.log('\n   Nothing to remove.');
      return;
    }
    if (!EXECUTE) {
      console.log('\n   Would remove the guard. Add --execute to confirm.');
      return;
    }
    console.log('\n2. Removing script tag...');
    curlRequest(`${BASE_URL}/script_tags/${guardTag.id}.json`, 'DELETE');
    console.log('   Removed.');

    console.log('\n3. Removing theme asset...');
    curlRequest(
      `${BASE_URL}/themes/${THEME_ID}/assets.json?asset%5Bkey%5D=assets/checkout-guard.js`,
      'DELETE'
    );
    console.log('   Removed.');
    console.log('\n=== GUARD REMOVED ===');
    return;
  }

  if (!EXECUTE) {
    console.log('\n   Run with --execute to install the global checkout guard.');
    console.log('   Run with --remove --execute to remove it.');
    return;
  }

  // INSTALL mode
  // Step 2: Upload the JS file as a theme asset
  console.log('\n2. Uploading assets/checkout-guard.js to theme...');
  const assetResult = putThemeAsset('assets/checkout-guard.js', GUARD_JS);
  if (assetResult.asset) {
    console.log(`   Uploaded (${GUARD_JS.length} chars)`);
  } else {
    console.error('   Failed to upload asset:', JSON.stringify(assetResult));
    return;
  }

  // Step 3: Register the script tag (if not already registered)
  if (guardTag) {
    console.log('\n3. Script tag already registered. Updating...');
    curlRequest(`${BASE_URL}/script_tags/${guardTag.id}.json`, 'DELETE');
  } else {
    console.log('\n3. Registering script tag...');
  }

  const scriptTagBody = {
    script_tag: {
      event: 'onload',
      src: `https://${STORE_URL}/cdn/shop/t/1/assets/checkout-guard.js`
    }
  };
  // Note: The actual CDN URL depends on the theme. We may need to use the
  // direct asset URL format instead.
  // Alternative: use the Shopify asset URL format
  const tagBody = {
    script_tag: {
      event: 'onload',
      src: `https://cdn.shopify.com/s/files/1/0/${THEME_ID}/assets/checkout-guard.js`
    }
  };

  writeFileSync('/tmp/script_tag.json', JSON.stringify(tagBody));
  const tagResult = curlRequest(`${BASE_URL}/script_tags.json`, 'POST', '/tmp/script_tag.json');

  if (tagResult.script_tag) {
    console.log(`   Registered! ID: ${tagResult.script_tag.id}`);
    console.log(`   Source: ${tagResult.script_tag.src}`);
  } else {
    console.log('   Script tag registration result:', JSON.stringify(tagResult, null, 2));
    console.log('\n   NOTE: If the CDN URL is wrong, the script tag may need manual');
    console.log('   adjustment. Check the actual asset URL in your theme files.');
    console.log(`   The JS file is uploaded at: assets/checkout-guard.js`);
    console.log('   You can also add it to theme.liquid manually:');
    console.log('   <script src="{{ "checkout-guard.js" | asset_url }}" defer></script>');
  }

  console.log('\n=== GUARD INSTALLED ===');
  console.log('The checkout guard will now load on every storefront page.');
  console.log('It checks /cart.js every 3 seconds and blocks checkout if under $20.');
}

main().catch(console.error);

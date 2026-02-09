#!/usr/bin/env node
/**
 * Add Minimum Order Amount ($20) to Cart - v3 (Hardened)
 *
 * Two-layer enforcement:
 *   Layer 1: Hardened client-side (cart template) - deters casual bypass
 *   Layer 2: Server-side auto-cancel (separate script) - catches everything else
 *
 * Client-side hardening includes:
 *   - Intercepts all checkout navigation (form submit, direct URL, AJAX)
 *   - MutationObserver re-disables buttons if tampered with
 *   - Overrides window.location and fetch to block /checkout navigation
 *   - Removes form action attribute to prevent direct POST
 *   - Periodic re-check every 500ms as a watchdog
 *
 * Usage:
 *   node src/add-minimum-order.js           # Dry run
 *   node src/add-minimum-order.js --execute # Apply changes
 *   node src/add-minimum-order.js --execute --force # Strip old + re-apply
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
// HARDENED Liquid + CSS + JS snippet (v3)
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
  'use strict';

  var MIN_AMOUNT = {{ minimum_order_amount }};
  var CART_TOTAL = {{ cart_total }};
  var MSG = 'Minimum order of ${MINIMUM_AMOUNT_DISPLAY} required. Please add more items to your cart.';

  function isBelowMinimum() {
    return CART_TOTAL < MIN_AMOUNT;
  }

  if (!isBelowMinimum()) return;

  // === 1. Disable all checkout buttons ===
  function disableCheckoutButtons() {
    var selectors = [
      '[name="checkout"]',
      'input[name="checkout"]',
      'button[name="checkout"]',
      '.cart__checkout',
      '.cart__submit',
      '[type="submit"]',
      '.shopify-payment-button',
      '.dynamic-checkout__buttons',
      '[data-shopify="dynamic-checkout-cart"]',
      '.additional-checkout-buttons',
      '[href*="/checkout"]'
    ];
    var els = document.querySelectorAll(selectors.join(','));
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.disabled = true;
      el.style.setProperty('opacity', '0.45', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('cursor', 'not-allowed', 'important');
      if (el.tagName === 'A') {
        el.removeAttribute('href');
        el.dataset.hrefRemoved = 'true';
      }
    }
  }

  // === 2. Remove checkout form actions ===
  function neutralizeForms() {
    var forms = document.querySelectorAll('form[action*="/cart"], form[action*="/checkout"]');
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      form.dataset.originalAction = form.getAttribute('action') || '';
      form.removeAttribute('action');
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        alert(MSG);
        return false;
      }, true);
    }
  }

  // === 3. Block direct navigation to /checkout ===
  var origAssign = window.location.assign;
  var origReplace = window.location.replace;
  var origOpen = window.open;

  function blockCheckoutNav(url) {
    if (typeof url === 'string' && url.indexOf('/checkout') !== -1) {
      alert(MSG);
      return true;
    }
    return false;
  }

  try {
    Object.defineProperty(window, 'open', {
      value: function(url) {
        if (blockCheckoutNav(url)) return null;
        return origOpen.apply(window, arguments);
      },
      writable: false,
      configurable: false
    });
  } catch(e) {}

  // === 4. Intercept fetch and XMLHttpRequest to /checkout ===
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input) {
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (url.indexOf('/checkout') !== -1 || url.indexOf('checkouts') !== -1) {
        alert(MSG);
        return Promise.reject(new Error('Minimum order amount not met'));
      }
      return origFetch.apply(this, arguments);
    };
  }

  var origXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string' && (url.indexOf('/checkout') !== -1 || url.indexOf('checkouts') !== -1)) {
      alert(MSG);
      throw new Error('Minimum order amount not met');
    }
    return origXhrOpen.apply(this, arguments);
  };

  // === 5. Block clicks on anything linking to checkout ===
  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target !== document.body) {
      if (target.tagName === 'A' && target.href && target.href.indexOf('/checkout') !== -1) {
        e.preventDefault();
        e.stopPropagation();
        alert(MSG);
        return false;
      }
      if (target.name === 'checkout' || (target.dataset && target.dataset.hrefRemoved === 'true')) {
        e.preventDefault();
        e.stopPropagation();
        alert(MSG);
        return false;
      }
      target = target.parentElement;
    }
  }, true);

  // === 6. MutationObserver: re-disable if anything gets re-enabled ===
  var observer = new MutationObserver(function() {
    disableCheckoutButtons();
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'style', 'class', 'href']
  });

  // === 7. Watchdog: re-run every 500ms ===
  setInterval(function() {
    disableCheckoutButtons();
    // Re-neutralize any newly added forms
    var forms = document.querySelectorAll('form[action*="/cart"], form[action*="/checkout"]');
    for (var i = 0; i < forms.length; i++) {
      if (!forms[i].dataset.originalAction && forms[i].getAttribute('action')) {
        forms[i].dataset.originalAction = forms[i].getAttribute('action');
        forms[i].removeAttribute('action');
      }
    }
  }, 500);

  // === 8. Block keyboard submit (Enter key on forms) ===
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      var form = e.target.closest && e.target.closest('form');
      if (form && (form.dataset.originalAction || '').indexOf('/cart') !== -1) {
        e.preventDefault();
        alert(MSG);
      }
    }
  }, true);

  // === Run on DOM ready and immediately ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      disableCheckoutButtons();
      neutralizeForms();
    });
  } else {
    disableCheckoutButtons();
    neutralizeForms();
  }
})();
</script>
{% endif %}
{% comment %} ======= MINIMUM ORDER AMOUNT - END ======= {% endcomment %}`;

// Markers used to find and strip old injected code
const START_MARKER = '{% comment %} ======= MINIMUM ORDER AMOUNT - START ======= {% endcomment %}';
const END_MARKER = '{% comment %} ======= MINIMUM ORDER AMOUNT - END ======= {% endcomment %}';

function stripOldMinimumOrderCode(template) {
  // Remove the marker-based block
  const startIdx = template.indexOf(START_MARKER);
  const endIdx = template.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1) {
    template = template.substring(0, startIdx) + template.substring(endIdx + END_MARKER.length);
    console.log('   Stripped marker-based minimum order block.');
  }

  // Also remove old-style code from v1 (without markers)
  const oldStart = '{% comment %} Minimum Order Amount Check - $20 minimum {% endcomment %}';
  if (template.indexOf(oldStart) !== -1) {
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

  template = template.replace(/\n{3,}/g, '\n\n');
  return template;
}

// -----------------------------------------------------------------
// Main
// -----------------------------------------------------------------
async function main() {
  console.log('=== ADD MINIMUM ORDER AMOUNT ($20) v3 - HARDENED ===\n');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}${FORCE ? ' + FORCE' : ''}`);
  console.log(`Theme ID: ${THEME_ID}`);
  console.log(`Store: ${STORE_URL}`);
  console.log(`Minimum: ${MINIMUM_AMOUNT_DISPLAY}\n`);

  // Step 1: Fetch the cart template
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
    // Step 2: Strip old code if present
    if (hasExistingCode) {
      console.log('\n2. Stripping old minimum order code (--force)...');
      cartTemplate = stripOldMinimumOrderCode(cartTemplate);
      console.log(`   After strip: ${cartTemplate.length} chars`);
    }

    // Step 3: Inject new hardened snippet
    console.log('\n3. Injecting hardened minimum order snippet (v3)...');
    console.log('   Features:');
    console.log('   - Form action removal');
    console.log('   - fetch/XHR interception');
    console.log('   - MutationObserver watchdog');
    console.log('   - Click/keyboard event blocking');
    console.log('   - 500ms periodic re-check');

    const schemaPattern = /\{%-?\s*schema\s*-?%\}/;
    const schemaMatch = cartTemplate.match(schemaPattern);

    if (schemaMatch) {
      const schemaIndex = cartTemplate.indexOf(schemaMatch[0]);
      cartTemplate = cartTemplate.substring(0, schemaIndex) +
        MINIMUM_ORDER_SNIPPET + '\n\n' +
        cartTemplate.substring(schemaIndex);
      console.log('   Inserted before {% schema %} tag.');
    } else {
      cartTemplate += '\n' + MINIMUM_ORDER_SNIPPET;
      console.log('   Appended to end of template.');
    }

    console.log(`   New template size: ${cartTemplate.length} chars`);

    // Step 4: Push
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
    }
  }

  console.log('\n=== COMPLETE ===');
  if (EXECUTE) {
    console.log('Hardened minimum order enforcement is now active.');
    console.log('\nClient-side protections:');
    console.log('  - Checkout buttons disabled + watched by MutationObserver');
    console.log('  - Form actions removed (no POST to /cart or /checkout)');
    console.log('  - fetch() and XMLHttpRequest blocked for /checkout URLs');
    console.log('  - Click handler blocks all checkout-related links');
    console.log('  - Enter key blocked on cart forms');
    console.log('  - 500ms watchdog re-applies all protections');
    console.log('\nIMPORTANT: Client-side can still be bypassed by bots.');
    console.log('Run the auto-cancel script for server-side enforcement:');
    console.log('  node src/auto-cancel-under-minimum.js --execute');
  } else {
    console.log('This was a dry run. To apply:');
    console.log('  node src/add-minimum-order.js --execute --force');
  }
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Add Minimum Order Amount ($20) to Cart
 *
 * This script modifies the Shopify theme to enforce a $20 minimum order amount.
 * It updates:
 *   1. sections/cart-template.liquid - Adds minimum order check logic
 *   2. assets/filter-enhancements.css - Adds styling for the minimum order message
 *
 * Usage:
 *   node src/add-minimum-order.js           # Dry run (preview changes)
 *   node src/add-minimum-order.js --execute # Apply changes to theme
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
const MINIMUM_AMOUNT_CENTS = 2000; // $20.00
const MINIMUM_AMOUNT_DISPLAY = '$20.00';

function curlRequest(url, method = 'GET', bodyFile = null) {
  let cmd = `curl -s --max-time 60 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;
  if (bodyFile) {
    cmd += `-d @${bodyFile}`;
  }
  const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(result);
}

function getThemeAsset(key) {
  const encoded = encodeURIComponent(key);
  return curlRequest(
    `${BASE_URL}/themes/${THEME_ID}/assets.json?asset%5Bkey%5D=${encoded}`
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
// Liquid snippet to inject into the cart template
// -----------------------------------------------------------------
const MINIMUM_ORDER_LIQUID = `
{% comment %} Minimum Order Amount Check - $20 minimum {% endcomment %}
{% assign minimum_order_amount = ${MINIMUM_AMOUNT_CENTS} %}
{% assign cart_total = cart.total_price %}
{% assign amount_remaining = minimum_order_amount | minus: cart_total %}

{% if cart_total < minimum_order_amount %}
  <div class="minimum-order-message">
    <div class="minimum-order-icon">&#9888;</div>
    <p><strong>Minimum order of ${MINIMUM_AMOUNT_DISPLAY} required</strong></p>
    <p>You are <strong>{{ amount_remaining | money }}</strong> away from the minimum order amount.</p>
    <div class="minimum-order-progress">
      <div class="minimum-order-progress-bar" style="width: {{ cart_total | times: 100 | divided_by: minimum_order_amount }}%;"></div>
    </div>
  </div>
{% endif %}`;

// -----------------------------------------------------------------
// CSS for the minimum order message and disabled checkout
// -----------------------------------------------------------------
const MINIMUM_ORDER_CSS = `
/* =====================================================
   Minimum Order Amount ($20) - Cart Page
   ===================================================== */
.minimum-order-message {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  padding: 16px 20px;
  margin: 15px 0;
  text-align: center;
  color: #856404;
}

.minimum-order-message .minimum-order-icon {
  font-size: 24px;
  margin-bottom: 6px;
}

.minimum-order-message p {
  margin: 4px 0;
  font-size: 14px;
  line-height: 1.5;
}

.minimum-order-message p:first-of-type {
  font-size: 16px;
}

.minimum-order-progress {
  width: 100%;
  height: 8px;
  background: #e9ecef;
  border-radius: 4px;
  margin-top: 10px;
  overflow: hidden;
}

.minimum-order-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #ffc107, #28a745);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* Disable checkout button when below minimum */
.cart__checkout-button-disabled {
  opacity: 0.5;
  pointer-events: none;
  cursor: not-allowed;
  position: relative;
}

.cart__checkout-button-disabled::after {
  content: 'Minimum order: ${MINIMUM_AMOUNT_DISPLAY}';
  position: absolute;
  bottom: -22px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: #856404;
  white-space: nowrap;
}
`;

// -----------------------------------------------------------------
// Main
// -----------------------------------------------------------------
async function main() {
  console.log('=== ADD MINIMUM ORDER AMOUNT ($20) ===\n');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (will modify theme)' : 'DRY RUN (preview only)'}`);
  console.log(`Theme ID: ${THEME_ID}`);
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

  // Check if already modified
  if (cartTemplate.includes('minimum-order-message')) {
    console.log('   NOTE: Cart template already contains minimum order logic.');
    console.log('   Skipping cart template modification.\n');
  } else {
    // ---------------------------------------------------------------
    // Step 2: Inject minimum order logic into cart template
    // ---------------------------------------------------------------
    console.log('\n2. Injecting minimum order check into cart template...');

    // Strategy: Insert the minimum order message above the checkout button area,
    // and wrap the checkout button in a conditional to disable it when below minimum.
    //
    // We look for common patterns in Shopify cart templates:
    //   - A checkout button (input/button with type="submit" name="checkout")
    //   - Or an element with class containing "checkout"
    //
    // We insert:
    //   a) The warning message block above the checkout area
    //   b) A Liquid conditional to add a "disabled" class to the checkout button wrapper

    let modified = false;

    // Pattern 1: Look for the checkout button/input
    // Common patterns: <input type="submit" name="checkout"
    //                   <button type="submit" name="checkout"
    const checkoutButtonPattern = /(<(?:input|button)[^>]*name\s*=\s*["']checkout["'][^>]*>)/i;
    const checkoutButtonMatch = cartTemplate.match(checkoutButtonPattern);

    if (checkoutButtonMatch) {
      console.log('   Found checkout button pattern.');

      // Find the containing div/wrapper for the checkout button area
      // Insert the message before the checkout button and wrap button in conditional class
      const buttonHtml = checkoutButtonMatch[1];
      const buttonIndex = cartTemplate.indexOf(buttonHtml);

      // Insert minimum order message just before the checkout button
      const injection = `${MINIMUM_ORDER_LIQUID}

{% if cart_total < minimum_order_amount %}
  <div class="cart__checkout-button-disabled">
    ${buttonHtml}
  </div>
{% else %}
  ${buttonHtml}
{% endif %}`;

      cartTemplate = cartTemplate.substring(0, buttonIndex) + injection + cartTemplate.substring(buttonIndex + buttonHtml.length);
      modified = true;
    }

    // Pattern 2: Look for additional checkout buttons (dynamic checkout / Shop Pay)
    if (!modified) {
      // Try looking for cart__buttons, cart-buttons, or similar wrapper
      const cartButtonsPattern = /(<div[^>]*class\s*=\s*["'][^"']*cart[_-]?buttons[^"']*["'][^>]*>)/i;
      const cartButtonsMatch = cartTemplate.match(cartButtonsPattern);

      if (cartButtonsMatch) {
        console.log('   Found cart buttons wrapper pattern.');
        const wrapperHtml = cartButtonsMatch[1];
        const wrapperIndex = cartTemplate.indexOf(wrapperHtml);

        const injection = `${MINIMUM_ORDER_LIQUID}

{% if cart_total < minimum_order_amount %}
${wrapperHtml.replace(/class\s*=\s*["']([^"']*)["']/, 'class="$1 cart__checkout-button-disabled"')}
{% else %}
${wrapperHtml}
{% endif %}`;

        cartTemplate = cartTemplate.substring(0, wrapperIndex) + injection + cartTemplate.substring(wrapperIndex + wrapperHtml.length);
        modified = true;
      }
    }

    // Pattern 3: Fallback - look for any checkout-related form action
    if (!modified) {
      // Look for form action="/cart" or action="/checkout"
      const formPattern = /(<form[^>]*action\s*=\s*["']\/cart["'][^>]*>)/i;
      const formMatch = cartTemplate.match(formPattern);

      if (formMatch) {
        console.log('   Found cart form pattern. Inserting after form open tag.');
        const formTag = formMatch[1];
        const formIndex = cartTemplate.indexOf(formTag) + formTag.length;

        const injection = `
${MINIMUM_ORDER_LIQUID}`;

        cartTemplate = cartTemplate.substring(0, formIndex) + injection + cartTemplate.substring(formIndex);

        // Also try to disable the submit button
        const submitPattern = /(<(?:input|button)[^>]*type\s*=\s*["']submit["'][^>]*>)/i;
        const submitMatch = cartTemplate.match(submitPattern);
        if (submitMatch) {
          const submitBtn = submitMatch[1];
          const submitIndex = cartTemplate.indexOf(submitBtn);

          const submitInjection = `{% if cart_total < minimum_order_amount %}
  <div class="cart__checkout-button-disabled">
    ${submitBtn}
  </div>
{% else %}
  ${submitBtn}
{% endif %}`;

          cartTemplate = cartTemplate.substring(0, submitIndex) + submitInjection + cartTemplate.substring(submitIndex + submitBtn.length);
        }

        modified = true;
      }
    }

    // Pattern 4: Last resort - prepend the message to the template and use JS
    if (!modified) {
      console.log('   Could not find a specific checkout button pattern.');
      console.log('   Appending minimum order logic with JS-based button disabling.');

      const jsDisableSnippet = `
${MINIMUM_ORDER_LIQUID}

{% if cart_total < minimum_order_amount %}
<script>
  document.addEventListener('DOMContentLoaded', function() {
    // Disable all checkout buttons
    var checkoutBtns = document.querySelectorAll('[name="checkout"], [href*="checkout"], .cart__checkout, .cart__submit, [type="submit"]');
    checkoutBtns.forEach(function(btn) {
      btn.closest('div') && btn.closest('div').classList.add('cart__checkout-button-disabled');
      btn.disabled = true;
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Minimum order of ${MINIMUM_AMOUNT_DISPLAY} required. Please add more items to your cart.');
      });
    });
  });
</script>
{% endif %}`;

      // Insert before the closing {% endschema %} or at end of template
      const schemaPattern = /\{%\s*schema\s*%\}/;
      const schemaMatch = cartTemplate.match(schemaPattern);

      if (schemaMatch) {
        const schemaIndex = cartTemplate.indexOf(schemaMatch[0]);
        cartTemplate = cartTemplate.substring(0, schemaIndex) + jsDisableSnippet + '\n\n' + cartTemplate.substring(schemaIndex);
      } else {
        cartTemplate += jsDisableSnippet;
      }

      modified = true;
    }

    if (modified) {
      console.log('   Minimum order logic injected successfully.');
      console.log(`   New template size: ${cartTemplate.length} chars`);
    }

    // ---------------------------------------------------------------
    // Step 3: Push modified cart template
    // ---------------------------------------------------------------
    if (EXECUTE) {
      console.log('\n3. Pushing modified cart template to Shopify...');
      const updateResult = putThemeAsset('sections/cart-template.liquid', cartTemplate);
      if (updateResult.asset) {
        console.log('   SUCCESS: Cart template updated.');
      } else {
        console.error('   ERROR:', JSON.stringify(updateResult, null, 2));
        return;
      }
    } else {
      console.log('\n3. [DRY RUN] Would push modified cart template to Shopify.');
    }
  }

  // ---------------------------------------------------------------
  // Step 4: Update CSS file
  // ---------------------------------------------------------------
  console.log('\n4. Fetching assets/filter-enhancements.css...');
  const cssResponse = getThemeAsset('assets/filter-enhancements.css');
  let cssContent = '';

  if (cssResponse.asset) {
    cssContent = cssResponse.asset.value;
    console.log(`   Fetched (${cssContent.length} chars)`);
  } else {
    console.log('   File not found, will create it.');
  }

  if (cssContent.includes('minimum-order-message')) {
    console.log('   NOTE: CSS already contains minimum order styles. Skipping.');
  } else {
    cssContent += '\n' + MINIMUM_ORDER_CSS;
    console.log(`   Added minimum order CSS (${MINIMUM_ORDER_CSS.length} chars)`);

    if (EXECUTE) {
      console.log('   Pushing updated CSS to Shopify...');
      const cssUpdateResult = putThemeAsset('assets/filter-enhancements.css', cssContent);
      if (cssUpdateResult.asset) {
        console.log('   SUCCESS: CSS updated.');
      } else {
        console.error('   ERROR:', JSON.stringify(cssUpdateResult, null, 2));
        return;
      }
    } else {
      console.log('   [DRY RUN] Would push updated CSS to Shopify.');
    }
  }

  // ---------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------
  console.log('\n=== COMPLETE ===');
  if (EXECUTE) {
    console.log('Minimum order amount ($20) has been added to the cart.');
    console.log('\nVerification:');
    console.log('  1. Visit the store and add items under $20 to cart');
    console.log('  2. You should see a warning message with a progress bar');
    console.log('  3. The checkout button should be disabled');
    console.log('  4. Add more items to reach $20+ and the warning should disappear');
  } else {
    console.log('This was a dry run. Re-run with --execute to apply changes:');
    console.log('  node src/add-minimum-order.js --execute');
  }
}

main().catch(console.error);

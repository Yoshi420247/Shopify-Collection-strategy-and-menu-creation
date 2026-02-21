#!/usr/bin/env node
// ============================================================================
// Shopify Flow Setup & Validation for Cart Recovery
// Oil Slick Pad (oilslickpad.com)
//
// This script:
//   1. Registers the required customer metafield definitions via GraphQL
//   2. Validates that the metafields are accessible
//   3. Prints step-by-step Shopify Flow setup instructions
//
// The email templates are in theme-files/notifications/cart-recovery-email-{1-5}.liquid
// Copy their content into Shopify Email templates, then wire them to the Flows below.
//
// Usage:
//   node src/setup-cart-recovery-flows.js              # Validate + print instructions
//   node src/setup-cart-recovery-flows.js --create     # Create metafield definitions
// ============================================================================

import { config } from './config.js';
import * as shopifyApi from './shopify-api.js';

const CREATE_MODE = process.argv.includes('--create');

// ============================================================================
// METAFIELD DEFINITIONS
// These must exist for Shopify Email templates to read customer metafields
// ============================================================================

const METAFIELD_DEFINITIONS = [
  {
    namespace: 'cart_recovery',
    key: 'sequence_stage',
    name: 'Recovery Sequence Stage',
    description: 'Which email in the 1-5 recovery sequence (set by cart recovery engine)',
    type: 'number_integer',
  },
  {
    namespace: 'cart_recovery',
    key: 'email_subject',
    name: 'Recovery Email Subject',
    description: 'Pre-generated subject line for the recovery email',
    type: 'single_line_text_field',
  },
  {
    namespace: 'cart_recovery',
    key: 'cart_url',
    name: 'Cart Recovery URL',
    description: 'Link back to the abandoned cart (with discount code pre-applied if any)',
    type: 'url',
  },
  {
    namespace: 'cart_recovery',
    key: 'discount_code',
    name: 'Recovery Discount Code',
    description: 'Active discount code for this recovery attempt',
    type: 'single_line_text_field',
  },
  {
    namespace: 'cart_recovery',
    key: 'discount_percent',
    name: 'Recovery Discount Percent',
    description: 'Discount percentage (0 if no discount)',
    type: 'number_integer',
  },
  {
    namespace: 'cart_recovery',
    key: 'cart_value',
    name: 'Abandoned Cart Value',
    description: 'Total value of the abandoned cart',
    type: 'number_decimal',
  },
  {
    namespace: 'cart_recovery',
    key: 'cart_category',
    name: 'Cart Product Category',
    description: 'Dominant product category: oilSlick, smokeshop, or unknown',
    type: 'single_line_text_field',
  },
  {
    namespace: 'cart_recovery',
    key: 'email_body_html',
    name: 'Recovery Email Body HTML',
    description: 'Pre-rendered email body HTML (for logging/debugging)',
    type: 'multi_line_text_field',
  },
  {
    namespace: 'cart_recovery',
    key: 'updated_at',
    name: 'Recovery Last Updated',
    description: 'When the recovery data was last updated by the engine',
    type: 'date_time',
  },
];

// ============================================================================
// FLOW CONFIGURATIONS
// Each flow corresponds to one email in the recovery sequence
// ============================================================================

const FLOW_CONFIGS = [
  {
    name: 'Cart Recovery - Email 1: Gentle Reminder (1hr)',
    trigger: 'Customer tags added',
    condition: 'Customer tag contains "cart-recovery:email-1"',
    action: 'Send marketing email → "Cart Recovery Email 1"',
    template: 'cart-recovery-email-1.liquid',
    timing: '1 hour after abandonment',
    notes: 'No discount. Friendly reminder with trust badges.',
  },
  {
    name: 'Cart Recovery - Email 2: Trust Builder (24hr)',
    trigger: 'Customer tags added',
    condition: 'Customer tag contains "cart-recovery:email-2"',
    action: 'Send marketing email → "Cart Recovery Email 2"',
    template: 'cart-recovery-email-2.liquid',
    timing: '24 hours after abandonment',
    notes: 'Social proof block, category-aware value propositions.',
  },
  {
    name: 'Cart Recovery - Email 3: Light Incentive (48hr)',
    trigger: 'Customer tags added',
    condition: 'Customer tag contains "cart-recovery:email-3"',
    action: 'Send marketing email → "Cart Recovery Email 3"',
    template: 'cart-recovery-email-3.liquid',
    timing: '48 hours after abandonment',
    notes: 'First discount: Oil Slick 5%, Smokeshop 10%. 48hr expiry.',
  },
  {
    name: 'Cart Recovery - Email 4: Strong Incentive (72hr)',
    trigger: 'Customer tags added',
    condition: 'Customer tag contains "cart-recovery:email-4"',
    action: 'Send marketing email → "Cart Recovery Email 4"',
    template: 'cart-recovery-email-4.liquid',
    timing: '72 hours after abandonment',
    notes: 'Bigger discount: Oil Slick 8%, Smokeshop 25%. Cross-sells. 24hr expiry.',
  },
  {
    name: 'Cart Recovery - Email 5: Final Push (7 days)',
    trigger: 'Customer tags added',
    condition: 'Customer tag contains "cart-recovery:email-5"',
    action: 'Send marketing email → "Cart Recovery Email 5"',
    template: 'cart-recovery-email-5.liquid',
    timing: '7 days after abandonment',
    notes: 'Max discount: Oil Slick 10%, Smokeshop 40%. Alternatives + feedback. Last email.',
  },
  {
    name: 'Cart Recovery - Cleanup on Purchase',
    trigger: 'Order created',
    condition: 'Customer tag contains "cart-recovery:active"',
    action: 'Remove customer tags: cart-recovery:email-1, cart-recovery:email-2, cart-recovery:email-3, cart-recovery:email-4, cart-recovery:email-5, cart-recovery:active, cart-recovery:has-discount, cart-recovery:category-oilSlick, cart-recovery:category-smokeshop, cart-recovery:category-unknown',
    template: null,
    timing: 'Immediately on order completion',
    notes: 'Removes all cart-recovery:* tags when customer completes a purchase.',
  },
];

// ============================================================================
// METAFIELD DEFINITION CREATION (via GraphQL)
// ============================================================================

async function createMetafieldDefinitions() {
  console.log('\n  Creating customer metafield definitions...\n');

  for (const def of METAFIELD_DEFINITIONS) {
    const mutation = `
      mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            name
            namespace
            key
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      definition: {
        name: def.name,
        namespace: def.namespace,
        key: def.key,
        description: def.description,
        type: def.type,
        ownerType: 'CUSTOMER',
        pin: true,
      },
    };

    try {
      const result = await shopifyApi.graphqlQuery(mutation, variables);
      const data = result?.data?.metafieldDefinitionCreate;

      if (data?.createdDefinition) {
        console.log(`    [OK] ${def.namespace}.${def.key} (${def.type})`);
      } else if (data?.userErrors?.length > 0) {
        const msg = data.userErrors[0].message;
        if (msg.includes('already exists') || msg.includes('has already been taken')) {
          console.log(`    [SKIP] ${def.namespace}.${def.key} - already exists`);
        } else {
          console.log(`    [WARN] ${def.namespace}.${def.key} - ${msg}`);
        }
      }
    } catch (error) {
      console.log(`    [ERR] ${def.namespace}.${def.key} - ${error.message}`);
    }
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

async function validateSetup() {
  console.log('\n  Validating metafield definitions...\n');

  const query = `
    {
      metafieldDefinitions(first: 50, ownerType: CUSTOMER, namespace: "cart_recovery") {
        edges {
          node {
            namespace
            key
            name
            type { name }
          }
        }
      }
    }
  `;

  try {
    const result = await shopifyApi.graphqlQuery(query);
    const definitions = result?.data?.metafieldDefinitions?.edges || [];
    const existingKeys = definitions.map(d => `${d.node.namespace}.${d.node.key}`);

    let allFound = true;
    for (const def of METAFIELD_DEFINITIONS) {
      const fullKey = `${def.namespace}.${def.key}`;
      if (existingKeys.includes(fullKey)) {
        console.log(`    [OK] ${fullKey}`);
      } else {
        console.log(`    [MISSING] ${fullKey} - run with --create to fix`);
        allFound = false;
      }
    }

    return allFound;
  } catch (error) {
    console.log(`    [ERR] Could not query metafield definitions: ${error.message}`);
    console.log('    This might mean the API token lacks metafield read access.');
    return false;
  }
}

// ============================================================================
// FLOW SETUP INSTRUCTIONS
// ============================================================================

function printFlowInstructions() {
  console.log('\n  ═══════════════════════════════════════════════════════════════');
  console.log('  SHOPIFY FLOW SETUP - STEP BY STEP');
  console.log('  ═══════════════════════════════════════════════════════════════\n');

  console.log('  PREREQUISITE: Create 5 Shopify Email templates first.');
  console.log('  Template files are in: theme-files/notifications/cart-recovery-email-{1-5}.liquid');
  console.log('  For each one: Marketing → Shopify Email → Create template → Code view → Paste.\n');

  for (let i = 0; i < FLOW_CONFIGS.length; i++) {
    const flow = FLOW_CONFIGS[i];
    console.log(`  ─── Flow ${i + 1}/${FLOW_CONFIGS.length}: ${flow.name} ───`);
    console.log(`  Trigger:    ${flow.trigger}`);
    console.log(`  Condition:  ${flow.condition}`);
    console.log(`  Action:     ${flow.action}`);
    if (flow.template) {
      console.log(`  Template:   ${flow.template}`);
    }
    console.log(`  Timing:     ${flow.timing}`);
    console.log(`  Notes:      ${flow.notes}`);
    console.log('');
  }

  console.log('  ─── How to create each Flow ───');
  console.log('  1. Go to Shopify Admin → Apps → Flow');
  console.log('  2. Click "Create workflow"');
  console.log('  3. Select trigger: "Customer tags added"');
  console.log('  4. Add condition: Check that the specific tag was added');
  console.log('  5. Add action: "Send marketing email"');
  console.log('  6. Select the corresponding Shopify Email template');
  console.log('  7. Turn on the workflow');
  console.log('  8. Repeat for each email in the sequence\n');

  console.log('  ─── Integration with your existing segment tags ───');
  console.log('  Your segment tags (segment:smokeshop-buyer, segment:vip, rfm:high, etc.)');
  console.log('  work alongside the cart-recovery tags. The engine reads existing customer');
  console.log('  tags to enhance segmentation. Your segment tags are never removed.\n');

  console.log('  ─── Testing ───');
  console.log('  1. Run: npm run cart-recovery          (dry run - no changes)');
  console.log('  2. Run: npm run cart-recovery:verbose   (dry run + detailed output)');
  console.log('  3. Run: npm run cart-recovery:execute   (live - tags customers, sends emails)');
  console.log('  4. Check a customer in Shopify Admin → verify tags and metafields appear\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CART RECOVERY - SHOPIFY FLOW SETUP');
  console.log('  Oil Slick Pad');
  console.log(`  Mode: ${CREATE_MODE ? 'CREATE metafield definitions' : 'VALIDATE + print instructions'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (CREATE_MODE) {
    await createMetafieldDefinitions();
  }

  const valid = await validateSetup();

  if (!valid && !CREATE_MODE) {
    console.log('\n  Some metafield definitions are missing.');
    console.log('  Run: node src/setup-cart-recovery-flows.js --create\n');
  }

  printFlowInstructions();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

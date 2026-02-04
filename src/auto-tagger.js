/**
 * Auto-Tagger Engine
 *
 * Reads classification rules from Supabase and applies them
 * to products. Can run on a single product (webhook mode)
 * or scan all products (batch mode).
 *
 * Usage:
 *   Batch mode:    node src/auto-tagger.js
 *   Dry run:       node src/auto-tagger.js --dry-run
 *   Single product: node src/auto-tagger.js --product-id 12345
 */

import 'dotenv/config';
import * as shopify from './shopify-api.js';
import {
  getActiveRules,
  upsertProduct,
  markClassified,
  logAudit,
} from './supabase-client.js';

const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_PRODUCT_ID = (() => {
  const idx = process.argv.indexOf('--product-id');
  return idx !== -1 ? parseInt(process.argv[idx + 1]) : null;
})();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// RULE MATCHING ENGINE
// ============================================================

function matchesConditions(product, conditions) {
  const title = product.title || '';
  const titleLower = title.toLowerCase();
  const tags = (product.tags || '').split(',').map(t => t.trim()).filter(t => t);
  const tagsLower = tags.map(t => t.toLowerCase());
  const vendor = product.vendor || '';

  // title_contains_any: title must contain at least one keyword
  if (conditions.title_contains_any) {
    const match = conditions.title_contains_any.some(keyword =>
      titleLower.includes(keyword.toLowerCase())
    );
    if (!match) return false;
  }

  // title_contains: title must contain ALL keywords
  if (conditions.title_contains) {
    const match = conditions.title_contains.every(keyword =>
      titleLower.includes(keyword.toLowerCase())
    );
    if (!match) return false;
  }

  // title_not_contains: title must NOT contain any of these
  if (conditions.title_not_contains) {
    const blocked = conditions.title_not_contains.some(keyword =>
      titleLower.includes(keyword.toLowerCase())
    );
    if (blocked) return false;
  }

  // title_matches_any: title matches any regex pattern
  if (conditions.title_matches_any) {
    const match = conditions.title_matches_any.some(pattern => {
      try {
        return new RegExp(pattern, 'i').test(title);
      } catch {
        return false;
      }
    });
    if (!match) return false;
  }

  // tags_include: product must have ALL these tags (case-insensitive)
  if (conditions.tags_include) {
    const match = conditions.tags_include.every(tag =>
      tagsLower.includes(tag.toLowerCase())
    );
    if (!match) return false;
  }

  // tags_exclude: product must NOT have any of these tags (case-insensitive)
  if (conditions.tags_exclude) {
    const blocked = conditions.tags_exclude.some(tag =>
      tagsLower.includes(tag.toLowerCase())
    );
    if (blocked) return false;
  }

  // vendor_equals: vendor must match
  if (conditions.vendor_equals) {
    if (vendor !== conditions.vendor_equals) return false;
  }

  // vendor_not_equals: vendor must NOT match
  if (conditions.vendor_not_equals) {
    if (vendor === conditions.vendor_not_equals) return false;
  }

  return true;
}

function computeTagChanges(currentTags, matchedRules) {
  const tagsToAdd = new Set();
  const tagsToRemove = new Set();
  const currentTagsLower = currentTags.map(t => t.toLowerCase());

  for (const rule of matchedRules) {
    for (const tag of (rule.apply_tags || [])) {
      if (!currentTagsLower.includes(tag.toLowerCase())) {
        tagsToAdd.add(tag);
      }
    }
    for (const tag of (rule.remove_tags || [])) {
      if (currentTagsLower.includes(tag.toLowerCase())) {
        tagsToRemove.add(tag.toLowerCase());
      }
    }
  }

  return {
    add: [...tagsToAdd],
    remove: [...tagsToRemove],
  };
}

// ============================================================
// MAIN CLASSIFICATION LOGIC
// ============================================================

async function classifyProduct(product, rules) {
  const currentTags = (product.tags || '').split(',').map(t => t.trim()).filter(t => t);

  // Find matching rules
  const matchedRules = rules.filter(rule => matchesConditions(product, rule.conditions));

  if (matchedRules.length === 0) {
    return { changed: false, matchedRules: [] };
  }

  // Compute tag changes
  const changes = computeTagChanges(currentTags, matchedRules);

  if (changes.add.length === 0 && changes.remove.length === 0) {
    return { changed: false, matchedRules, alreadyCorrect: true };
  }

  // Apply changes (case-insensitive removal)
  const newTags = [
    ...currentTags.filter(t => !changes.remove.includes(t.toLowerCase())),
    ...changes.add
  ];

  if (!DRY_RUN) {
    // Update Shopify
    await shopify.updateProduct(product.id, { tags: newTags.join(', ') });

    // Update Supabase
    await upsertProduct({ ...product, tags: newTags.join(', ') });
    await markClassified(product.id, matchedRules.map(r => r.id));

    // Audit log
    await logAudit(
      'product_classified',
      'product',
      product.id,
      product.title,
      {
        tags_added: changes.add,
        tags_removed: changes.remove,
        rules_matched: matchedRules.map(r => r.rule_name),
      },
      'auto-tagger',
      { tags: currentTags }
    );

    await sleep(350);
  }

  return {
    changed: true,
    matchedRules,
    tagsAdded: changes.add,
    tagsRemoved: changes.remove,
  };
}

// ============================================================
// BATCH MODE
// ============================================================

async function runBatch() {
  console.log('='.repeat(70));
  console.log(`AUTO-TAGGER ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
  console.log('='.repeat(70));

  // Load rules from Supabase
  console.log('\nLoading classification rules...');
  const rules = await getActiveRules();
  console.log(`Loaded ${rules.length} active rules\n`);

  // Fetch products
  let products;
  if (SINGLE_PRODUCT_ID) {
    console.log(`Single product mode: ${SINGLE_PRODUCT_ID}`);
    const data = await shopify.getProduct(SINGLE_PRODUCT_ID);
    products = data.product ? [data.product] : [];
  } else {
    console.log('Fetching all products from Shopify...');
    products = await shopify.getAllProducts();
  }

  console.log(`Processing ${products.length} products...\n`);

  let changed = 0;
  let unchanged = 0;
  let alreadyCorrect = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    try {
      const result = await classifyProduct(product, rules);

      if (result.changed) {
        console.log(`\n[${i + 1}/${products.length}] ${product.title.substring(0, 50)}`);
        if (result.tagsAdded?.length > 0) {
          console.log(`  + Added: ${result.tagsAdded.join(', ')}`);
        }
        if (result.tagsRemoved?.length > 0) {
          console.log(`  - Removed: ${result.tagsRemoved.join(', ')}`);
        }
        console.log(`  Rules: ${result.matchedRules.map(r => r.rule_name).join(', ')}`);
        changed++;
      } else if (result.alreadyCorrect) {
        alreadyCorrect++;
      } else {
        unchanged++;
      }
    } catch (error) {
      console.error(`\nError on ${product.id}: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Changed: ${changed}`);
  console.log(`Already correct: ${alreadyCorrect}`);
  console.log(`No rules matched: ${unchanged}`);
  console.log(`Failed: ${failed}`);

  if (DRY_RUN) {
    console.log('\n(DRY RUN - no changes were made)');
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runBatch().catch(err => {
  console.error(err);
  process.exit(1);
});

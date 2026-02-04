/**
 * Collection Health Monitor
 *
 * Compares the actual state of Shopify collections against
 * the expected definitions in Supabase. Reports drift,
 * misconfigured rules, empty collections, and bloated collections.
 *
 * Usage:
 *   Full check:     node src/health-monitor.js
 *   Quick check:    node src/health-monitor.js --quick
 *   Fix drift:      node src/health-monitor.js --fix
 */

import 'dotenv/config';
import * as shopify from './shopify-api.js';
import {
  getCollectionDefinitions,
  logHealthCheck,
  logAudit,
} from './supabase-client.js';

const QUICK_MODE = process.argv.includes('--quick');
const FIX_MODE = process.argv.includes('--fix');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// FETCH SHOPIFY STATE
// ============================================================

async function getCollectionProductCount(collectionId) {
  const data = await shopify.get(`collections/${collectionId}/products/count.json`);
  return data.count || 0;
}

// ============================================================
// RULE COMPARISON (order-independent, key-order-independent)
// ============================================================

function normalizeRule(rule) {
  // Sort keys and produce a stable string for comparison
  const sorted = {};
  for (const key of Object.keys(rule).sort()) {
    sorted[key] = rule[key];
  }
  return JSON.stringify(sorted);
}

function rulesMatch(expectedRules, actualRules) {
  if (expectedRules.length !== actualRules.length) return false;
  const expectedSet = new Set(expectedRules.map(normalizeRule));
  const actualSet = new Set(actualRules.map(normalizeRule));
  if (expectedSet.size !== actualSet.size) return false;
  for (const item of expectedSet) {
    if (!actualSet.has(item)) return false;
  }
  return true;
}

// ============================================================
// HEALTH CHECKS
// ============================================================

async function checkCollectionRules(shopifyCollections, definitions) {
  const issues = [];

  for (const def of definitions) {
    if (!def.shopify_id) continue;

    const shopifyCol = shopifyCollections.find(c => c.id === def.shopify_id);

    if (!shopifyCol) {
      issues.push({
        severity: 'fail',
        collection: def.title,
        shopify_id: def.shopify_id,
        issue: 'Collection not found in Shopify',
        expected: `Shopify ID ${def.shopify_id}`,
        actual: 'Missing',
      });
      continue;
    }

    // Check disjunctive setting
    if (shopifyCol.disjunctive !== def.disjunctive) {
      issues.push({
        severity: 'warn',
        collection: def.title,
        shopify_id: def.shopify_id,
        issue: 'Logic mode mismatch',
        expected: def.disjunctive ? 'OR (disjunctive)' : 'AND (conjunctive)',
        actual: shopifyCol.disjunctive ? 'OR (disjunctive)' : 'AND (conjunctive)',
      });
    }

    // Check sort order
    if (shopifyCol.sort_order !== def.sort_order) {
      issues.push({
        severity: 'warn',
        collection: def.title,
        shopify_id: def.shopify_id,
        issue: 'Sort order mismatch',
        expected: def.sort_order,
        actual: shopifyCol.sort_order,
      });
    }

    // Check rules match expected (order-independent comparison)
    const expectedRules = def.rules || [];
    const actualRules = shopifyCol.rules || [];

    if (!rulesMatch(expectedRules, actualRules)) {
      issues.push({
        severity: 'fail',
        collection: def.title,
        shopify_id: def.shopify_id,
        issue: 'Collection rules have drifted',
        expected: `${expectedRules.length} rules`,
        actual: `${actualRules.length} rules`,
      });
    }
  }

  return issues;
}

async function checkProductCounts(shopifyCollections, definitions) {
  const issues = [];

  for (const def of definitions) {
    if (!def.shopify_id) continue;

    const shopifyCol = shopifyCollections.find(c => c.id === def.shopify_id);
    if (!shopifyCol) continue;

    try {
      const count = await getCollectionProductCount(def.shopify_id);
      await sleep(350);

      // Check against thresholds
      if (count < def.min_expected_products) {
        issues.push({
          severity: count === 0 ? 'fail' : 'warn',
          collection: def.title,
          issue: count === 0 ? 'Collection is empty' : 'Below minimum expected products',
          expected: `>= ${def.min_expected_products}`,
          actual: `${count} products`,
        });
      }

      if (count > def.max_expected_products) {
        issues.push({
          severity: 'fail',
          collection: def.title,
          issue: 'Above maximum expected products (possible rule misconfiguration)',
          expected: `<= ${def.max_expected_products}`,
          actual: `${count} products`,
        });
      }
    } catch (error) {
      issues.push({
        severity: 'warn',
        collection: def.title,
        issue: `Failed to get product count: ${error.message}`,
      });
    }
  }

  return issues;
}

async function checkOrphanedCollections(shopifyCollections, definitions) {
  const issues = [];
  const definedIds = new Set(definitions.map(d => d.shopify_id).filter(Boolean));

  for (const col of shopifyCollections) {
    if (!definedIds.has(col.id)) {
      issues.push({
        severity: 'warn',
        collection: col.title,
        issue: 'Collection exists in Shopify but not tracked in Supabase',
        actual: `ID: ${col.id}, Handle: ${col.handle}`,
      });
    }
  }

  return issues;
}

async function checkMenuConsistency(definitions) {
  const issues = [];

  // Check for definitions with menu_location but no menu_position
  for (const def of definitions) {
    if (def.menu_location && def.menu_position === null) {
      issues.push({
        severity: 'warn',
        collection: def.title,
        issue: 'Has menu location but no position',
        expected: 'menu_position should be set',
        actual: `menu_location: ${def.menu_location}, position: null`,
      });
    }
  }

  // Check for duplicate positions within a menu
  const menus = {};
  for (const def of definitions) {
    if (def.menu_location && def.menu_position !== null) {
      const key = `${def.menu_location}:${def.menu_position}`;
      if (menus[key]) {
        issues.push({
          severity: 'warn',
          collection: def.title,
          issue: `Duplicate menu position with "${menus[key]}"`,
          expected: 'Unique positions per menu',
          actual: `Both at ${def.menu_location} position ${def.menu_position}`,
        });
      }
      menus[key] = def.title;
    }
  }

  return issues;
}

// ============================================================
// FIX DRIFT
// ============================================================

async function fixDrift(shopifyCollections, definitions, ruleIssues) {
  const ruleDrifts = ruleIssues.filter(i =>
    i.issue === 'Collection rules have drifted' ||
    i.issue === 'Logic mode mismatch' ||
    i.issue === 'Sort order mismatch'
  );

  if (ruleDrifts.length === 0) {
    console.log('\nNo rule drift to fix.');
    return 0;
  }

  console.log(`\nFixing ${ruleDrifts.length} drifted collections...`);
  let fixed = 0;

  for (const drift of ruleDrifts) {
    // Match by shopify_id (reliable) instead of title (fragile)
    const def = definitions.find(d => d.shopify_id === drift.shopify_id);
    if (!def || !def.shopify_id) continue;

    try {
      const update = {};

      if (drift.issue === 'Collection rules have drifted') {
        update.rules = def.rules;
        update.disjunctive = def.disjunctive;
      } else if (drift.issue === 'Logic mode mismatch') {
        update.disjunctive = def.disjunctive;
      } else if (drift.issue === 'Sort order mismatch') {
        update.sort_order = def.sort_order;
      }

      await shopify.updateSmartCollection(def.shopify_id, update);

      await logAudit(
        'collection_drift_fixed',
        'collection',
        String(def.shopify_id),
        def.title,
        { issue: drift.issue, fix_applied: update },
        'health-monitor'
      );

      console.log(`  Fixed: ${def.title} (${drift.issue})`);
      fixed++;
      await sleep(500);
    } catch (error) {
      console.error(`  Failed to fix ${def.title}: ${error.message}`);
    }
  }

  return fixed;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('='.repeat(70));
  console.log(`COLLECTION HEALTH MONITOR ${QUICK_MODE ? '(QUICK)' : ''} ${FIX_MODE ? '(FIX MODE)' : ''}`);
  console.log('='.repeat(70));

  // Load definitions from Supabase
  console.log('\nLoading collection definitions from Supabase...');
  const definitions = await getCollectionDefinitions();
  console.log(`Loaded ${definitions.length} collection definitions`);

  // Load current Shopify state (with full pagination)
  console.log('Fetching collections from Shopify...');
  const shopifyCollections = await shopify.getAllSmartCollections();
  console.log(`Found ${shopifyCollections.length} smart collections in Shopify`);

  const allIssues = [];

  // Check 1: Collection rules match definitions
  console.log('\n--- Check: Collection Rules ---');
  const ruleIssues = await checkCollectionRules(shopifyCollections, definitions);
  allIssues.push(...ruleIssues);
  console.log(`  ${ruleIssues.length} issues found`);

  // Check 2: Product counts within thresholds (skip in quick mode)
  if (!QUICK_MODE) {
    console.log('\n--- Check: Product Counts ---');
    const countIssues = await checkProductCounts(shopifyCollections, definitions);
    allIssues.push(...countIssues);
    console.log(`  ${countIssues.length} issues found`);
  }

  // Check 3: Orphaned collections
  console.log('\n--- Check: Orphaned Collections ---');
  const orphanIssues = await checkOrphanedCollections(shopifyCollections, definitions);
  allIssues.push(...orphanIssues);
  console.log(`  ${orphanIssues.length} issues found`);

  // Check 4: Menu consistency
  console.log('\n--- Check: Menu Consistency ---');
  const menuIssues = await checkMenuConsistency(definitions);
  allIssues.push(...menuIssues);
  console.log(`  ${menuIssues.length} issues found`);

  // Report
  console.log('\n' + '='.repeat(70));
  console.log('HEALTH REPORT');
  console.log('='.repeat(70));

  const fails = allIssues.filter(i => i.severity === 'fail');
  const warns = allIssues.filter(i => i.severity === 'warn');

  const overallStatus = fails.length > 0 ? 'fail' : warns.length > 0 ? 'warn' : 'pass';

  console.log(`\nOverall: ${overallStatus.toUpperCase()}`);
  console.log(`  Failures: ${fails.length}`);
  console.log(`  Warnings: ${warns.length}`);

  if (fails.length > 0) {
    console.log('\n--- FAILURES ---');
    for (const issue of fails) {
      console.log(`  [FAIL] ${issue.collection}: ${issue.issue}`);
      if (issue.expected) console.log(`         Expected: ${issue.expected}`);
      if (issue.actual) console.log(`         Actual:   ${issue.actual}`);
    }
  }

  if (warns.length > 0) {
    console.log('\n--- WARNINGS ---');
    for (const issue of warns) {
      console.log(`  [WARN] ${issue.collection}: ${issue.issue}`);
      if (issue.expected) console.log(`         Expected: ${issue.expected}`);
      if (issue.actual) console.log(`         Actual:   ${issue.actual}`);
    }
  }

  if (allIssues.length === 0) {
    console.log('\n  All checks passed. Collections are healthy.');
  }

  // Log to Supabase
  await logHealthCheck('full_scan', overallStatus, {
    total_issues: allIssues.length,
    failures: fails.length,
    warnings: warns.length,
    issues: allIssues,
    definitions_count: definitions.length,
    shopify_collections_count: shopifyCollections.length,
    quick_mode: QUICK_MODE,
  });

  // Fix drift if requested
  if (FIX_MODE && ruleIssues.length > 0) {
    const fixed = await fixDrift(shopifyCollections, definitions, ruleIssues);
    console.log(`\nFixed ${fixed} drifted collections`);

    await logAudit(
      'drift_fix_batch',
      'system',
      'all',
      'Health monitor drift fix',
      { issues_found: ruleIssues.length, fixed },
      'health-monitor'
    );
  } else if (ruleIssues.length > 0 && !FIX_MODE) {
    console.log('\nTip: Run with --fix to automatically correct drifted collection rules');
  }

  console.log('\n' + '='.repeat(70));
  console.log('DONE');
  console.log('='.repeat(70));

  if (fails.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

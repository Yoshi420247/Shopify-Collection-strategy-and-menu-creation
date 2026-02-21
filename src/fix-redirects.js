#!/usr/bin/env node
/**
 * Fix Collection Redirects
 *
 * Creates Shopify URL redirects for all legacy/dead collection URLs so they
 * point to the correct active collection. This prevents 404 errors from:
 * - Old bookmarks and shared links
 * - External sites and blogs linking to legacy URLs
 * - SEO crawlers finding broken links
 * - Google Search Console reporting dead pages
 *
 * Usage:
 *   node src/fix-redirects.js                # Dry run - preview all redirects
 *   node src/fix-redirects.js --execute      # Create redirects in Shopify
 *   node src/fix-redirects.js --audit        # Audit existing redirects
 *   node src/fix-redirects.js --cleanup      # Remove outdated redirects
 */

import 'dotenv/config';
import { config } from './config.js';
import api from './shopify-api.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

// ============================================================================
// REDIRECT MANAGEMENT
// ============================================================================

/**
 * Build the set of all active collection handles from config
 */
function getActiveCollectionHandles() {
  const handles = new Set();

  // Main collection
  handles.add(config.collections.main.handle);

  // Categories
  for (const col of config.collections.categories) {
    handles.add(col.handle);
  }

  // Accessories
  for (const col of config.collections.accessories) {
    handles.add(col.handle);
  }

  // Additional categories
  for (const col of (config.collections.additionalCategories || [])) {
    handles.add(col.handle);
  }

  // Brands
  for (const brand of config.collections.brands) {
    handles.add(brand.handle);
  }

  // Features
  for (const feature of config.collections.features) {
    handles.add(feature.handle);
  }

  // Special
  handles.add('all');
  handles.add('clearance');

  return handles;
}

/**
 * Fetch all existing redirects from Shopify
 */
async function fetchExistingRedirects() {
  logSection('FETCHING EXISTING REDIRECTS');

  const allRedirects = [];
  let page = 1;

  // Shopify paginates redirects; fetch all pages
  while (true) {
    const data = await api.get(`redirects.json?limit=250&since_id=${allRedirects.length > 0 ? allRedirects[allRedirects.length - 1].id : 0}`);
    const batch = data.redirects || [];

    if (batch.length === 0) break;
    allRedirects.push(...batch);
    log(`  Fetched ${allRedirects.length} redirects (page ${page})...`, 'dim');
    page++;

    if (batch.length < 250) break;
  }

  log(`Found ${allRedirects.length} existing redirects`, 'cyan');
  return allRedirects;
}

/**
 * Create all missing redirects from config
 */
async function createRedirects(dryRun = true) {
  logSection('CREATING COLLECTION REDIRECTS');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  const redirectMap = config.redirects || [];
  if (redirectMap.length === 0) {
    log('No redirects configured in config.redirects', 'yellow');
    return { created: 0, skipped: 0, errors: 0 };
  }

  // Fetch existing redirects to avoid duplicates
  const existingRedirects = await fetchExistingRedirects();
  const existingPaths = new Set(existingRedirects.map(r => r.path));

  const activeHandles = getActiveCollectionHandles();

  let created = 0;
  let skipped = 0;
  let errors = 0;
  let alreadyExists = 0;

  log(`\nProcessing ${redirectMap.length} redirect rules...`, 'cyan');
  console.log('');

  for (const { from, to } of redirectMap) {
    // Validate: the target should be an active collection
    const targetHandle = to.replace('/collections/', '');
    if (!activeHandles.has(targetHandle)) {
      log(`  WARNING: Target "${to}" is not an active collection handle`, 'yellow');
    }

    // Check if redirect already exists
    if (existingPaths.has(from)) {
      const existing = existingRedirects.find(r => r.path === from);
      if (existing && existing.target === to) {
        skipped++;
        continue; // Already correct, skip silently
      } else if (existing) {
        log(`  UPDATE NEEDED: ${from}`, 'yellow');
        log(`    Currently → ${existing.target}`, 'dim');
        log(`    Should be → ${to}`, 'green');
        // We'd need to delete and recreate since Shopify doesn't support redirect PUT
        if (!dryRun) {
          try {
            await api.deleteRedirect(existing.id);
            const result = await api.createRedirect(from, to);
            if (result.redirect) {
              log(`    Updated!`, 'green');
              created++;
            } else {
              log(`    ERROR: ${JSON.stringify(result.errors || result)}`, 'red');
              errors++;
            }
          } catch (error) {
            log(`    ERROR: ${error.message}`, 'red');
            errors++;
          }
        } else {
          created++;
        }
        continue;
      }
    }

    // Create new redirect
    console.log(`  ${from}`);
    log(`    → ${to}`, 'green');

    if (!dryRun) {
      try {
        const result = await api.createRedirect(from, to);
        if (result.redirect) {
          log(`    Created (ID: ${result.redirect.id})`, 'green');
          created++;
        } else {
          log(`    ERROR: ${JSON.stringify(result.errors || result)}`, 'red');
          errors++;
        }
      } catch (error) {
        log(`    ERROR: ${error.message}`, 'red');
        errors++;
      }
    } else {
      created++;
    }
  }

  // Summary
  logSection('REDIRECT SUMMARY');
  log(`Redirects to create: ${created}`, 'green');
  log(`Already correct: ${skipped}`, 'dim');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  return { created, skipped, errors };
}

/**
 * Audit existing redirects - find any that point to dead collections
 * or have issues
 */
async function auditRedirects() {
  logSection('AUDITING EXISTING REDIRECTS');

  const existingRedirects = await fetchExistingRedirects();
  const activeHandles = getActiveCollectionHandles();
  const configRedirectPaths = new Set((config.redirects || []).map(r => r.from));

  const collectionRedirects = existingRedirects.filter(r =>
    r.path.startsWith('/collections/') || r.target.startsWith('/collections/')
  );

  log(`\nCollection-related redirects: ${collectionRedirects.length}`, 'cyan');

  const issues = {
    deadTargets: [],
    missingFromConfig: [],
    chainedRedirects: [],
  };

  // Check each redirect
  for (const redirect of collectionRedirects) {
    const targetHandle = redirect.target.replace('/collections/', '');

    // Check if target is a live collection
    if (redirect.target.startsWith('/collections/') && !activeHandles.has(targetHandle)) {
      issues.deadTargets.push(redirect);
    }

    // Check if this redirect is in our config
    if (!configRedirectPaths.has(redirect.path) && redirect.path.startsWith('/collections/')) {
      issues.missingFromConfig.push(redirect);
    }
  }

  // Check for chained redirects (A → B, B → C)
  const targetPaths = new Set(existingRedirects.map(r => r.path));
  for (const redirect of existingRedirects) {
    if (targetPaths.has(redirect.target)) {
      issues.chainedRedirects.push(redirect);
    }
  }

  // Report
  if (issues.deadTargets.length > 0) {
    log(`\nRedirects pointing to DEAD collections: ${issues.deadTargets.length}`, 'red');
    for (const r of issues.deadTargets) {
      console.log(`  ${r.path} → ${r.target} (ID: ${r.id})`);
    }
  }

  if (issues.chainedRedirects.length > 0) {
    log(`\nChained redirects (redirect → redirect): ${issues.chainedRedirects.length}`, 'yellow');
    for (const r of issues.chainedRedirects) {
      console.log(`  ${r.path} → ${r.target} (ID: ${r.id})`);
    }
  }

  if (issues.missingFromConfig.length > 0) {
    log(`\nExisting redirects NOT in our config: ${issues.missingFromConfig.length}`, 'blue');
    for (const r of issues.missingFromConfig.slice(0, 20)) {
      console.log(`  ${r.path} → ${r.target} (ID: ${r.id})`);
    }
    if (issues.missingFromConfig.length > 20) {
      console.log(`  ... and ${issues.missingFromConfig.length - 20} more`);
    }
  }

  if (issues.deadTargets.length === 0 && issues.chainedRedirects.length === 0) {
    log(`\nAll redirects look healthy!`, 'green');
  }

  // Show full redirect map for reference
  logSection('CONFIGURED REDIRECT MAP');
  const redirectMap = config.redirects || [];
  console.log(`\n${redirectMap.length} redirects configured:\n`);

  // Group by target for readability
  const byTarget = {};
  for (const { from, to } of redirectMap) {
    if (!byTarget[to]) byTarget[to] = [];
    byTarget[to].push(from);
  }

  for (const [target, sources] of Object.entries(byTarget).sort()) {
    log(`  → ${target}`, 'green');
    for (const source of sources) {
      console.log(`    ${source}`);
    }
  }

  return issues;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const auditOnly = args.includes('--audit');

  console.log('\n' + '═'.repeat(70));
  log('  COLLECTION REDIRECT MANAGER', 'bright');
  log(`  Store: ${config.shopify.storeUrl}`, 'cyan');
  log(`  Mode: ${auditOnly ? 'AUDIT' : dryRun ? 'DRY RUN (use --execute to apply)' : 'EXECUTING CHANGES'}`, auditOnly ? 'blue' : dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  try {
    if (auditOnly) {
      await auditRedirects();
    } else {
      // Audit first to show current state
      await auditRedirects();

      // Then create missing redirects
      await createRedirects(dryRun);
    }

    logSection('COMPLETE');
    if (dryRun && !auditOnly) {
      log('\nThis was a DRY RUN. To apply redirects:', 'yellow');
      console.log('  node src/fix-redirects.js --execute');
    } else if (!auditOnly) {
      log('\nAll redirects have been created!', 'green');
    }

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();

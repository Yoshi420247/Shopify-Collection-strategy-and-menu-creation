#!/usr/bin/env node
/**
 * Redirect Manager for Oil Slick Shopify Store
 *
 * Creates 301 redirects from broken/empty/duplicate collection URLs to their
 * correct canonical counterparts using the Shopify Admin REST API.
 *
 * Usage:
 *   node src/redirect-manager.js              # Dry run - preview all redirects
 *   node src/redirect-manager.js --execute    # Create redirects in Shopify
 *   node src/redirect-manager.js --audit      # Check which redirects already exist
 *   node src/redirect-manager.js --cleanup    # Remove redirects that point to wrong targets
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { config } from './config.js';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

// Colors for terminal output
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg, color = 'reset') {
  console.log(`${c[color]}${msg}${c.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Rate-limited API request using curl
let lastRequestTime = 0;
const MIN_INTERVAL = 550; // ms between requests (Shopify rate limit)

async function apiRequest(endpoint, method = 'GET', body = null, retries = 3) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL) {
    await sleep(MIN_INTERVAL - elapsed);
  }
  lastRequestTime = Date.now();

  let cmd = `curl -s --max-time 30 -X ${method} "${BASE_URL}/${endpoint}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;

  if (body) {
    const escaped = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += `-d '${escaped}'`;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(result);

      if (data.errors) {
        throw new Error(JSON.stringify(data.errors));
      }
      return data;
    } catch (error) {
      if (attempt < retries) {
        const wait = Math.pow(2, attempt) * 1000;
        console.log(`  Retry ${attempt}/${retries} after ${wait / 1000}s...`);
        await sleep(wait);
      } else {
        throw error;
      }
    }
  }
}

// Fetch all existing redirects (handles pagination)
async function getAllRedirects() {
  const redirects = [];
  let sinceId = 0;

  while (true) {
    const params = sinceId > 0 ? `?limit=250&since_id=${sinceId}` : '?limit=250';
    const data = await apiRequest(`redirects.json${params}`);
    const batch = data.redirects || [];

    if (batch.length === 0) break;

    redirects.push(...batch);
    sinceId = batch[batch.length - 1].id;
    console.log(`  Fetched ${redirects.length} existing redirects...`);

    if (batch.length < 250) break;
  }

  return redirects;
}

// Create a single redirect
async function createRedirect(fromPath, toPath) {
  return apiRequest('redirects.json', 'POST', {
    redirect: { path: fromPath, target: toPath },
  });
}

// Delete a redirect by ID
async function deleteRedirect(id) {
  return apiRequest(`redirects/${id}.json`, 'DELETE');
}

// Build a lookup of canonical collection handles from config
function getCanonicalHandles() {
  const handles = new Set();

  // Main collection
  handles.add(config.collections.main.handle);

  // Category collections
  for (const col of config.collections.categories) {
    handles.add(col.handle);
  }

  // Accessory collections
  for (const col of config.collections.accessories) {
    handles.add(col.handle);
  }

  // Brand collections
  for (const col of config.collections.brands) {
    handles.add(col.handle);
  }

  // Feature collections
  for (const col of config.collections.features) {
    handles.add(col.handle);
  }

  // Additional categories
  for (const col of config.collections.additionalCategories) {
    handles.add(col.handle);
  }

  // Special well-known handles
  handles.add('all');
  handles.add('clearance');
  handles.add('extraction-packaging');
  handles.add('silicone-pads');
  handles.add('fep-sheets');
  handles.add('ptfe-sheets');
  handles.add('parchment-paper');
  handles.add('glass-jars');
  handles.add('concentrate-containers');
  handles.add('mylar-bags');
  handles.add('joint-tubes');
  handles.add('rosin-extraction');

  return handles;
}

// === MAIN COMMANDS ===

async function dryRun() {
  log('\n' + '='.repeat(70), 'bold');
  log('  REDIRECT MANAGER - DRY RUN', 'bold');
  log('='.repeat(70), 'bold');
  log('  Preview of all redirects that will be created\n', 'dim');

  const redirects = config.collections.redirects;
  const canonicalHandles = getCanonicalHandles();

  log(`Total redirects to create: ${redirects.length}\n`, 'cyan');

  // Group by category for readability
  let currentCategory = '';
  for (const r of redirects) {
    // Detect category from comments (based on from path patterns)
    const fromHandle = r.from.replace('/collections/', '');
    const toHandle = r.to.replace('/collections/', '');

    // Verify the target is a known canonical handle
    const targetValid = canonicalHandles.has(toHandle);
    const status = targetValid ? `${c.green}OK${c.reset}` : `${c.yellow}CHECK${c.reset}`;

    console.log(`  ${r.from}`);
    console.log(`    -> ${r.to}  [${status}]`);
  }

  // Summary
  log('\n' + '-'.repeat(70), 'dim');
  const validCount = redirects.filter(r => canonicalHandles.has(r.to.replace('/collections/', ''))).length;
  log(`\nSummary:`, 'bold');
  log(`  Total redirects:          ${redirects.length}`);
  log(`  Target is canonical:      ${validCount}`, 'green');
  log(`  Target needs verification: ${redirects.length - validCount}`, 'yellow');

  log('\nRun with --execute to create these redirects in Shopify.', 'yellow');
  log('Run with --audit to check which already exist.\n', 'yellow');
}

async function audit() {
  log('\n' + '='.repeat(70), 'bold');
  log('  REDIRECT MANAGER - AUDIT', 'bold');
  log('='.repeat(70), 'bold');
  log('  Comparing desired redirects against what exists in Shopify\n', 'dim');

  log('Fetching existing redirects from Shopify...', 'cyan');
  const existing = await getAllRedirects();
  log(`Found ${existing.length} existing redirects\n`, 'green');

  // Build lookup: path -> redirect object
  const existingByPath = {};
  for (const r of existing) {
    existingByPath[r.path] = r;
  }

  const desired = config.collections.redirects;
  const missing = [];
  const correct = [];
  const wrong = [];

  for (const r of desired) {
    const ex = existingByPath[r.from];
    if (!ex) {
      missing.push(r);
    } else if (ex.target === r.to) {
      correct.push({ ...r, id: ex.id });
    } else {
      wrong.push({ ...r, existingTarget: ex.target, id: ex.id });
    }
  }

  // Report
  if (correct.length > 0) {
    log(`\nAlready correct (${correct.length}):`, 'green');
    for (const r of correct) {
      console.log(`  ${c.green}✓${c.reset} ${r.from} -> ${r.to}`);
    }
  }

  if (wrong.length > 0) {
    log(`\nWrong target (${wrong.length}):`, 'red');
    for (const r of wrong) {
      console.log(`  ${c.red}✗${c.reset} ${r.from}`);
      console.log(`    Current:  ${r.existingTarget}`);
      console.log(`    Expected: ${r.to}`);
    }
  }

  if (missing.length > 0) {
    log(`\nMissing (${missing.length}):`, 'yellow');
    for (const r of missing) {
      console.log(`  ${c.yellow}○${c.reset} ${r.from} -> ${r.to}`);
    }
  }

  // Check for extra redirects not in config
  const desiredPaths = new Set(desired.map(r => r.from));
  const extras = existing.filter(r =>
    r.path.startsWith('/collections/') && !desiredPaths.has(r.path)
  );

  if (extras.length > 0) {
    log(`\nExtra redirects not in config (${extras.length}):`, 'cyan');
    for (const r of extras) {
      console.log(`  ${c.cyan}?${c.reset} ${r.path} -> ${r.target}  (id: ${r.id})`);
    }
  }

  log('\n' + '-'.repeat(70), 'dim');
  log(`\nSummary:`, 'bold');
  log(`  Correct:   ${correct.length}`, 'green');
  log(`  Wrong:     ${wrong.length}`, 'red');
  log(`  Missing:   ${missing.length}`, 'yellow');
  log(`  Extra:     ${extras.length}`, 'cyan');
  log(`  Total desired: ${desired.length}`);
  log(`  Total in Shopify: ${existing.length}\n`);

  if (missing.length > 0 || wrong.length > 0) {
    log('Run with --execute to create missing and fix wrong redirects.', 'yellow');
  }
}

async function execute() {
  log('\n' + '='.repeat(70), 'bold');
  log('  REDIRECT MANAGER - EXECUTING', 'bold');
  log('='.repeat(70), 'bold');

  // First, fetch existing to avoid duplicates
  log('\nFetching existing redirects...', 'cyan');
  const existing = await getAllRedirects();
  const existingByPath = {};
  for (const r of existing) {
    existingByPath[r.path] = r;
  }
  log(`Found ${existing.length} existing redirects\n`, 'dim');

  const desired = config.collections.redirects;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of desired) {
    const ex = existingByPath[r.from];

    // Already exists with correct target
    if (ex && ex.target === r.to) {
      console.log(`  ${c.dim}skip${c.reset} ${r.from} (already correct)`);
      skipped++;
      continue;
    }

    // Exists but wrong target - delete first, then recreate
    if (ex && ex.target !== r.to) {
      console.log(`  ${c.yellow}fix${c.reset}  ${r.from}`);
      console.log(`         was: ${ex.target}`);
      console.log(`         now: ${r.to}`);
      try {
        await deleteRedirect(ex.id);
        await sleep(300);
        await createRedirect(r.from, r.to);
        updated++;
      } catch (err) {
        log(`  ERROR fixing ${r.from}: ${err.message}`, 'red');
        errors++;
      }
      continue;
    }

    // Doesn't exist - create
    console.log(`  ${c.green}create${c.reset} ${r.from} -> ${r.to}`);
    try {
      const result = await createRedirect(r.from, r.to);
      if (result.redirect) {
        created++;
      } else if (result.errors) {
        // Shopify returns errors if the source path doesn't exist as a resource
        // That's fine - the redirect still works for 404 URLs
        const errMsg = JSON.stringify(result.errors);
        if (errMsg.includes('path is already taken')) {
          console.log(`    ${c.yellow}Path already has a redirect${c.reset}`);
          skipped++;
        } else {
          log(`    ERROR: ${errMsg}`, 'red');
          errors++;
        }
      }
    } catch (err) {
      log(`  ERROR creating ${r.from}: ${err.message}`, 'red');
      errors++;
    }
  }

  log('\n' + '-'.repeat(70), 'dim');
  log(`\nResults:`, 'bold');
  log(`  Created:  ${created}`, 'green');
  log(`  Updated:  ${updated}`, 'yellow');
  log(`  Skipped:  ${skipped}`, 'dim');
  log(`  Errors:   ${errors}`, errors > 0 ? 'red' : 'dim');
  log(`  Total:    ${desired.length}\n`);

  if (errors > 0) {
    log('Some redirects failed. Run --audit to see current state.', 'yellow');
  } else {
    log('All redirects are in place!', 'green');
  }
}

async function cleanup() {
  log('\n' + '='.repeat(70), 'bold');
  log('  REDIRECT MANAGER - CLEANUP', 'bold');
  log('='.repeat(70), 'bold');
  log('  Removes redirects that point to wrong targets\n', 'dim');

  log('Fetching existing redirects...', 'cyan');
  const existing = await getAllRedirects();
  const existingByPath = {};
  for (const r of existing) {
    existingByPath[r.path] = r;
  }

  const desired = config.collections.redirects;
  let fixed = 0;
  let errors = 0;

  for (const r of desired) {
    const ex = existingByPath[r.from];
    if (ex && ex.target !== r.to) {
      console.log(`  ${c.yellow}Fixing${c.reset} ${r.from}`);
      console.log(`    ${ex.target} -> ${r.to}`);
      try {
        await deleteRedirect(ex.id);
        await sleep(300);
        await createRedirect(r.from, r.to);
        fixed++;
      } catch (err) {
        log(`  ERROR: ${err.message}`, 'red');
        errors++;
      }
    }
  }

  if (fixed === 0 && errors === 0) {
    log('\nAll redirects already point to correct targets.', 'green');
  } else {
    log(`\nFixed: ${fixed}  Errors: ${errors}`, fixed > 0 ? 'green' : 'red');
  }
}

// === ENTRY POINT ===
async function main() {
  const args = process.argv.slice(2);

  if (!STORE_URL || !ACCESS_TOKEN) {
    log('ERROR: SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN must be set in .env', 'red');
    process.exit(1);
  }

  log(`Store: ${STORE_URL}`, 'dim');

  if (args.includes('--audit')) {
    await audit();
  } else if (args.includes('--execute')) {
    await execute();
  } else if (args.includes('--cleanup')) {
    await cleanup();
  } else {
    await dryRun();
  }
}

main().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});

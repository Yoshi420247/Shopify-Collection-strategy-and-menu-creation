#!/usr/bin/env node
/**
 * Menu Fixer - Updates theme settings to fix navigation menus
 *
 * This script updates the mega-menu configuration in the theme settings
 * to properly connect to the Smoke & Vape navigation.
 */

import 'dotenv/config';
import { config } from './config.js';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const STORE_URL = process.env.SHOPIFY_STORE_URL || config.shopify.storeUrl;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || config.shopify.accessToken;
const API_VERSION = process.env.SHOPIFY_API_VERSION || config.shopify.apiVersion;
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

// Auto-detect active theme instead of hardcoding
let THEME_ID = null;

async function getActiveThemeId() {
  if (THEME_ID) return THEME_ID;

  log('\nDetecting active theme...', 'cyan');
  const response = curlRequest(`${BASE_URL}/themes.json`);
  const themes = response.themes || [];
  const active = themes.find(t => t.role === 'main');

  if (!active) {
    throw new Error('No active (main) theme found');
  }

  THEME_ID = active.id;
  log(`  Active theme: "${active.name}" (ID: ${THEME_ID})`, 'green');
  return THEME_ID;
}

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function curlRequest(url, method = 'GET', body = null) {
  let cmd = `curl -s --max-time 120 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;

  let tmpFile = null;
  if (body) {
    // Write body to temp file to avoid ENAMETOOLONG for large payloads
    tmpFile = path.join(os.tmpdir(), `shopify-body-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(body));
    cmd += `-d @${tmpFile}`;
  }

  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }
}

async function getThemeSettings() {
  const themeId = await getActiveThemeId();
  log('\nFetching current theme settings...', 'cyan');

  const response = curlRequest(
    `${BASE_URL}/themes/${themeId}/assets.json?asset%5Bkey%5D=config/settings_data.json`
  );

  return JSON.parse(response.asset.value);
}

async function updateThemeSettings(settings) {
  const themeId = await getActiveThemeId();
  log('\nUpdating theme settings...', 'cyan');

  const response = curlRequest(
    `${BASE_URL}/themes/${themeId}/assets.json`,
    'PUT',
    {
      asset: {
        key: 'config/settings_data.json',
        value: JSON.stringify(settings, null, 2)
      }
    }
  );

  return response;
}

async function assignMenusToHeader(settings, dryRun = true) {
  log('\n' + '='.repeat(70), 'bright');
  log('ASSIGNING MENUS TO THEME HEADER', 'bright');
  log('='.repeat(70), 'bright');

  const current = settings.current || {};
  const sections = current.sections || {};

  if (!sections.header) {
    sections.header = { type: 'header', settings: {} };
  }

  const header = sections.header.settings;
  const mainHandle = config.menuStructure.main.handle;
  const sidebarHandle = config.menuStructure.sidebar.handle;

  console.log(`\nCurrent menu assignments:`);
  console.log(`  main_linklist: ${header.main_linklist || '(not set)'}`);
  console.log(`  main_linklist2: ${header.main_linklist2 || '(not set)'}`);
  console.log(`\nNew menu assignments:`);
  console.log(`  main_linklist → ${mainHandle}`);
  console.log(`  main_linklist2 → ${sidebarHandle}`);

  if (!dryRun) {
    header.main_linklist = mainHandle;
    header.main_linklist2 = sidebarHandle;
    sections.header.settings = header;
    settings.current.sections = sections;
    log('  Menu handles assigned to header.', 'green');
  } else {
    log('\n  [DRY RUN] No changes applied.', 'yellow');
  }

  return settings;
}

async function configureMegaMenus(settings, dryRun = true) {
  log('\n' + '='.repeat(70), 'bright');
  log('CONFIGURING MEGA MENUS FOR SMOKE & VAPE', 'bright');
  log('='.repeat(70), 'bright');

  const current = settings.current || {};
  const sections = current.sections || {};

  // Configure Mega Menu 1 for "Smoke & Vape" / "Smoking Devices"
  const megaMenu1Config = {
    type: 'mega-menu-1',
    settings: {
      parent: 'smoking-devices'  // This should match the menu item handle
    },
    blocks: {
      'smoke-devices-col1': {
        type: 'column',
        settings: {
          richtext_top: '<h4>Smoking Devices</h4>',
          menu_1: 'smoking-devices-menu',
          menu_1_link: '/collections/smoke-and-vape'
        }
      },
      'smoke-devices-col2': {
        type: 'column',
        settings: {
          richtext_top: '<h4>Concentrate Devices</h4>',
          menu_1: 'concentrate-devices-menu',
          menu_1_link: '/collections/dab-rigs'
        }
      },
      'smoke-devices-col3': {
        type: 'column',
        settings: {
          richtext_top: '<h4>Featured</h4>',
          menu_1: 'featured-menu',
          menu_1_link: '/collections/made-in-usa'
        }
      }
    },
    block_order: ['smoke-devices-col1', 'smoke-devices-col2', 'smoke-devices-col3']
  };

  // Configure Mega Menu 2 for "Accessories"
  const megaMenu2Config = {
    type: 'mega-menu-2',
    settings: {
      parent: 'accessories'
    },
    blocks: {
      'accessories-col1': {
        type: 'column',
        settings: {
          richtext_top: '<h4>Dab Accessories</h4>',
          menu_1: 'dab-accessories-menu',
          menu_1_link: '/collections/quartz-bangers'
        }
      },
      'accessories-col2': {
        type: 'column',
        settings: {
          richtext_top: '<h4>Flower Accessories</h4>',
          menu_1: 'flower-accessories-menu',
          menu_1_link: '/collections/flower-bowls'
        }
      },
      'accessories-col3': {
        type: 'column',
        settings: {
          richtext_top: '<h4>Brands</h4>',
          menu_1: 'brands-menu',
          menu_1_link: '/collections/monark'
        }
      }
    },
    block_order: ['accessories-col1', 'accessories-col2', 'accessories-col3']
  };

  if (dryRun) {
    log('\nDRY RUN - Would configure:', 'yellow');
    console.log('\nMega Menu 1 Config:');
    console.log(JSON.stringify(megaMenu1Config, null, 2));
    console.log('\nMega Menu 2 Config:');
    console.log(JSON.stringify(megaMenu2Config, null, 2));
  } else {
    // Update settings (saved later in main())
    sections['mega-menu-1'] = megaMenu1Config;
    sections['mega-menu-2'] = megaMenu2Config;

    // Enable mega menus
    current.mega_menu_1 = true;
    current.mega_menu_2 = true;

    settings.current = current;
    settings.current.sections = sections;

    log('\nMega menu config staged (will be saved with other changes).', 'green');
  }
}

async function generateMenuInstructions() {
  log('\n' + '='.repeat(70), 'bright');
  log('NAVIGATION MENU SETUP INSTRUCTIONS', 'bright');
  log('='.repeat(70), 'bright');

  const instructions = `
AUTOMATED MENU TOOLS (recommended):
────────────────────────────────────
  npm run menu:nav              # Full inspection report
  npm run menu:nav:validate     # Verify config vs store
  npm run menu:auto             # Preview menu changes (dry run)
  npm run menu:auto:execute     # Apply all menus to Shopify

MANUAL SETUP (if automated tools unavailable):
───────────────────────────────────────────────
Go to Shopify Admin → Online Store → Navigation:

1. MAIN MENU (handle: main-menu):
   • Shop All → /collections/all
   • Smoke & Vape → /collections/smoke-and-vape
     ├── Bongs & Water Pipes → /collections/bongs-water-pipes
     ├── Dab Rigs → /collections/dab-rigs
     ├── Hand Pipes → /collections/hand-pipes
     ├── Bubblers → /collections/bubblers
     ├── Nectar Collectors → /collections/nectar-collectors
     ├── One Hitters & Chillums → /collections/one-hitters-chillums
     ├── Steamrollers → /collections/steamrollers
     ├── Silicone Pieces → /collections/silicone-rigs-bongs
     ├── Vapes & Electronics → /collections/vapes-electronics
     └── Shop All Smoke & Vape → /collections/smoke-and-vape
   • Accessories → /collections/accessories
     ├── Quartz Bangers → /collections/quartz-bangers
     ├── Carb Caps → /collections/carb-caps
     ├── Dab Tools → /collections/dab-tools
     ├── Flower Bowls → /collections/flower-bowls
     ├── Ash Catchers → /collections/ash-catchers
     ├── Adapters & Drop Downs → /collections/adapters
     ├── Ashtrays → /collections/ashtrays
     ├── Torches → /collections/torches
     ├── Grinders → /collections/grinders
     └── Rolling Papers & Cones → /collections/rolling-papers-cones
   • Extraction & Packaging → /collections/extraction-packaging
   • Brands → # (dropdown with all brand collections)
     ├── RAW, Zig Zag, Vibes, Elements, Cookies, Monark, Maven
     ├── Puffco, Lookah, G Pen, 710 SCI, Scorch
     └── Peaselburg, Only Quartz, EO Vape
   • Featured → # (dropdown)
     ├── Heady Glass, Made In USA, Travel Friendly
     ├── Pendants & Merch, Glass Pendants
     └── Gifts, Clearance

2. FIX BROKEN MENU LINKS:
   ───────────────────────
   • rolling-papers → rolling-papers-cones (canonical collection)
   • Any 404s should be updated to the collections above.

3. MEGA MENU (optional):
   In Theme Customizer → Header → Mega Menus:
   • Enable and configure columns with sub-menus
`;

  console.log(instructions);

  // Also save to a file
  const fs = await import('fs');
  const path = await import('path');
  const guidePath = path.join(process.cwd(), 'MENU_SETUP_GUIDE.md');
  fs.writeFileSync(guidePath, `# Menu Setup Guide\n${instructions}`);
  log(`\nInstructions saved to ${guidePath}`, 'green');
}

async function analyzeCurrentMenus() {
  log('\n' + '='.repeat(70), 'bright');
  log('CURRENT MENU ANALYSIS', 'bright');
  log('='.repeat(70), 'bright');

  // Get theme settings
  const settings = await getThemeSettings();
  const current = settings.current || {};
  const sections = current.sections || {};
  const header = sections.header?.settings || {};

  console.log('\nCurrent Configuration:');
  console.log(`  Main Menu: ${header.main_linklist || '(not set)'}`);
  console.log(`  Secondary Menu: ${header.main_linklist2 || '(not set)'}`);
  console.log(`  Top Bar Menu: ${header.top_bar_menu || '(not set)'}`);
  console.log(`  Vertical Menu: ${header.vertical_menu ? 'Enabled' : 'Disabled'}`);
  console.log(`  Menu Position: ${header.menu_position || 'inline'}`);

  console.log('\nMega Menu Status:');
  for (let i = 1; i <= 5; i++) {
    const enabled = current[`mega_menu_${i}`] || false;
    const megaSec = sections[`mega-menu-${i}`] || {};
    const parent = megaSec.settings?.parent || '(not connected)';
    console.log(`  Mega Menu ${i}: ${enabled ? 'Enabled' : 'Disabled'} → Parent: ${parent}`);
  }

  return settings;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  log('\n' + '═'.repeat(70), 'bright');
  log('  MENU FIXER', 'bright');
  log('═'.repeat(70), 'bright');

  if (dryRun) {
    log('  Mode: DRY RUN (use --execute to apply changes)', 'yellow');
  } else {
    log('  Mode: EXECUTING CHANGES', 'green');
  }

  try {
    // Analyze current menus
    const settings = await analyzeCurrentMenus();

    // Assign menu handles to theme header
    await assignMenusToHeader(settings, dryRun);

    // Configure mega menus
    await configureMegaMenus(settings, dryRun);

    // Save all theme changes in one write
    if (!dryRun) {
      try {
        await updateThemeSettings(settings);
        log('\nAll theme settings applied successfully!', 'green');
      } catch (error) {
        log(`\nError updating theme settings: ${error.message}`, 'red');
      }
    }

    // Generate instructions
    await generateMenuInstructions();

    log('\n' + '='.repeat(70), 'bright');
    log('COMPLETE', 'bright');
    log('='.repeat(70), 'bright');

    if (dryRun) {
      log('\nRun with --execute to apply theme changes.', 'yellow');
    }

  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();

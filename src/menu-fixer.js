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

const BASE_URL = `https://${config.shopify.storeUrl}/admin/api/${config.shopify.apiVersion}`;
const THEME_ID = '140853018904'; // Active theme

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
  let cmd = `curl -s --max-time 60 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${config.shopify.accessToken}" `;
  cmd += `-H "Content-Type: application/json" `;

  if (body) {
    const escapedBody = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += `-d '${escapedBody}'`;
  }

  const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(result);
}

async function getThemeSettings() {
  log('\nFetching current theme settings...', 'cyan');

  const response = curlRequest(
    `${BASE_URL}/themes/${THEME_ID}/assets.json?asset%5Bkey%5D=config/settings_data.json`
  );

  return JSON.parse(response.asset.value);
}

async function updateThemeSettings(settings) {
  log('\nUpdating theme settings...', 'cyan');

  const response = curlRequest(
    `${BASE_URL}/themes/${THEME_ID}/assets.json`,
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
    // Update settings
    sections['mega-menu-1'] = megaMenu1Config;
    sections['mega-menu-2'] = megaMenu2Config;

    // Enable mega menus
    current.mega_menu_1 = true;
    current.mega_menu_2 = true;

    settings.current = current;
    settings.current.sections = sections;

    try {
      await updateThemeSettings(settings);
      log('\nMega menus configured successfully!', 'green');
    } catch (error) {
      log(`\nError updating settings: ${error.message}`, 'red');
    }
  }
}

async function generateMenuInstructions() {
  log('\n' + '='.repeat(70), 'bright');
  log('NAVIGATION MENU SETUP INSTRUCTIONS', 'bright');
  log('='.repeat(70), 'bright');

  const instructions = `
To complete the menu setup, go to Shopify Admin → Online Store → Navigation:

1. CREATE OR EDIT THE MAIN MENU (best-selling):
   ─────────────────────────────────────────────
   • Extraction & Packaging → /collections/extraction-packaging
   • Smoke & Vape → /collections/smoke-and-vape
     ├── Bongs & Water Pipes → /collections/bongs-water-pipes
     ├── Dab Rigs → /collections/dab-rigs
     ├── Hand Pipes → /collections/hand-pipes
     ├── Bubblers → /collections/bubblers
     ├── Nectar Collectors → /collections/nectar-collectors
     └── One Hitters & Chillums → /collections/one-hitters-chillums
   • Accessories → /collections/accessories
     ├── Quartz Bangers → /collections/quartz-bangers
     ├── Carb Caps → /collections/carb-caps
     ├── Dab Tools → /collections/dab-tools
     ├── Flower Bowls → /collections/flower-bowls
     ├── Ash Catchers → /collections/ash-catchers
     ├── Torches → /collections/torches
     ├── Grinders → /collections/grinders
     └── Rolling Papers → /collections/rolling-papers
   • Brands
     ├── Monark → /collections/monark
     ├── Zig Zag → /collections/zig-zag
     ├── Cookies → /collections/cookies
     ├── Maven → /collections/maven
     ├── Vibes → /collections/vibes
     └── RAW → /collections/raw
   • Clearance → /collections/clearance

2. UPDATE HOMEPAGE BUTTONS:
   ─────────────────────────
   • "Extraction & Packaging" button → /collections/extraction-packaging
   • "Smoke & Vape" button → /collections/smoke-and-vape

3. FIX BROKEN MENU LINKS:
   ───────────────────────
   Any menu items showing 404 should be updated to the collections above.

4. OPTIONAL - MEGA MENU SETUP:
   ───────────────────────────
   In Theme Customizer → Header → Mega Menus:
   • Enable Mega Menu 1
   • Set Parent to match "Smoke & Vape" menu handle
   • Configure columns with sub-menus
`;

  console.log(instructions);

  // Also save to a file
  const fs = await import('fs');
  fs.writeFileSync('/home/user/Shopify-Collection-strategy-and-menu-creation/MENU_SETUP_GUIDE.md', `# Menu Setup Guide\n${instructions}`);
  log('\nInstructions saved to MENU_SETUP_GUIDE.md', 'green');
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

    // Configure mega menus
    await configureMegaMenus(settings, dryRun);

    // Generate instructions
    await generateMenuInstructions();

    log('\n' + '='.repeat(70), 'bright');
    log('COMPLETE', 'bright');
    log('='.repeat(70), 'bright');

    if (dryRun) {
      log('\nRun with --execute to apply theme changes.', 'yellow');
      log('Manual navigation menu setup is required in Shopify Admin.', 'yellow');
    }

  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();

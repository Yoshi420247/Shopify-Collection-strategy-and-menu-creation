#!/usr/bin/env node
/**
 * Fix Homepage Buttons
 *
 * Updates the homepage banner buttons to link to the correct collections.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const THEME_ID = '140853018904';
const BASE_URL = `https://${STORE_URL}/admin/api/2024-01`;

async function main() {

  console.log('='.repeat(60));
  console.log('FIXING HOMEPAGE BUTTONS');
  console.log('='.repeat(60));

  // Step 1: Fetch current theme settings
  console.log('\n1. Fetching current theme settings...');
  const cmd1 = `curl -s --max-time 120 "${BASE_URL}/themes/${THEME_ID}/assets.json?asset%5Bkey%5D=config/settings_data.json" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}"`;

  let settingsResult;
  for (let i = 0; i < 4; i++) {
    try {
      const result = execSync(cmd1, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
      if (result && result.trim()) {
        settingsResult = JSON.parse(result);
        break;
      }
    } catch (e) {
      console.log(`   Retry ${i + 1}/4...`);
      execSync('sleep 3');
    }
  }

  if (!settingsResult?.asset?.value) {
    console.log('   ✗ Failed to fetch settings');
    return;
  }

  const settings = JSON.parse(settingsResult.asset.value);
  console.log('   ✓ Settings fetched');

  // Step 2: Update button links
  console.log('\n2. Updating button links...');
  const sections = settings.current?.sections || {};

  // Find and fix the main banner section
  let updated = false;
  for (const [sectionId, section] of Object.entries(sections)) {
    if (section.settings?.button1_link === 'shopify://collections/extraction-materials-packaging') {
      section.settings.button1_link = 'shopify://collections/extraction-packaging';
      console.log(`   ✓ Fixed button1_link in section ${sectionId}`);
      updated = true;
    }

    // Also check for any other broken links
    if (section.settings?.button1_link === 'shopify://collections/shop-all-what-you-need') {
      section.settings.button1_link = 'shopify://collections/all';
      console.log(`   ✓ Fixed button1_link (shop-all) in section ${sectionId}`);
      updated = true;
    }
  }

  if (!updated) {
    console.log('   No broken links found');
  }

  // Step 3: Upload updated settings
  console.log('\n3. Uploading updated settings...');
  const updatedSettingsStr = JSON.stringify(settings);
  const body = {
    asset: {
      key: 'config/settings_data.json',
      value: updatedSettingsStr
    }
  };

  fs.writeFileSync('/tmp/theme_update_body.json', JSON.stringify(body));

  const cmd2 = `curl -s --max-time 120 -X PUT "${BASE_URL}/themes/${THEME_ID}/assets.json" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" -H "Content-Type: application/json" -d @/tmp/theme_update_body.json`;

  for (let i = 0; i < 4; i++) {
    try {
      const result = execSync(cmd2, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
      if (result && result.trim() && !result.includes('upstream connect error')) {
        const parsed = JSON.parse(result);
        if (parsed.asset) {
          console.log('   ✓ Settings uploaded successfully');
          break;
        } else if (parsed.errors) {
          console.log(`   ✗ Error: ${JSON.stringify(parsed.errors)}`);
        }
      }
    } catch (e) {
      console.log(`   Retry ${i + 1}/4...`);
      execSync('sleep 5');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log('\nHomepage buttons should now link to:');
  console.log('  - SHOP PACKAGING & LAB -> /collections/extraction-packaging');
  console.log('  - SHOP SMOKESHOP GEAR -> /collections/smoke-and-vape');
}

main();

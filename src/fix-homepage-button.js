#!/usr/bin/env node
/**
 * Fix Homepage Button - Updates the Smoke & Vape button link
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const THEME_ID = '140853018904';

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

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

async function main() {
  console.log('=== FIXING HOMEPAGE SMOKE & VAPE BUTTON ===\n');

  // Get current theme settings
  console.log('1. Fetching current theme settings...');
  const settingsResponse = curlRequest(
    `${BASE_URL}/themes/${THEME_ID}/assets.json?asset%5Bkey%5D=config/settings_data.json`
  );

  const currentSettings = JSON.parse(settingsResponse.asset.value);

  // Update the button2_link
  console.log('2. Updating button2_link...');
  const sections = currentSettings.current?.sections || {};

  if (sections['1489283389016']) {
    const oldLink = sections['1489283389016'].settings.button2_link;
    sections['1489283389016'].settings.button2_link = 'shopify://collections/smoke-and-vape';
    console.log(`   Old value: "${oldLink}"`);
    console.log(`   New value: "shopify://collections/smoke-and-vape"`);
  } else {
    console.log('   Section not found!');
    return;
  }

  // Save to temp file
  const requestBody = {
    asset: {
      key: 'config/settings_data.json',
      value: JSON.stringify(currentSettings, null, 2)
    }
  };

  writeFileSync('/tmp/theme_update_request.json', JSON.stringify(requestBody));

  // Update theme
  console.log('3. Pushing update to Shopify...');
  const updateResponse = curlRequest(
    `${BASE_URL}/themes/${THEME_ID}/assets.json`,
    'PUT',
    '/tmp/theme_update_request.json'
  );

  if (updateResponse.asset) {
    console.log('\n✓ SUCCESS! Smoke & Vape button now links to /collections/smoke-and-vape');
  } else if (updateResponse.errors) {
    console.log('\n✗ Error:', updateResponse.errors);
  } else {
    console.log('\nResponse:', JSON.stringify(updateResponse, null, 2));
  }
}

main().catch(console.error);

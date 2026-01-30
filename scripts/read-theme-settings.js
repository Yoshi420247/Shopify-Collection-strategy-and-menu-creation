#!/usr/bin/env node
/**
 * Read and update theme settings for Quick Filters
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';
import { execSync } from 'child_process';
import { config } from '../src/config.js';

const THEME_ID = 140853018904;

async function getThemeAsset(key) {
  const encodedKey = encodeURIComponent(key);
  const url = `https://${config.shopify.storeUrl}/admin/api/${config.shopify.apiVersion}/themes/${THEME_ID}/assets.json?asset[key]=${encodedKey}`;

  const curlCmd = `curl -s --max-time 30 "${url}" -H "X-Shopify-Access-Token: ${config.shopify.accessToken}" -H "Content-Type: application/json"`;

  try {
    const result = execSync(curlCmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (error) {
    console.error('Error fetching asset:', error.message);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('READING THEME SETTINGS');
  console.log('='.repeat(60) + '\n');

  // Read settings_data.json to see current configuration
  const settings = await getThemeAsset('config/settings_data.json');

  if (settings && settings.asset) {
    const data = JSON.parse(settings.asset.value);
    console.log('Theme preset:', data.current || 'default');

    // Look for filter/quick filter related settings
    const currentSettings = data.current ? data.presets[data.current] : data;

    console.log('\nLooking for filter-related settings...');

    // Check for any settings containing 'filter' or 'quick'
    const settingsStr = JSON.stringify(currentSettings, null, 2);
    if (settingsStr.includes('filter') || settingsStr.includes('quick')) {
      console.log('Found filter-related settings');
    }

    // Output relevant section of settings
    if (currentSettings.sections) {
      for (const [key, section] of Object.entries(currentSettings.sections)) {
        if (key.includes('collection') || section.type?.includes('collection')) {
          console.log(`\nSection: ${key}`);
          console.log(JSON.stringify(section, null, 2).substring(0, 1000));
        }
      }
    }
  } else {
    console.log('Could not read settings');
  }
}

main().catch(console.error);

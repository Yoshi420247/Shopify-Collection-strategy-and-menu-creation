#!/usr/bin/env node
// ============================================================================
// Deploy NEWSMOKE30 Discount Promotion
//
// 1. Updates the header promo bar text to advertise NEWSMOKE30
// 2. Adds the welcome-discount-popup snippet to the theme
// 3. Injects the popup render tag into theme.liquid (before </body>)
// ============================================================================

import 'dotenv/config';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

function curlRequest(endpoint, method = 'GET', body = null) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}/${endpoint}`;
  const args = [
    'curl', '-s', '-g', '-X', method,
    '-H', `"X-Shopify-Access-Token: ${ACCESS_TOKEN}"`,
    '-H', '"Content-Type: application/json"',
  ];
  if (body) {
    const jsonStr = JSON.stringify(body).replace(/'/g, "'\\''");
    args.push('-d', `'${jsonStr}'`);
  }
  args.push(`"${url}"`);
  const cmd = args.join(' ');
  const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
  if (!result || result.trim() === '') return {};
  return JSON.parse(result);
}

function curlPutAsset(themeId, key, value) {
  const url = `${BASE_URL}/themes/${themeId}/assets.json`;
  const payload = JSON.stringify({ asset: { key, value } });
  // Write payload to temp file to avoid shell escaping issues with liquid templates
  const tmpFile = '/tmp/shopify_asset_payload.json';
  execSync(`cat > ${tmpFile} << 'ENDOFPAYLOAD'\n${payload}\nENDOFPAYLOAD`, { encoding: 'utf-8' });

  const cmd = `curl -s -X PUT -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" -H "Content-Type: application/json" -d @${tmpFile} "${url}"`;
  const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
  if (!result || result.trim() === '') return {};
  return JSON.parse(result);
}

// Step 1: Find the active/main theme
function getMainTheme() {
  console.log('\n--- Finding main theme ---');
  const data = curlRequest('themes.json');
  const themes = data.themes || [];
  const mainTheme = themes.find(t => t.role === 'main');
  if (!mainTheme) throw new Error('No main theme found');
  console.log(`  Main theme: "${mainTheme.name}" (ID: ${mainTheme.id})`);
  return mainTheme;
}

// Step 2: Update header promo text via theme settings
function updateHeaderPromo(themeId) {
  console.log('\n--- Updating header promo bar ---');

  // Get current settings_data.json
  const assetData = curlRequest(`themes/${themeId}/assets.json?asset[key]=config/settings_data.json`);
  const settingsRaw = assetData.asset?.value;
  if (!settingsRaw) throw new Error('Could not read settings_data.json');

  const settings = JSON.parse(settingsRaw);

  // Update the header promo text
  const newPromoText = '<p><strong>🔥 30% OFF Smoke Shop!</strong> Use code <strong>NEWSMOKE30</strong> at checkout &rarr; <a href="/collections/smoke-and-vape">Shop the Sale</a></p>';

  if (settings.current?.sections?.header?.settings) {
    const oldText = settings.current.sections.header.settings.promo_text;
    settings.current.sections.header.settings.promo_text = newPromoText;
    console.log(`  Old promo: "${oldText}"`);
    console.log(`  New promo: "${newPromoText}"`);
  } else {
    throw new Error('Could not find header settings in settings_data.json');
  }

  // Write it back
  const updatedSettingsStr = JSON.stringify(settings);
  curlPutAsset(themeId, 'config/settings_data.json', updatedSettingsStr);
  console.log('  Header promo bar updated!');
}

// Step 3: Upload the welcome popup snippet
function uploadPopupSnippet(themeId) {
  console.log('\n--- Uploading welcome-discount-popup snippet ---');

  const snippetPath = resolve(__dirname, '..', 'theme-files', 'snippets', 'welcome-discount-popup.liquid');
  const snippetContent = readFileSync(snippetPath, 'utf-8');

  curlPutAsset(themeId, 'snippets/welcome-discount-popup.liquid', snippetContent);
  console.log('  Snippet uploaded: snippets/welcome-discount-popup.liquid');
}

// Step 4: Inject popup render tag into theme.liquid (if not already present)
function injectPopupIntoTheme(themeId) {
  console.log('\n--- Injecting popup into theme.liquid ---');

  const assetData = curlRequest(`themes/${themeId}/assets.json?asset[key]=layout/theme.liquid`);
  let themeLiquid = assetData.asset?.value;
  if (!themeLiquid) throw new Error('Could not read layout/theme.liquid');

  const renderTag = "{% render 'welcome-discount-popup' %}";

  if (themeLiquid.includes('welcome-discount-popup')) {
    console.log('  Popup render tag already present in theme.liquid — skipping.');
    return;
  }

  // Insert before </body>
  const bodyCloseIndex = themeLiquid.lastIndexOf('</body>');
  if (bodyCloseIndex === -1) throw new Error('Could not find </body> in theme.liquid');

  themeLiquid = themeLiquid.slice(0, bodyCloseIndex) +
    `  ${renderTag}\n  ` +
    themeLiquid.slice(bodyCloseIndex);

  curlPutAsset(themeId, 'layout/theme.liquid', themeLiquid);
  console.log('  Popup render tag injected before </body>');
}

// Main
function main() {
  console.log('===========================================');
  console.log('  Deploying NEWSMOKE30 Promotion');
  console.log(`  Store: ${STORE_URL}`);
  console.log('===========================================');

  try {
    const theme = getMainTheme();

    updateHeaderPromo(theme.id);
    uploadPopupSnippet(theme.id);
    injectPopupIntoTheme(theme.id);

    console.log('\n===========================================');
    console.log('  DEPLOYMENT COMPLETE!');
    console.log('');
    console.log('  Header promo bar: Updated with NEWSMOKE30 ad');
    console.log('  Welcome popup: Deployed (shows once per session)');
    console.log('  Popup links to: /collections/smoke-and-vape');
    console.log('===========================================\n');
  } catch (error) {
    console.error('\nDeployment failed:', error.message);
    process.exit(1);
  }
}

main();

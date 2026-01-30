#!/usr/bin/env node
/**
 * Fix Main Menu Structure
 *
 * Removes Silicone Pipes and Novelty Pipes from top-level navigation
 * and includes them in the Smoke & Vape dropdown instead.
 */

import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const GRAPHQL_URL = `https://${STORE_URL}/admin/api/2024-01/graphql.json`;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function graphqlRequest(query, variables = {}, retries = 4) {
  const body = JSON.stringify({ query, variables });
  const escapedBody = body.replace(/'/g, "'\\''");
  const cmd = `curl -s --max-time 60 "${GRAPHQL_URL}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" -H "Content-Type: application/json" -d '${escapedBody}'`;

  for (let i = 0; i < retries; i++) {
    try {
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      if (result && !result.includes('upstream connect error') && result.trim()) {
        return JSON.parse(result);
      }
    } catch (e) {
      console.log(`  Retry ${i + 1}/${retries}...`);
    }
    if (i < retries - 1) {
      const delay = Math.pow(2, i + 1) * 1000;
      execSync(`sleep ${delay / 1000}`);
    }
  }
  return null;
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIXING MAIN MENU STRUCTURE');
  console.log('='.repeat(60));

  // Step 1: Delete all existing "best-selling" menus
  console.log('\n1. Finding and deleting existing best-selling menus...');
  const menusQuery = `{ menus(first: 50) { edges { node { id handle title } } } }`;
  const menusResult = graphqlRequest(menusQuery);

  if (menusResult?.data?.menus?.edges) {
    for (const edge of menusResult.data.menus.edges) {
      if (edge.node.handle.startsWith('best-selling')) {
        console.log(`   Deleting: ${edge.node.handle}`);
        const deleteMutation = `mutation { menuDelete(id: "${edge.node.id}") { userErrors { message } } }`;
        graphqlRequest(deleteMutation);
        await sleep(500);
      }
    }
  }

  await sleep(2000);

  // Step 2: Create new main menu with correct structure (no Silicone/Novelty at top level)
  console.log('\n2. Creating new main menu with correct structure...');

  const newMenuItems = [
    { title: 'Extraction & Packaging', url: '/collections/extraction-packaging', type: 'HTTP' },
    { title: 'Smoke & Vape', url: '/collections/smoke-and-vape', type: 'HTTP' },
    { title: 'Accessories', url: '/collections/accessories', type: 'HTTP' },
    { title: 'Brands', url: '#', type: 'HTTP' },
    { title: 'Clearance', url: '/collections/clearance', type: 'HTTP' },
  ];

  const createMutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }
  `;

  const createResult = graphqlRequest(createMutation, {
    title: 'Main Navigation',
    handle: 'best-selling',
    items: newMenuItems,
  });

  if (createResult?.data?.menuCreate?.menu) {
    console.log(`   ✓ Created: ${createResult.data.menuCreate.menu.handle}`);
  } else {
    console.log(`   ✗ Error: ${JSON.stringify(createResult)}`);
  }

  await sleep(1000);

  // Step 3: Update smoke-vape dropdown to include Silicone Pipes and Novelty Pipes
  console.log('\n3. Updating smoke-vape dropdown menu...');

  // Delete existing smoke-vape menu
  const smokeMenusResult = graphqlRequest(menusQuery);
  if (smokeMenusResult?.data?.menus?.edges) {
    for (const edge of smokeMenusResult.data.menus.edges) {
      if (edge.node.handle === 'smoke-vape') {
        console.log(`   Deleting old: ${edge.node.handle}`);
        graphqlRequest(`mutation { menuDelete(id: "${edge.node.id}") { userErrors { message } } }`);
        await sleep(500);
      }
    }
  }

  await sleep(1000);

  // Create updated smoke-vape dropdown with Silicone and Novelty Pipes
  const smokeVapeItems = [
    { title: 'Shop All Smoke & Vape', url: '/collections/smoke-and-vape', type: 'HTTP' },
    { title: 'Bongs & Water Pipes', url: '/collections/bongs-water-pipes', type: 'HTTP' },
    { title: 'Dab Rigs', url: '/collections/dab-rigs', type: 'HTTP' },
    { title: 'Hand Pipes', url: '/collections/hand-pipes', type: 'HTTP' },
    { title: 'Bubblers', url: '/collections/bubblers', type: 'HTTP' },
    { title: 'Nectar Collectors', url: '/collections/nectar-collectors', type: 'HTTP' },
    { title: 'One Hitters & Chillums', url: '/collections/one-hitters-chillums', type: 'HTTP' },
    { title: 'Steamrollers', url: '/collections/steamrollers', type: 'HTTP' },
    { title: 'Silicone Pipes', url: '/collections/silicone-pipes', type: 'HTTP' },
    { title: 'Novelty Pipes', url: '/collections/novelty-character-pipes', type: 'HTTP' },
  ];

  const smokeResult = graphqlRequest(createMutation, {
    title: 'Smoke & Vape Dropdown',
    handle: 'smoke-vape',
    items: smokeVapeItems,
  });

  if (smokeResult?.data?.menuCreate?.menu) {
    console.log(`   ✓ Created: smoke-vape with ${smokeVapeItems.length} items including Silicone & Novelty Pipes`);
  } else {
    console.log(`   ✗ Error: ${JSON.stringify(smokeResult)}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE - Menu restructured');
  console.log('='.repeat(60));
  console.log('\nMain menu now has:');
  console.log('  - Extraction & Packaging');
  console.log('  - Smoke & Vape (with dropdown containing Silicone & Novelty Pipes)');
  console.log('  - Accessories');
  console.log('  - Brands');
  console.log('  - Clearance');
}

main();

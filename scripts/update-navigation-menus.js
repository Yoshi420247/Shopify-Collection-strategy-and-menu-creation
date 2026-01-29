#!/usr/bin/env node
/**
 * Update Navigation Menus Script
 *
 * This script updates the Shopify store navigation menus to include
 * proper subcategories for all collections including Extraction & Packaging.
 *
 * Note: Shopify's Admin API has limited menu support. This script will:
 * 1. Attempt to update menus via API if supported
 * 2. Generate instructions for manual update if API is not supported
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';
import { config } from '../src/config.js';

// Menu structure to apply
const MENU_STRUCTURE = {
  'main-menu': {
    title: 'Main Menu',
    items: [
      { title: 'Shop All', url: '/collections/all' },
      {
        title: 'Extraction & Packaging',
        url: '/collections/extraction-packaging',
        items: [
          { title: 'Silicone Pads & Mats', url: '/collections/silicone-pads' },
          { title: 'Non-Stick FEP Sheets', url: '/collections/fep-sheets' },
          { title: 'PTFE Sheets & Rolls', url: '/collections/ptfe-sheets' },
          { title: 'Parchment Paper', url: '/collections/parchment-paper' },
          { title: 'Rosin Extraction', url: '/collections/rosin-extraction' },
          { title: 'Glass Jars', url: '/collections/glass-jars' },
          { title: 'Concentrate Containers', url: '/collections/concentrate-containers' },
          { title: 'Mylar Bags', url: '/collections/mylar-bags' },
          { title: 'Joint Tubes', url: '/collections/joint-tubes' },
          { title: 'Custom Packaging', url: '/collections/custom-packaging-options' },
          { title: 'Shop All', url: '/collections/extraction-packaging' },
        ],
      },
      {
        title: 'Smoke & Vape',
        url: '/collections/smoke-and-vape',
        items: [
          { title: 'Bongs & Water Pipes', url: '/collections/bongs-water-pipes' },
          { title: 'Dab Rigs', url: '/collections/dab-rigs' },
          { title: 'Hand Pipes', url: '/collections/hand-pipes' },
          { title: 'Bubblers', url: '/collections/bubblers' },
          { title: 'Nectar Collectors', url: '/collections/nectar-collectors' },
          { title: 'One Hitters & Chillums', url: '/collections/one-hitters-chillums' },
          { title: 'Silicone Pieces', url: '/collections/silicone-rigs-bongs' },
          { title: 'Shop All', url: '/collections/smoke-and-vape' },
        ],
      },
      {
        title: 'Accessories',
        url: '/collections/accessories',
        items: [
          { title: 'Quartz Bangers', url: '/collections/quartz-bangers' },
          { title: 'Carb Caps', url: '/collections/carb-caps' },
          { title: 'Dab Tools', url: '/collections/dab-tools' },
          { title: 'Flower Bowls', url: '/collections/flower-bowls' },
          { title: 'Ash Catchers', url: '/collections/ash-catchers' },
          { title: 'Torches', url: '/collections/torches' },
          { title: 'Grinders', url: '/collections/grinders' },
          { title: 'Rolling Papers & Cones', url: '/collections/rolling-papers' },
          { title: 'Vapes & Electronics', url: '/collections/vapes-electronics' },
          { title: 'Storage', url: '/collections/storage-containers' },
        ],
      },
      {
        title: 'Brands',
        url: '#',
        items: [
          { title: 'RAW', url: '/collections/raw' },
          { title: 'Zig Zag', url: '/collections/zig-zag' },
          { title: 'Vibes', url: '/collections/vibes' },
          { title: 'Elements', url: '/collections/elements' },
          { title: 'Cookies', url: '/collections/cookies' },
          { title: 'Monark', url: '/collections/monark' },
          { title: 'Maven', url: '/collections/maven' },
          { title: 'Oil Slick', url: '/collections/extraction-packaging' },
        ],
      },
      {
        title: 'Featured',
        url: '#',
        items: [
          { title: 'Heady Glass', url: '/collections/heady-glass' },
          { title: 'Made In USA', url: '/collections/made-in-usa' },
          { title: 'Novelty Pipes', url: '/collections/novelty-character-pipes' },
          { title: 'Travel Friendly', url: '/collections/travel-friendly' },
          { title: 'Clearance', url: '/collections/clearance' },
        ],
      },
    ],
  },
};

async function getExistingMenus() {
  console.log('Fetching existing menus...');

  const query = `
    query {
      menus(first: 50) {
        edges {
          node {
            id
            handle
            title
            itemsCount
          }
        }
      }
    }
  `;

  try {
    const result = await api.graphqlQuery(query, {});
    if (result.data && result.data.menus) {
      return result.data.menus.edges.map(e => e.node);
    }
    return [];
  } catch (error) {
    console.log('Could not fetch menus:', error.message);
    return [];
  }
}

async function updateMenuViaAPI(menuId, menuData) {
  // Try to use menuUpdate mutation
  const mutation = `
    mutation menuUpdate($id: ID!, $title: String, $handle: String) {
      menuUpdate(id: $id, title: $title, handle: $handle) {
        menu {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const result = await api.graphqlQuery(mutation, {
      id: menuId,
      title: menuData.title,
    });
    return result;
  } catch (error) {
    return { error: error.message };
  }
}

function generateManualInstructions() {
  console.log('\n' + '='.repeat(70));
  console.log('MANUAL MENU UPDATE INSTRUCTIONS');
  console.log('='.repeat(70));
  console.log('\nShopify navigation menus must be updated through the admin UI.');
  console.log('Go to: Online Store > Navigation in your Shopify admin.\n');

  for (const [handle, menu] of Object.entries(MENU_STRUCTURE)) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`MENU: ${menu.title} (${handle})`);
    console.log(`${'─'.repeat(60)}`);

    for (const item of menu.items) {
      console.log(`\n  ${item.title}`);
      console.log(`    URL: ${item.url}`);

      if (item.items && item.items.length > 0) {
        console.log('    Subcategories:');
        for (const subItem of item.items) {
          console.log(`      - ${subItem.title}: ${subItem.url}`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('QUICK COPY-PASTE LINKS');
  console.log('='.repeat(70));

  console.log('\n--- EXTRACTION & PACKAGING SUBMENU ---');
  const extractionItems = MENU_STRUCTURE['main-menu'].items.find(i => i.title === 'Extraction & Packaging');
  if (extractionItems && extractionItems.items) {
    for (const item of extractionItems.items) {
      console.log(`${item.title}: ${item.url}`);
    }
  }

  console.log('\n--- SMOKE & VAPE SUBMENU ---');
  const smokeItems = MENU_STRUCTURE['main-menu'].items.find(i => i.title === 'Smoke & Vape');
  if (smokeItems && smokeItems.items) {
    for (const item of smokeItems.items) {
      console.log(`${item.title}: ${item.url}`);
    }
  }

  console.log('\n--- ACCESSORIES SUBMENU ---');
  const accessoriesItems = MENU_STRUCTURE['main-menu'].items.find(i => i.title === 'Accessories');
  if (accessoriesItems && accessoriesItems.items) {
    for (const item of accessoriesItems.items) {
      console.log(`${item.title}: ${item.url}`);
    }
  }

  console.log('\n--- BRANDS SUBMENU ---');
  const brandsItems = MENU_STRUCTURE['main-menu'].items.find(i => i.title === 'Brands');
  if (brandsItems && brandsItems.items) {
    for (const item of brandsItems.items) {
      console.log(`${item.title}: ${item.url}`);
    }
  }

  console.log('\n--- FEATURED SUBMENU ---');
  const featuredItems = MENU_STRUCTURE['main-menu'].items.find(i => i.title === 'Featured');
  if (featuredItems && featuredItems.items) {
    for (const item of featuredItems.items) {
      console.log(`${item.title}: ${item.url}`);
    }
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('NAVIGATION MENU UPDATE SCRIPT');
  console.log('='.repeat(70));
  console.log(`Store: ${config.shopify.storeUrl}`);
  console.log('');

  // Get existing menus
  const existingMenus = await getExistingMenus();

  if (existingMenus.length > 0) {
    console.log('\nExisting menus:');
    for (const menu of existingMenus) {
      console.log(`  - ${menu.title} (${menu.handle}): ${menu.itemsCount} items`);
    }
  }

  // Generate manual instructions since Shopify API has limited menu editing
  generateManualInstructions();

  console.log('\n' + '='.repeat(70));
  console.log('COMPLETE - Follow the instructions above to update menus');
  console.log('='.repeat(70));
}

main().catch(console.error);

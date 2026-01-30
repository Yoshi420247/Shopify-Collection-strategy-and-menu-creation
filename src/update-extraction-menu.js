/**
 * Update Extraction & Packaging Menu
 *
 * Adds missing packaging collections to the dropdown menu
 */

import 'dotenv/config';
import * as api from './shopify-api.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(70));
  console.log('UPDATE EXTRACTION & PACKAGING MENU');
  console.log('='.repeat(70));

  // New menu items - comprehensive list of packaging collections
  const newItems = [
    { title: 'Shop All Extraction', url: '/collections/extraction-packaging', type: 'HTTP' },
    { title: 'Silicone Pads & Mats', url: '/collections/silicone-pads', type: 'HTTP' },
    { title: 'FEP Sheets & Rolls', url: '/collections/fep-sheets', type: 'HTTP' },
    { title: 'PTFE Sheets & Rolls', url: '/collections/ptfe-sheets', type: 'HTTP' },
    { title: 'Parchment Paper', url: '/collections/parchment-paper', type: 'HTTP' },
    { title: 'Glass Jars', url: '/collections/glass-jars', type: 'HTTP' },
    { title: 'Concentrate Containers', url: '/collections/concentrate-containers', type: 'HTTP' },
    { title: 'Storage & Containers', url: '/collections/storage-containers', type: 'HTTP' },
    { title: 'Rosin Extraction', url: '/collections/rosin-extraction', type: 'HTTP' },
    { title: 'Custom Packaging', url: '/collections/custom-packaging-options', type: 'HTTP' }
  ];

  // Get current menu
  const query = `{
    menus(first: 50) {
      nodes {
        id
        title
        handle
      }
    }
  }`;

  const result = await api.graphqlQuery(query);
  const menus = result.data?.menus?.nodes || [];
  const extractionMenu = menus.find(m => m.handle === 'extraction-packaging');

  if (!extractionMenu) {
    console.log('Extraction & Packaging menu not found!');
    return;
  }

  console.log('\nFound menu:', extractionMenu.title);
  console.log('Deleting and recreating with updated items...\n');

  // Delete old menu
  const deleteMutation = `mutation { menuDelete(id: "${extractionMenu.id}") { deletedMenuId userErrors { message } } }`;
  await api.graphqlQuery(deleteMutation);
  await sleep(500);

  // Create new menu with all items
  const createMutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { message }
      }
    }
  `;

  const createResult = await api.graphqlQuery(createMutation, {
    title: 'Extraction & Packaging Dropdown',
    handle: 'extraction-packaging',
    items: newItems
  });

  if (createResult.data?.menuCreate?.menu) {
    console.log('✓ Menu recreated successfully');
    console.log('\nNew menu items:');
    newItems.forEach(item => {
      console.log('  -', item.title, '->', item.url);
    });
  } else {
    console.log('✗ Error:', JSON.stringify(createResult.data?.menuCreate?.userErrors || createResult.errors));
  }
}

main().catch(console.error);

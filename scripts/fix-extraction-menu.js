import 'dotenv/config';
import * as api from '../src/shopify-api.js';

/**
 * Fix Extraction Menu - Consolidate Redundant Collections
 *
 * Problem: Glass Jars, Concentrate Containers, Storage & Containers all show same products
 * Solution: Use distinct collections and update menus
 */

async function fixExtractionMenu() {
  console.log('Fixing Extraction & Packaging menu...\n');

  // Step 1: Get the extraction-packaging menu
  const menuQuery = `
    query {
      menus(first: 50) {
        nodes {
          id
          title
          handle
          items {
            id
            title
            url
          }
        }
      }
    }
  `;

  const menuResult = await api.graphqlQuery(menuQuery, {});
  const extractionMenu = menuResult.data?.menus?.nodes?.find(m => m.handle === 'extraction-packaging');

  if (!extractionMenu) {
    console.log('Extraction menu not found');
    return;
  }

  console.log('Current menu items:');
  for (const item of extractionMenu.items) {
    console.log(`  - ${item.title}: ${item.url}`);
  }

  // Step 2: Delete the old menu
  const deleteMenuMutation = `
    mutation menuDelete($id: ID!) {
      menuDelete(id: $id) {
        deletedMenuId
        userErrors {
          field
          message
        }
      }
    }
  `;

  await api.graphqlQuery(deleteMenuMutation, { id: extractionMenu.id });
  console.log('\nDeleted old menu');

  // Step 3: Create new menu with consolidated structure
  const newMenuItems = [
    { title: 'Shop All Extraction & Packaging', url: '/collections/extraction-packaging' },
    { title: 'Concentrate Jars', url: '/collections/concentrate-jars' },
    { title: 'Silicone Containers', url: '/collections/non-stick-containers' },
    { title: 'Parchment Paper & PTFE', url: '/collections/parchment-paper' },
    { title: 'Rosin Extraction Materials', url: '/collections/rosin-extraction' },
    { title: 'Mylar Bags', url: '/collections/mylar-bags' },
  ];

  const createMenuMutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu {
          id
          title
          handle
          items {
            title
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const createResult = await api.graphqlQuery(createMenuMutation, {
    title: 'Extraction & Packaging Dropdown',
    handle: 'extraction-packaging',
    items: newMenuItems.map(item => ({
      title: item.title,
      url: item.url,
      type: 'HTTP'
    }))
  });

  if (createResult.data?.menuCreate?.userErrors?.length > 0) {
    console.log('Errors:', createResult.data.menuCreate.userErrors);
  } else {
    console.log('\nCreated new menu:');
    for (const item of createResult.data?.menuCreate?.menu?.items || []) {
      console.log(`  - ${item.title}: ${item.url}`);
    }
  }

  // Step 4: Create redirects for removed collections
  const redirects = [
    { from: '/collections/glass-jars', to: '/collections/concentrate-jars' },
    { from: '/collections/concentrate-containers', to: '/collections/concentrate-jars' },
    { from: '/collections/storage-containers', to: '/collections/concentrate-jars' },
  ];

  console.log('\nCreating redirects for removed collections:');
  for (const redirect of redirects) {
    try {
      await api.post('redirects.json', {
        redirect: {
          path: redirect.from,
          target: redirect.to
        }
      });
      console.log(`  OK: ${redirect.from} -> ${redirect.to}`);
    } catch (err) {
      if (err.message.includes('already been taken')) {
        console.log(`  SKIP: ${redirect.from} (redirect exists)`);
      } else {
        console.log(`  FAIL: ${redirect.from} - ${err.message}`);
      }
    }
  }

  // Step 5: Verify rosin-extraction collection
  const rosinQuery = `
    query {
      collectionByHandle(handle: "rosin-extraction") {
        title
        productsCount { count }
        products(first: 10) {
          nodes {
            title
          }
        }
      }
    }
  `;

  const rosinResult = await api.graphqlQuery(rosinQuery, {});
  console.log('\nRosin Extraction collection:');
  console.log(`  Products: ${rosinResult.data?.collectionByHandle?.productsCount?.count}`);
  for (const p of rosinResult.data?.collectionByHandle?.products?.nodes || []) {
    console.log(`    - ${p.title}`);
  }

  console.log('\n=== DONE ===');
  console.log('Menu consolidated from 4 redundant collections to distinct categories');
}

fixExtractionMenu();

#!/usr/bin/env node
/**
 * Create a Quick Filters menu with all the filter collection links
 * This menu can be used in the theme's collection sidebar
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// Define the quick filter menu structure
const QUICK_FILTER_ITEMS = [
  // Price Filters
  { title: 'Under $25', url: '/collections/under-25' },
  { title: 'Under $50', url: '/collections/under-50' },
  { title: 'Under $100', url: '/collections/under-100' },
  { title: '$100+', url: '/collections/premium-100-plus' },

  // Special Filters
  { title: 'Best Sellers', url: '/collections/best-sellers' },
  { title: 'New Arrivals', url: '/collections/new-arrivals' },
  { title: 'On Sale', url: '/collections/on-sale' },

  // Material Filters
  { title: 'Glass', url: '/collections/glass-products' },
  { title: 'Silicone', url: '/collections/silicone-products' },
  { title: 'Quartz', url: '/collections/quartz-products' },

  // Use/Intent Filters
  { title: 'For Flower', url: '/collections/for-flower' },
  { title: 'For Dabbing', url: '/collections/for-dabbing' },
  { title: 'Rolling Supplies', url: '/collections/for-rolling' },

  // Product Type Filters
  { title: 'All Pipes', url: '/collections/all-pipes' },
  { title: 'All Bongs', url: '/collections/all-bongs' },
  { title: 'All Rigs', url: '/collections/all-rigs' },
  { title: 'All Accessories', url: '/collections/all-accessories' },
];

async function main() {
  console.log('='.repeat(60));
  console.log('CREATING QUICK FILTERS MENU');
  console.log('='.repeat(60) + '\n');

  // First, check existing menus
  const menuQuery = `
    query {
      menus(first: 20) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `;

  const menuResult = await api.graphqlQuery(menuQuery, {});
  const existingMenus = menuResult.data?.menus?.edges || [];

  console.log('Existing menus:');
  for (const edge of existingMenus) {
    console.log(`  - ${edge.node.title} (${edge.node.handle})`);
  }

  // Check if quick-filters menu exists
  const quickFiltersMenu = existingMenus.find(e => e.node.handle === 'quick-filters');

  if (quickFiltersMenu) {
    console.log('\nQuick Filters menu already exists. Updating...');

    // Delete existing menu items and recreate
    const deleteQuery = `
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

    await api.graphqlQuery(deleteQuery, { id: quickFiltersMenu.node.id });
    console.log('Deleted old menu');
  }

  // Create new Quick Filters menu
  console.log('\nCreating Quick Filters menu...');

  const createMenuMutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
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

  const menuItems = QUICK_FILTER_ITEMS.map(item => ({
    title: item.title,
    url: `https://oilslickpad.com${item.url}`,
    type: 'HTTP'
  }));

  const createResult = await api.graphqlQuery(createMenuMutation, {
    title: 'Quick Filters',
    handle: 'quick-filters',
    items: menuItems
  });

  if (createResult.data?.menuCreate?.menu) {
    console.log('[SUCCESS] Menu created:', createResult.data.menuCreate.menu.handle);
  } else if (createResult.data?.menuCreate?.userErrors?.length > 0) {
    console.log('[ERROR]', createResult.data.menuCreate.userErrors);
  } else {
    console.log('Result:', JSON.stringify(createResult, null, 2));
  }

  // Also create separate category menus for organized display
  const categoryMenus = [
    {
      handle: 'filter-by-price',
      title: 'Filter by Price',
      items: [
        { title: 'Under $25', url: '/collections/under-25' },
        { title: 'Under $50', url: '/collections/under-50' },
        { title: 'Under $100', url: '/collections/under-100' },
        { title: '$100+', url: '/collections/premium-100-plus' },
      ]
    },
    {
      handle: 'filter-by-material',
      title: 'Filter by Material',
      items: [
        { title: 'Glass', url: '/collections/glass-products' },
        { title: 'Silicone', url: '/collections/silicone-products' },
        { title: 'Quartz', url: '/collections/quartz-products' },
      ]
    },
    {
      handle: 'filter-by-use',
      title: 'Shop by Use',
      items: [
        { title: 'For Flower', url: '/collections/for-flower' },
        { title: 'For Dabbing', url: '/collections/for-dabbing' },
        { title: 'Rolling', url: '/collections/for-rolling' },
      ]
    },
    {
      handle: 'shop-by-type',
      title: 'Shop by Type',
      items: [
        { title: 'Pipes', url: '/collections/all-pipes' },
        { title: 'Bongs', url: '/collections/all-bongs' },
        { title: 'Dab Rigs', url: '/collections/all-rigs' },
        { title: 'Accessories', url: '/collections/all-accessories' },
      ]
    }
  ];

  console.log('\nCreating category filter menus...');

  for (const menuDef of categoryMenus) {
    // Check if exists
    const existing = existingMenus.find(e => e.node.handle === menuDef.handle);
    if (existing) {
      await api.graphqlQuery(`
        mutation menuDelete($id: ID!) {
          menuDelete(id: $id) { deletedMenuId }
        }
      `, { id: existing.node.id });
    }

    const items = menuDef.items.map(item => ({
      title: item.title,
      url: `https://oilslickpad.com${item.url}`,
      type: 'HTTP'
    }));

    const result = await api.graphqlQuery(createMenuMutation, {
      title: menuDef.title,
      handle: menuDef.handle,
      items: items
    });

    if (result.data?.menuCreate?.menu) {
      console.log(`  [SUCCESS] ${menuDef.title}`);
    } else {
      console.log(`  [ERROR] ${menuDef.title}:`, result.data?.menuCreate?.userErrors);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('MENUS CREATED');
  console.log('='.repeat(60));
  console.log(`
The following menus are now available in your Shopify Admin:

1. quick-filters       - All quick filter links in one menu
2. filter-by-price     - Price range filters
3. filter-by-material  - Material filters (Glass, Silicone, Quartz)
4. filter-by-use       - Use-based filters (Flower, Dabbing, Rolling)
5. shop-by-type        - Product type filters

To use these in your theme:
1. Go to Online Store > Themes > Customize
2. Find the collection template sidebar section
3. Add a "Navigation" or "Menu" block
4. Select one of the filter menus above

Or use the Liquid code:
{% render 'menu', menu: linklists['quick-filters'] %}
  `);
}

main().catch(console.error);

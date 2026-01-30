/**
 * Remove RAW from Navigation Menus
 *
 * Since there are no actual RAW brand products in the store,
 * remove RAW from all navigation menus.
 */

import 'dotenv/config';
import * as api from './shopify-api.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(70));
  console.log('REMOVE RAW FROM NAVIGATION MENUS');
  console.log('='.repeat(70));

  // Get all menus
  const query = `{
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
  }`;

  const result = await api.graphqlQuery(query);
  const menus = result.data?.menus?.nodes || [];

  // Find menus that have RAW
  const menusWithRaw = menus.filter(m =>
    m.items.some(item => item.title.toUpperCase() === 'RAW')
  );

  console.log('\nMenus containing RAW:', menusWithRaw.length);
  menusWithRaw.forEach(m => {
    console.log('  -', m.title, '(handle:', m.handle + ')');
  });

  // Remove RAW from each menu
  for (const menu of menusWithRaw) {
    console.log('\nRemoving RAW from', menu.title + '...');

    // Get items without RAW
    const newItems = menu.items
      .filter(item => item.title.toUpperCase() !== 'RAW')
      .map(item => ({
        title: item.title,
        url: item.url,
        type: 'HTTP'
      }));

    // Delete old menu
    const deleteMutation = `mutation { menuDelete(id: "${menu.id}") { deletedMenuId userErrors { message } } }`;
    await api.graphqlQuery(deleteMutation);
    await sleep(500);

    // Recreate menu without RAW
    const createMutation = `
      mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) {
          menu { id handle title }
          userErrors { message }
        }
      }
    `;

    const createResult = await api.graphqlQuery(createMutation, {
      title: menu.title,
      handle: menu.handle,
      items: newItems
    });

    if (createResult.data?.menuCreate?.menu) {
      console.log('  ✓ Recreated without RAW');
    } else {
      console.log('  ✗ Error:', JSON.stringify(createResult.data?.menuCreate?.userErrors || createResult.errors));
    }

    await sleep(500);
  }

  console.log('\n' + '='.repeat(70));
  console.log('DONE');
  console.log('='.repeat(70));
}

main().catch(console.error);

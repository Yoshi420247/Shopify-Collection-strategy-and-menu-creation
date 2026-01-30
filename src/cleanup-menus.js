/**
 * Cleanup Duplicate and Unused Menus
 */

import 'dotenv/config';
import * as api from './shopify-api.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(70));
  console.log('CLEANUP DUPLICATE AND UNUSED MENUS');
  console.log('='.repeat(70));

  // Get all menus
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

  console.log(`\nFound ${menus.length} menus total\n`);

  // Find duplicate Smoke & Vape menus (keep smoke-vape, delete numbered ones)
  const duplicateSmokeVape = menus.filter(m =>
    m.handle.startsWith('smoke-vape-menu-')
  );

  console.log('Duplicate Smoke & Vape menus to delete:');
  duplicateSmokeVape.forEach(m => console.log('  -', m.handle));

  // Also find other unused/empty menus
  const unusedMenus = menus.filter(m =>
    ['on-sale', 'pads', 'non-stick-paper-ptfe'].includes(m.handle)
  );

  console.log('\nUnused/empty menus to delete:');
  unusedMenus.forEach(m => console.log('  -', m.handle));

  // Delete duplicate menus
  const toDelete = [...duplicateSmokeVape, ...unusedMenus];
  console.log(`\nDeleting ${toDelete.length} menus...\n`);

  let deleted = 0;
  let failed = 0;

  for (const menu of toDelete) {
    const deleteMutation = `mutation { menuDelete(id: "${menu.id}") { deletedMenuId userErrors { message } } }`;

    try {
      const deleteResult = await api.graphqlQuery(deleteMutation);
      if (deleteResult.data?.menuDelete?.deletedMenuId) {
        console.log('✓ Deleted:', menu.handle);
        deleted++;
      } else if (deleteResult.data?.menuDelete?.userErrors?.length > 0) {
        console.log('✗ Error:', menu.handle, '-', deleteResult.data.menuDelete.userErrors[0].message);
        failed++;
      } else {
        console.log('? Unknown result for', menu.handle);
        failed++;
      }
      await sleep(500);
    } catch (e) {
      console.log('✗ Error:', menu.handle, '-', e.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Deleted: ${deleted}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);

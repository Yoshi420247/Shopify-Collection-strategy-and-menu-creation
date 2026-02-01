import 'dotenv/config';
import * as api from '../src/shopify-api.js';

/**
 * Fix Glass Jars Collection
 * - Update product types to "glass jar" for all glass jar products
 * - Ensure collection includes all glass jars (including flower jars)
 */

async function fixGlassJars() {
  console.log('Finding glass jar products with wrong product type...\n');

  // Find products that should be glass jars
  const query = `
    query {
      products(first: 50, query: "jar OR Jar") {
        nodes {
          id
          title
          productType
        }
      }
    }
  `;

  const result = await api.graphqlQuery(query, {});
  const products = result.data?.products?.nodes || [];

  // Filter to jars that need fixing
  const jarsToFix = products.filter(p => {
    const isJar = p.title.toLowerCase().includes('jar') &&
                  (p.title.toLowerCase().includes('glass') ||
                   p.title.toLowerCase().includes('ml') ||
                   p.title.toLowerCase().includes('oz') ||
                   p.title.toLowerCase().includes('child-resistant'));
    const needsFix = p.productType !== 'glass jar';
    return isJar && needsFix;
  });

  if (jarsToFix.length === 0) {
    console.log('All glass jars already have correct product type');
  } else {
    console.log(`Found ${jarsToFix.length} jars to fix:\n`);

    for (const p of jarsToFix) {
      console.log(`${p.title}`);
      console.log(`  Current type: '${p.productType}'`);

      const mutation = `
        mutation updateProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id title productType }
            userErrors { field message }
          }
        }
      `;

      const updateResult = await api.graphqlQuery(mutation, {
        input: {
          id: p.id,
          productType: 'glass jar'
        }
      });

      if (updateResult.data?.productUpdate?.userErrors?.length > 0) {
        console.log(`  ERROR: ${updateResult.data.productUpdate.userErrors[0].message}`);
      } else {
        console.log(`  FIXED -> glass jar`);
      }
      console.log('');
    }
  }

  // Verify the collection
  console.log('\n--- Verifying Glass Jars Collection ---\n');

  const colQuery = `
    query {
      collectionByHandle(handle: "concentrate-jars") {
        title
        productsCount { count }
        products(first: 30) {
          nodes {
            title
          }
        }
      }
    }
  `;

  const colResult = await api.graphqlQuery(colQuery, {});
  const col = colResult.data?.collectionByHandle;

  console.log(`Collection: ${col?.title}`);
  console.log(`Products: ${col?.productsCount?.count}\n`);
  console.log('Products included:');
  for (const p of col?.products?.nodes || []) {
    console.log(`  - ${p.title}`);
  }
}

fixGlassJars();

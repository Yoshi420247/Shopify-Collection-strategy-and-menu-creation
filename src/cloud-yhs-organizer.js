// Cloud YHS Product Collection Organizer
// Fetches Cloud YHS products from Shopify and assigns proper collection tags
// This script fixes tag mappings to ensure products appear in the right collections
import 'dotenv/config';
import { getAllProductsByVendor, updateProduct, getCollections, createSmartCollection, getProducts } from './shopify-api.js';

const DRY_RUN = process.argv.includes('--dry-run');
const EXECUTE = process.argv.includes('--execute');
const PUBLISH = process.argv.includes('--publish');  // Also publish draft products
const LIST_ALL = process.argv.includes('--list');    // List all products from any vendor

// Tag mappings to fix: OLD TAG -> NEW TAG (correcting importer tags to match collection rules)
const TAG_CORRECTIONS = {
  'family:bong': 'family:glass-bong',
  'family:pipe': 'family:spoon-pipe',
  'family:bowl': 'family:flower-bowl',
  'family:battery': 'family:vape-battery',
  'family:ashtray': 'family:storage-accessory',
  'pillar:water-pipe': 'pillar:smokeshop-device',
  'pillar:hand-pipe': 'pillar:smokeshop-device',
};

// Product categorization rules based on product name patterns
// These use the CORRECT tags that match the collection rules in config.js
const categoryRules = [
  // Water Pipes / Bongs
  {
    pattern: /water pipe/i,
    family: 'glass-bong',
    pillar: 'smokeshop-device',
    use: 'flower-smoking'
  },
  // Hand Pipes
  {
    pattern: /hand pipe|glass pipe|straight tube glass pipe/i,
    family: 'spoon-pipe',
    pillar: 'smokeshop-device',
    use: 'flower-smoking'
  },
  // Bubblers
  {
    pattern: /bubbler/i,
    family: 'bubbler',
    pillar: 'smokeshop-device',
    use: 'flower-smoking'
  },
  // Nectar Collectors
  {
    pattern: /nectar collector/i,
    family: 'nectar-collector',
    pillar: 'smokeshop-device',
    use: 'dabbing'
  },
  // Dab Tools
  {
    pattern: /dab tool/i,
    family: 'dab-tool',
    pillar: 'accessory',
    use: 'dabbing'
  },
  // Roach Clips (categorize as dab tools/accessories)
  {
    pattern: /roach clip/i,
    family: 'dab-tool',
    pillar: 'accessory',
    use: 'flower-smoking'
  },
  // Flower Bowls
  {
    pattern: /glass bowl|holes glass bowl/i,
    family: 'flower-bowl',
    pillar: 'accessory',
    use: 'flower-smoking'
  },
  // Vape Batteries/CBD devices
  {
    pattern: /CBD battery device|battery device|vape/i,
    family: 'vape-battery',
    pillar: 'smokeshop-device',
    use: 'vaping'
  },
  // Storage / Containers
  {
    pattern: /jar|ashtray/i,
    family: 'storage-accessory',
    pillar: 'accessory',
    use: 'storage'
  },
];

// Material detection rules
const materialRules = [
  { pattern: /silicone/i, material: 'silicone' },
  { pattern: /pvc/i, material: 'pvc' },
  { pattern: /glass/i, material: 'glass' },
  { pattern: /plastic/i, material: 'plastic' },
  { pattern: /steel|metal/i, material: 'metal' },
];

// Style detection rules
const styleRules = [
  { pattern: /\b(cat|dog|husky|pug|bulldog|lion|gorilla|beaver|penguin|duck|dolphin|shark|octopus)\b/i, style: 'animal' },
  { pattern: /\b(mario|sonic|yoda|rick|kenny|homer|marge|kuromi|kitty|minnie|scooby|spider-man|labubu)\b/i, style: 'character' },
  { pattern: /\b(skull|zombie|witch|ghost|mummy|headless|corpse)\b/i, style: 'halloween' },
  { pattern: /\b(soccer|baseball|sports|messi)\b/i, style: 'sports' },
];

function correctTag(tag) {
  // Apply tag corrections if needed
  return TAG_CORRECTIONS[tag] || tag;
}

function categorizeProduct(product) {
  const title = product.title || '';
  const description = product.body_html || '';
  const fullText = `${title} ${description}`;

  const result = {
    id: product.id,
    title: product.title,
    status: product.status || 'active',
    currentTags: product.tags ? product.tags.split(', ').filter(t => t) : [],
    newTags: [],
    category: null,
    needsTagCorrection: false,
  };

  // Check if existing tags need correction
  for (const tag of result.currentTags) {
    if (TAG_CORRECTIONS[tag]) {
      result.needsTagCorrection = true;
      break;
    }
  }

  // Find product category based on title/description
  for (const rule of categoryRules) {
    if (rule.pattern.test(fullText)) {
      result.category = rule;
      result.newTags.push(`family:${rule.family}`);
      result.newTags.push(`pillar:${rule.pillar}`);
      if (rule.use) {
        result.newTags.push(`use:${rule.use}`);
      }
      break;
    }
  }

  // Detect material
  for (const rule of materialRules) {
    if (rule.pattern.test(fullText)) {
      result.newTags.push(`material:${rule.material}`);
      break;
    }
  }

  // Detect style
  for (const rule of styleRules) {
    if (rule.pattern.test(fullText)) {
      result.newTags.push(`style:${rule.style}`);
    }
  }

  // Always add vendor tag
  result.newTags.push('vendor:cloud-yhs');

  return result;
}

function mergeTags(currentTags, newTags) {
  const tagSet = new Set();

  // First, correct any existing tags that need fixing
  for (const tag of currentTags) {
    const correctedTag = correctTag(tag);
    tagSet.add(correctedTag);
  }

  // Add new tags that don't conflict with existing namespace tags
  for (const newTag of newTags) {
    const [namespace] = newTag.split(':');

    // Remove any existing tag with the same namespace (except for style which can have multiple)
    if (namespace !== 'style') {
      for (const existingTag of tagSet) {
        if (existingTag.startsWith(`${namespace}:`)) {
          tagSet.delete(existingTag);
        }
      }
    }

    tagSet.add(newTag);
  }

  return Array.from(tagSet);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Cloud YHS Product Collection Organizer');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  } else if (EXECUTE) {
    console.log('\n🚀 EXECUTE MODE - Changes will be applied to Shopify\n');
    if (PUBLISH) {
      console.log('   📢 PUBLISH MODE - Draft products will be published\n');
    }
  } else {
    console.log('\n📋 ANALYSIS MODE - Run with --execute to apply changes\n');
  }

  // Fetch all Cloud YHS products
  console.log('Fetching Cloud YHS products from Shopify...');
  let products;

  try {
    products = await getAllProductsByVendor('Cloud YHS');
  } catch (error) {
    console.error('Failed to fetch Cloud YHS products:', error.message);
    console.log('\nTrying alternative fetch method...');

    // Try fetching all products and filtering
    const allProductsResult = await getProducts({ limit: 250, status: 'any' });
    const allProducts = allProductsResult.products || [];
    products = allProducts.filter(p => p.vendor === 'Cloud YHS');
  }

  console.log(`Found ${products.length} Cloud YHS products\n`);

  if (products.length === 0) {
    console.log('No Cloud YHS products found in Shopify.');
    console.log('\nThis could mean:');
    console.log('  1. Products haven\'t been imported yet');
    console.log('  2. Products are still in draft status');
    console.log('  3. The API credentials don\'t have access to draft products');
    console.log('\nTo import products, run: python tools/cloud_yhs_importer.py');
    return;
  }

  // Show status breakdown
  const statusCounts = {};
  for (const p of products) {
    const status = p.status || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  console.log('Product status breakdown:');
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log('');

  // Categorize all products
  console.log('Analyzing products...\n');
  const categorized = products.map(categorizeProduct);

  // Group by category for reporting
  const byCategory = {};
  const uncategorized = [];

  for (const item of categorized) {
    if (item.category) {
      const family = item.category.family;
      if (!byCategory[family]) {
        byCategory[family] = [];
      }
      byCategory[family].push(item);
    } else {
      uncategorized.push(item);
    }
  }

  // Print categorization report
  console.log('='.repeat(60));
  console.log('CATEGORIZATION REPORT');
  console.log('='.repeat(60));

  for (const [family, items] of Object.entries(byCategory).sort()) {
    console.log(`\n📦 ${family.toUpperCase()} (${items.length} products)`);
    console.log('-'.repeat(40));
    for (const item of items) {
      console.log(`  • ${item.title}`);
      console.log(`    Tags: ${item.newTags.join(', ')}`);
    }
  }

  if (uncategorized.length > 0) {
    console.log(`\n⚠️  UNCATEGORIZED (${uncategorized.length} products)`);
    console.log('-'.repeat(40));
    for (const item of uncategorized) {
      console.log(`  • ${item.title}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total products: ${products.length}`);
  console.log(`Categorized: ${categorized.length - uncategorized.length}`);
  console.log(`Uncategorized: ${uncategorized.length}`);
  console.log('\nCategories breakdown:');
  for (const [family, items] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${family}: ${items.length}`);
  }

  // Execute updates if requested
  if (EXECUTE) {
    console.log('\n' + '='.repeat(60));
    console.log('APPLYING CHANGES TO SHOPIFY');
    console.log('='.repeat(60));

    let updated = 0;
    let published = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of categorized) {
      if (item.newTags.length === 0) {
        skipped++;
        continue;
      }

      const mergedTags = mergeTags(item.currentTags, item.newTags);
      const tagsString = mergedTags.join(', ');

      // Check if tags actually changed
      const currentTagsString = item.currentTags.sort().join(', ');
      const newTagsString = mergedTags.sort().join(', ');
      const tagsChanged = currentTagsString !== newTagsString;
      const needsPublish = PUBLISH && item.status === 'draft';

      if (!tagsChanged && !needsPublish) {
        console.log(`⏭️  Skipping "${item.title}" - no changes needed`);
        skipped++;
        continue;
      }

      console.log(`\n🔄 Updating "${item.title}"...`);
      if (tagsChanged) {
        console.log(`   Current tags: ${item.currentTags.join(', ') || '(none)'}`);
        console.log(`   New tags: ${tagsString}`);
      }
      if (needsPublish) {
        console.log(`   Status: draft -> active (publishing)`);
      }

      try {
        const updateData = {};
        if (tagsChanged) {
          updateData.tags = tagsString;
        }
        if (needsPublish) {
          updateData.status = 'active';
        }

        await updateProduct(item.id, updateData);

        if (tagsChanged) {
          console.log(`   ✅ Tags updated`);
          updated++;
        }
        if (needsPublish) {
          console.log(`   ✅ Published`);
          published++;
        }
      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('UPDATE COMPLETE');
    console.log('='.repeat(60));
    console.log(`Tags updated: ${updated}`);
    if (PUBLISH) {
      console.log(`Products published: ${published}`);
    }
    console.log(`Failed: ${failed}`);
    console.log(`Skipped (no changes): ${skipped}`);

    // Check if we need to create a Cloud YHS collection
    console.log('\n📋 Checking for Cloud YHS collection...');
    const collections = await getCollections('smart');
    const cloudYhsCollection = collections.smart_collections?.find(
      c => c.handle === 'cloud-yhs' || c.title.toLowerCase().includes('cloud yhs')
    );

    if (!cloudYhsCollection) {
      console.log('Creating Cloud YHS collection...');
      try {
        const newCollection = await createSmartCollection({
          title: 'Cloud YHS',
          handle: 'cloud-yhs',
          rules: [
            { column: 'vendor', relation: 'equals', condition: 'Cloud YHS' }
          ],
          disjunctive: false,
          published: true,
          sort_order: 'best-selling'
        });
        console.log(`✅ Created Cloud YHS collection: ${newCollection.smart_collection?.id}`);
      } catch (error) {
        console.error(`❌ Failed to create collection: ${error.message}`);
      }
    } else {
      console.log(`✅ Cloud YHS collection already exists (ID: ${cloudYhsCollection.id})`);
    }

  } else if (!DRY_RUN) {
    console.log('\n💡 Run with --execute to apply these changes to Shopify');
  }
}

main().catch(console.error);

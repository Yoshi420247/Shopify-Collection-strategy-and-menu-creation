#!/usr/bin/env node
// Generate a full report of products with low image counts.
// Identifies products with 0, 1, or 2 images so you can prioritize
// which products need more photos.
//
// Usage:
//   node src/check-product-images.js                       # Full report (default threshold: 3)
//   node src/check-product-images.js --threshold=4         # Flag products with fewer than 4 images
//   node src/check-product-images.js --max=10              # Test with 10 products
//   node src/check-product-images.js --product-ids=123,456 # Check specific products
//   node src/check-product-images.js --sort=images         # Sort by image count (ascending)
//   node src/check-product-images.js --sort=title          # Sort alphabetically
//   node src/check-product-images.js --csv                 # Also export a CSV file
//
import { config } from './config.js';
import { getAllProductsByVendor, getProduct } from './shopify-api.js';
import { writeFileSync, appendFileSync } from 'fs';

const DEFAULTS = {
  threshold: 3,        // Products with fewer than this many images are flagged
  maxProducts: 0,      // 0 = all products
  offset: 0,
  productIds: null,
  sort: 'images',      // 'images' (ascending) | 'title' | 'status'
  csv: false,
};

// ── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULTS };

  for (const arg of args) {
    if (arg === '--csv') options.csv = true;
    else if (arg.startsWith('--threshold=')) options.threshold = Math.max(1, parseInt(arg.split('=')[1], 10));
    else if (arg.startsWith('--max=')) options.maxProducts = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--offset=')) options.offset = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--product-ids=')) options.productIds = arg.split('=')[1].split(',').map(Number);
    else if (arg.startsWith('--sort=')) options.sort = arg.split('=')[1];
  }

  return options;
}

// ── Banner ───────────────────────────────────────────────────────────────────

function printBanner(options) {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║    Product Image Count Report                    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Image threshold:      < ${options.threshold} images flagged`);
  console.log(`  Sort by:              ${options.sort}`);
  if (options.csv) console.log('  CSV export:           ENABLED');
  if (options.offset > 0) console.log(`  Starting offset:      ${options.offset}`);
  if (options.maxProducts > 0) console.log(`  Max products:         ${options.maxProducts}`);
  if (options.productIds) console.log(`  Specific products:    ${options.productIds.join(', ')}`);
  console.log('');
}

// ── Fetch products ───────────────────────────────────────────────────────────

async function fetchProducts(options) {
  if (options.productIds) {
    console.log(`Fetching ${options.productIds.length} specific product(s)...`);
    const products = [];
    for (const id of options.productIds) {
      try {
        const data = await getProduct(id);
        if (data.product) products.push(data.product);
        else console.log(`  Warning: Product ${id} not found`);
      } catch (err) {
        console.log(`  Warning: Failed to fetch product ${id}: ${err.message}`);
      }
    }
    return products;
  }

  console.log(`Fetching all "${config.vendor}" vendor products...`);
  const products = await getAllProductsByVendor(config.vendor);
  console.log(`Found ${products.length} products`);
  return products;
}

// ── Analyze a single product ─────────────────────────────────────────────────

function analyzeProduct(product) {
  const images = product.images || [];
  const imageCount = images.length;
  const tags = (product.tags || '').split(',').map(t => t.trim()).filter(Boolean);

  // Extract useful tag info
  const familyTag = tags.find(t => t.startsWith('family:'));
  const brandTag = tags.find(t => t.startsWith('brand:'));
  const materialTag = tags.find(t => t.startsWith('material:'));

  // Get price range from variants
  const variants = product.variants || [];
  const prices = variants.map(v => parseFloat(v.price)).filter(p => !isNaN(p));
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const priceDisplay = minPrice !== null
    ? (minPrice === maxPrice ? `$${minPrice.toFixed(2)}` : `$${minPrice.toFixed(2)}–$${maxPrice.toFixed(2)}`)
    : 'N/A';

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    imageCount,
    status: product.status || 'unknown',
    productType: product.product_type || '',
    family: familyTag ? familyTag.replace('family:', '') : '',
    brand: brandTag ? brandTag.replace('brand:', '') : '',
    material: materialTag ? materialTag.replace('material:', '') : '',
    price: priceDisplay,
    variantCount: variants.length,
    hasAltText: images.every(img => img.alt && img.alt.trim().length > 0),
    imageSources: images.map(img => img.src),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

// ── Sort helper ──────────────────────────────────────────────────────────────

function sortProducts(products, sortBy) {
  const sorted = [...products];
  switch (sortBy) {
    case 'images':
      sorted.sort((a, b) => a.imageCount - b.imageCount || a.title.localeCompare(b.title));
      break;
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'status':
      sorted.sort((a, b) => a.status.localeCompare(b.status) || a.imageCount - b.imageCount);
      break;
    default:
      sorted.sort((a, b) => a.imageCount - b.imageCount);
  }
  return sorted;
}

// ── Console summary ──────────────────────────────────────────────────────────

function printSummary(results, reportPath) {
  const { summary, flagged, all } = results;

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  PRODUCT IMAGE COUNT REPORT');
  console.log(`${'═'.repeat(70)}`);
  console.log(`  Total products:        ${summary.totalProducts}`);
  console.log(`  Flagged (< ${summary.threshold} images): ${summary.flaggedCount}`);
  console.log(`${'─'.repeat(70)}`);
  console.log('  BREAKDOWN BY IMAGE COUNT');
  console.log(`${'─'.repeat(70)}`);
  console.log(`  0 images (no photos):  ${summary.noImages}`);
  console.log(`  1 image:               ${summary.oneImage}`);
  console.log(`  2 images:              ${summary.twoImages}`);
  console.log(`  3 images:              ${summary.threeImages}`);
  console.log(`  4+ images:             ${summary.fourPlusImages}`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`  Average images/product: ${summary.averageImages}`);
  console.log(`  Median images/product:  ${summary.medianImages}`);
  console.log(`${'═'.repeat(70)}`);

  // Flagged products by category
  if (flagged.length > 0) {
    // Group by image count
    const noImages = flagged.filter(p => p.imageCount === 0);
    const oneImage = flagged.filter(p => p.imageCount === 1);
    const twoImages = flagged.filter(p => p.imageCount === 2);
    const remaining = flagged.filter(p => p.imageCount >= 3);

    if (noImages.length > 0) {
      console.log(`\n  NO IMAGES (${noImages.length} products) — Highest priority`);
      console.log(`${'─'.repeat(70)}`);
      for (const p of noImages) {
        console.log(`  - ${p.title}`);
        console.log(`    ID: ${p.id} | Handle: ${p.handle} | Status: ${p.status} | Price: ${p.price}`);
        if (p.family) console.log(`    Family: ${p.family} | Type: ${p.productType}`);
      }
    }

    if (oneImage.length > 0) {
      console.log(`\n  1 IMAGE (${oneImage.length} products) — High priority`);
      console.log(`${'─'.repeat(70)}`);
      for (const p of oneImage) {
        console.log(`  - ${p.title}`);
        console.log(`    ID: ${p.id} | Handle: ${p.handle} | Status: ${p.status} | Price: ${p.price}`);
        if (p.family) console.log(`    Family: ${p.family} | Type: ${p.productType}`);
      }
    }

    if (twoImages.length > 0) {
      console.log(`\n  2 IMAGES (${twoImages.length} products) — Medium priority`);
      console.log(`${'─'.repeat(70)}`);
      for (const p of twoImages) {
        console.log(`  - ${p.title}`);
        console.log(`    ID: ${p.id} | Handle: ${p.handle} | Status: ${p.status} | Price: ${p.price}`);
        if (p.family) console.log(`    Family: ${p.family} | Type: ${p.productType}`);
      }
    }

    if (remaining.length > 0) {
      console.log(`\n  ${summary.threshold - 1} IMAGES OR BELOW THRESHOLD (${remaining.length} products)`);
      console.log(`${'─'.repeat(70)}`);
      for (const p of remaining) {
        console.log(`  - ${p.title} (${p.imageCount} images)`);
        console.log(`    ID: ${p.id} | Handle: ${p.handle} | Status: ${p.status} | Price: ${p.price}`);
      }
    }
  } else {
    console.log('\n  All products have enough images!');
  }

  // Family breakdown
  if (flagged.length > 0) {
    const familyCounts = {};
    for (const p of flagged) {
      const key = p.family || p.productType || '(untagged)';
      familyCounts[key] = (familyCounts[key] || 0) + 1;
    }
    const sortedFamilies = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);

    console.log(`\n${'─'.repeat(70)}`);
    console.log('  FLAGGED PRODUCTS BY FAMILY/TYPE');
    console.log(`${'─'.repeat(70)}`);
    for (const [family, count] of sortedFamilies) {
      console.log(`  ${family.padEnd(35)} ${count} product(s)`);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Full report: ${reportPath}`);
}

// ── Markdown summary (for GitHub Actions) ────────────────────────────────────

function generateMarkdownSummary(results) {
  const { summary, flagged } = results;

  let md = `## Product Image Count Report\n\n`;
  md += `**Date:** ${results.timestamp}\n`;
  md += `**Threshold:** Products with fewer than ${summary.threshold} images are flagged\n\n`;

  md += `### Summary\n\n`;
  md += `| Metric | Count |\n|--------|------:|\n`;
  md += `| Total Products | ${summary.totalProducts} |\n`;
  md += `| **Flagged (< ${summary.threshold} images)** | **${summary.flaggedCount}** |\n`;
  md += `| 0 images | ${summary.noImages} |\n`;
  md += `| 1 image | ${summary.oneImage} |\n`;
  md += `| 2 images | ${summary.twoImages} |\n`;
  md += `| 3 images | ${summary.threeImages} |\n`;
  md += `| 4+ images | ${summary.fourPlusImages} |\n`;
  md += `| Average images/product | ${summary.averageImages} |\n`;
  md += `\n`;

  if (flagged.length > 0) {
    // Group by image count
    const groups = [
      { label: 'No Images (Highest Priority)', items: flagged.filter(p => p.imageCount === 0) },
      { label: '1 Image (High Priority)', items: flagged.filter(p => p.imageCount === 1) },
      { label: '2 Images (Medium Priority)', items: flagged.filter(p => p.imageCount === 2) },
    ];

    for (const group of groups) {
      if (group.items.length === 0) continue;
      md += `### ${group.label} (${group.items.length})\n\n`;
      md += `| Product | ID | Handle | Family | Price | Status |\n`;
      md += `|---------|---:|--------|--------|------:|--------|\n`;
      for (const p of group.items) {
        md += `| ${p.title} | ${p.id} | ${p.handle} | ${p.family || '—'} | ${p.price} | ${p.status} |\n`;
      }
      md += `\n`;
    }

    // Family breakdown
    const familyCounts = {};
    for (const p of flagged) {
      const key = p.family || p.productType || '(untagged)';
      familyCounts[key] = (familyCounts[key] || 0) + 1;
    }
    const sortedFamilies = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);

    md += `### Flagged by Family/Type\n\n`;
    md += `| Family | Count |\n|--------|------:|\n`;
    for (const [family, count] of sortedFamilies) {
      md += `| ${family} | ${count} |\n`;
    }
    md += `\n`;
  }

  return md;
}

// ── CSV export ───────────────────────────────────────────────────────────────

function generateCsv(products) {
  const header = 'ID,Title,Handle,Image Count,Status,Product Type,Family,Brand,Material,Price,Variants,Has Alt Text,Created,Updated';
  const rows = products.map(p => {
    const title = `"${p.title.replace(/"/g, '""')}"`;
    const handle = `"${p.handle}"`;
    const type = `"${p.productType.replace(/"/g, '""')}"`;
    return `${p.id},${title},${handle},${p.imageCount},${p.status},${type},${p.family},${p.brand},${p.material},"${p.price}",${p.variantCount},${p.hasAltText},${p.createdAt},${p.updatedAt}`;
  });
  return [header, ...rows].join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs();
  printBanner(options);

  // Validate required environment variables
  if (!config.shopify.storeUrl) {
    console.error('ERROR: SHOPIFY_STORE_URL environment variable is required');
    process.exit(1);
  }
  if (!config.shopify.accessToken) {
    console.error('ERROR: SHOPIFY_ACCESS_TOKEN environment variable is required');
    process.exit(1);
  }

  // Fetch products
  const allProducts = await fetchProducts(options);

  // Apply offset and max
  let products = allProducts.slice(options.offset);
  if (options.maxProducts > 0) {
    products = products.slice(0, options.maxProducts);
  }

  console.log(`\nAnalyzing ${products.length} products...\n`);

  // Analyze all products
  const analyzed = products.map(p => analyzeProduct(p));

  // Calculate statistics
  const imageCounts = analyzed.map(p => p.imageCount);
  const sortedCounts = [...imageCounts].sort((a, b) => a - b);
  const totalImages = imageCounts.reduce((sum, c) => sum + c, 0);
  const median = sortedCounts.length > 0
    ? sortedCounts.length % 2 === 0
      ? ((sortedCounts[sortedCounts.length / 2 - 1] + sortedCounts[sortedCounts.length / 2]) / 2).toFixed(1)
      : sortedCounts[Math.floor(sortedCounts.length / 2)].toString()
    : '0';

  const flagged = sortProducts(
    analyzed.filter(p => p.imageCount < options.threshold),
    options.sort
  );

  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      totalProducts: analyzed.length,
      threshold: options.threshold,
      flaggedCount: flagged.length,
      noImages: analyzed.filter(p => p.imageCount === 0).length,
      oneImage: analyzed.filter(p => p.imageCount === 1).length,
      twoImages: analyzed.filter(p => p.imageCount === 2).length,
      threeImages: analyzed.filter(p => p.imageCount === 3).length,
      fourPlusImages: analyzed.filter(p => p.imageCount >= 4).length,
      totalImages,
      averageImages: analyzed.length > 0 ? (totalImages / analyzed.length).toFixed(1) : '0',
      medianImages: median,
    },
    flagged,
    all: sortProducts(analyzed, options.sort),
  };

  // Save JSON report
  const reportPath = `image-count-report-${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(results, null, 2));

  // Print console summary
  printSummary(results, reportPath);

  // CSV export
  if (options.csv) {
    const csvPath = `image-count-report-${Date.now()}.csv`;
    writeFileSync(csvPath, generateCsv(flagged));
    console.log(`CSV export: ${csvPath}`);
  }

  // GitHub Actions step summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = generateMarkdownSummary(results);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log('GitHub step summary written.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Register Shopify Webhooks
 *
 * Registers product webhooks with Shopify pointing to
 * the Supabase Edge Function endpoint.
 *
 * Usage:
 *   List webhooks:     node src/register-webhooks.js --list
 *   Register:          node src/register-webhooks.js --register
 *   Cleanup old:       node src/register-webhooks.js --cleanup
 */

import 'dotenv/config';
import * as api from './shopify-api.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('ERROR: SUPABASE_URL must be set in .env');
  process.exit(1);
}

const WEBHOOK_ENDPOINT = `${SUPABASE_URL}/functions/v1/product-webhook`;

const TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
];

async function listWebhooks() {
  const data = await api.get('webhooks.json');
  const webhooks = data.webhooks || [];

  console.log(`\nFound ${webhooks.length} webhooks:\n`);
  for (const wh of webhooks) {
    console.log(`  [${wh.id}] ${wh.topic} -> ${wh.address}`);
    console.log(`         Format: ${wh.format} | Created: ${wh.created_at}`);
  }

  return webhooks;
}

async function registerWebhooks() {
  console.log(`\nRegistering webhooks pointing to:\n  ${WEBHOOK_ENDPOINT}\n`);

  // Check for existing webhooks to avoid duplicates
  const existing = await api.get('webhooks.json');
  const existingWebhooks = existing.webhooks || [];
  const existingTopics = new Set(
    existingWebhooks
      .filter(wh => wh.address === WEBHOOK_ENDPOINT)
      .map(wh => wh.topic)
  );

  for (const topic of TOPICS) {
    if (existingTopics.has(topic)) {
      console.log(`  Skipped: ${topic} (already registered)`);
      continue;
    }

    try {
      const result = await api.post('webhooks.json', {
        webhook: {
          topic,
          address: WEBHOOK_ENDPOINT,
          format: 'json',
        },
      });

      if (result.webhook) {
        console.log(`  Registered: ${topic} (ID: ${result.webhook.id})`);
      } else if (result.errors) {
        console.log(`  Failed ${topic}: ${JSON.stringify(result.errors)}`);
      }
    } catch (error) {
      console.error(`  Failed ${topic}: ${error.message}`);
    }
  }
}

async function cleanupWebhooks() {
  const data = await api.get('webhooks.json');
  const webhooks = data.webhooks || [];

  // Find webhooks NOT pointing to our current endpoint
  const toDelete = webhooks.filter(wh => wh.address !== WEBHOOK_ENDPOINT);

  if (toDelete.length === 0) {
    console.log('\nNo stale webhooks to clean up.');
    return;
  }

  console.log(`\nCleaning up ${toDelete.length} stale webhooks:\n`);
  for (const wh of toDelete) {
    try {
      await api.deleteWebhook(wh.id);
      console.log(`  Deleted: [${wh.id}] ${wh.topic} -> ${wh.address}`);
    } catch (error) {
      console.error(`  Failed to delete ${wh.id}: ${error.message}`);
    }
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('SHOPIFY WEBHOOK MANAGER');
  console.log('='.repeat(70));

  if (process.argv.includes('--list')) {
    await listWebhooks();
  } else if (process.argv.includes('--register')) {
    await registerWebhooks();
    console.log('\nCurrent webhooks:');
    await listWebhooks();
  } else if (process.argv.includes('--cleanup')) {
    await cleanupWebhooks();
  } else {
    console.log('\nUsage:');
    console.log('  --list       List all webhooks');
    console.log('  --register   Register product webhooks');
    console.log('  --cleanup    Remove stale webhooks');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

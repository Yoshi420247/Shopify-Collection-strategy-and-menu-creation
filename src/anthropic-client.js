// Shared Anthropic API client with retry logic and message validation.
//
// Prevents duplicate tool_use IDs (API error 400: "tool_use ids must be unique")
// and provides exponential backoff for transient failures.
import Anthropic from '@anthropic-ai/sdk';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Cache clients by API key to avoid redundant instantiation
const clientCache = new Map();

/**
 * Get or create an Anthropic client for the given API key.
 */
export function getClient(apiKey) {
  if (!apiKey) throw new Error('Anthropic API key is required');
  if (clientCache.has(apiKey)) return clientCache.get(apiKey);
  const client = new Anthropic({ apiKey });
  clientCache.set(apiKey, client);
  return client;
}

/**
 * Deduplicate tool_use content blocks within a messages array.
 * The Anthropic API rejects requests where any two tool_use blocks
 * share the same `id`. This strips duplicates, keeping the first occurrence.
 */
function deduplicateToolUseIds(messages) {
  const seenIds = new Set();
  return messages.map(msg => {
    if (!Array.isArray(msg.content)) return msg;
    const filtered = msg.content.filter(block => {
      if (block.type !== 'tool_use') return true;
      if (seenIds.has(block.id)) return false;
      seenIds.add(block.id);
      return true;
    });
    return { ...msg, content: filtered };
  });
}

/**
 * Determine if an error is transient and worth retrying.
 */
function isRetryable(err) {
  // Rate limits
  if (err.status === 429) return true;
  // Server errors
  if (err.status >= 500) return true;
  // Network errors
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') return true;
  return false;
}

/**
 * Send a messages.create request with automatic retry and message validation.
 *
 * Usage:
 *   import { createMessage } from './anthropic-client.js';
 *   const response = await createMessage(apiKey, {
 *     model: 'claude-sonnet-4-5-20250929',
 *     max_tokens: 1024,
 *     messages: [{ role: 'user', content: [...] }],
 *   });
 */
export async function createMessage(apiKey, params) {
  const client = getClient(apiKey);

  // Validate and deduplicate tool_use IDs in the messages array
  const cleanParams = {
    ...params,
    messages: deduplicateToolUseIds(params.messages),
  };

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await client.messages.create(cleanParams);
    } catch (err) {
      lastError = err;

      // Don't retry non-transient errors (bad request, auth, etc.)
      if (!isRetryable(err)) throw err;

      // Don't retry after last attempt
      if (attempt === MAX_RETRIES) break;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export default { getClient, createMessage };

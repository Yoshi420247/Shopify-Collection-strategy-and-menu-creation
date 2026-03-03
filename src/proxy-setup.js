// Auto-configure HTTP proxy for Node.js fetch (undici)
// Node's built-in fetch doesn't respect HTTP_PROXY/HTTPS_PROXY like curl does.
// Import this module early to enable proxy support when running in environments
// that require it (CI, containers, etc.)
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

if (proxyUrl) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch {
    // undici not installed — skip silently (proxy not needed in most envs)
  }
}

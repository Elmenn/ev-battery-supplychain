// Minimal bootstrap for browser Railgun wallet flow
// Purpose: provide a tiny entrypoint that initializes the client-side wallet SDK

export async function bootstrap(options = {}) {
  // options: { walletSource, poiNodeURLs, shouldDebug }
  try {
    // Import our small browser wrapper (which itself dynamically imports the SDK)
    const mod = await import('../railgun-client-browser.js').catch(() => null);
    if (!mod) {
      throw new Error('Railgun browser SDK wrapper not found at src/lib/railgun-client-browser.js');
    }

    const result = await mod.initializeSDK({
      walletSource: options.walletSource || 'evbatterydapp',
      poiNodeURLs: options.poiNodeURLs || ['https://ppoi-agg.horsewithsixlegs.xyz'],
      shouldDebug: !!options.shouldDebug,
    });

    if (!result || !result.success) {
      throw new Error(result && result.error ? result.error : 'SDK initialization failed');
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}

export default bootstrap;

// Backwards-compatible named exports expected by UI components
export async function initRailgunForBrowser(options = {}) {
  return bootstrap(options);
}

export function stopRailgunEngineBrowser() {
  // No-op in wallet-only flow; provided for compatibility
  return { success: true };
}

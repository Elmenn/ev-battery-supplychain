/**
 * Browser Railgun Client Wrapper
 * 
 * Provides a simple API for browser components to use the new Railgun structure.
 * This wraps the new TypeScript structure with browser-compatible JavaScript.
 * 
 * TODO: After converting TS to JS, we can directly import from railgun/ directory.
 */

import { initializeRailgun, loadProviderBrowser, stopRailgunEngineBrowser, initRailgunForBrowser } from './railgun-browser-init';
import { NetworkName } from '@railgun-community/shared-models';

// Re-export key functions from the new structure
// For now, these will fail until we convert TS to JS
// But we can provide a basic wrapper

/**
 * Initialize Railgun for browser use
 * 
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
export const initRailgunForBrowserWrapper = async (options = {}) => {
  try {
    await initializeRailgun({
      walletSource: 'evbatterydapp',
      poiNodeURLs: ['https://ppoi-agg.horsewithsixlegs.xyz'],
      shouldDebug: true,
      verboseScanLogging: false,
      ...options,
    });
    console.log('✅ Railgun initialized for browser');
  } catch (error) {
    console.error('❌ Failed to initialize Railgun:', error);
    throw error;
  }
};

// Re-export for convenience
export { initRailgunForBrowser, stopRailgunEngineBrowser };

/**
 * Get Railgun services (will be available after TS conversion)
 */
export const getRailgunServices = async () => {
  // This will work after we convert TS to JS
  // For now, return a promise that imports on-demand
  try {
    // Try dynamic import with .ts extension
    return await import('./railgun/index.ts');
  } catch (error) {
    console.error('❌ Failed to load Railgun services:', error);
    throw new Error('Railgun services not found. Please convert TypeScript files to JavaScript.');
  }
};

export { NetworkName };


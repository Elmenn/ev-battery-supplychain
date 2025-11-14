/**
 * RAILGUN BOOTSTRAP
 * 
 * CRITICAL: This file MUST be imported BEFORE any Railgun code runs.
 * It patches NETWORK_CONFIG[EthereumSepolia] before the SDK module initializes,
 * ensuring SDK functions that read by networkName (like getSerializedERC20Balances,
 * getShieldsForTXIDVersion) can find the Sepolia configuration.
 * 
 * Import order in index.js:
 * 1. railgun-bootstrap.js  ← THIS FILE (patches NETWORK_CONFIG)
 * 2. railgunV2SepoliaClient.js  ← SDK imports happen here
 * 3. Everything else
 */

import { NETWORK_CONFIG, NetworkName, TXIDVersion } from '@railgun-community/shared-models';

// CRITICAL: Patch fetch IMMEDIATELY - before ANY other code runs (including SDK imports)
// This ensures GraphQL Mesh uses our override endpoint
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const DEFAULT_SEPOLIA_V2 = 'https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql';
  const overrideURL = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL) ||
                      (typeof window !== 'undefined' && window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__);
  
  // Always patch fetch to redirect localhost:4000 to public endpoint (even if no override is set)
  // Use override if set, otherwise use default public endpoint
  const targetEndpoint = overrideURL || DEFAULT_SEPOLIA_V2;
  console.log('[Bootstrap] 🚨 EARLIEST fetch patch - target endpoint:', targetEndpoint, overrideURL ? '(override)' : '(default)');
  
    const origFetchBootstrap = window.fetch.bind(window);
    window.fetch = function(...args) {
      try {
        const [url, init] = args;
        const urlString = url?.toString() || '';
        
        // Log ALL GraphQL requests for debugging
        if (urlString.includes('graphql') || urlString.includes('rail-squid') || urlString.includes('localhost:4000')) {
          console.log('[Bootstrap] 🔍 Fetch call detected:', urlString);
          console.log('[Bootstrap] 📊 Request method:', init?.method || 'GET');
        }
        
      // Intercept default Sepolia V2 endpoint OR localhost:4000 (local Subsquid)
      const isSepoliaV2Endpoint = urlString.includes('rail-squid.squids.live/squid-railgun-eth-sepolia-v2');
      const isLocalhost4000 = urlString.includes('localhost:4000/graphql');
      
      if (isSepoliaV2Endpoint || isLocalhost4000) {
        // Always redirect localhost:4000 to public endpoint (or override if set)
        // For Sepolia V2 endpoint, use override if set, otherwise keep original
        const targetURL = isLocalhost4000 ? targetEndpoint : 
                         (isSepoliaV2Endpoint && overrideURL ? overrideURL : urlString);
        console.log('[Bootstrap] 🚨 EARLIEST fetch intercept:', urlString, '→', targetURL);
          console.trace('[Bootstrap] Stack trace for intercept');
          
          // Log request body if it's a POST
          if (init?.method === 'POST' && init?.body) {
            try {
              const body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
              const parsed = JSON.parse(body);
              console.log('[Bootstrap] 📤 GraphQL Request:', parsed.query?.substring(0, 200) || 'N/A');
              console.log('[Bootstrap] 📤 GraphQL Variables:', parsed.variables);
            } catch (e) {
              console.log('[Bootstrap] 📤 Request body (raw):', init.body);
            }
          }
          
          // Intercept response to log errors
        const fetchPromise = origFetchBootstrap(targetURL, init);
          return fetchPromise.then(async (response) => {
            // Clone response to read body without consuming it
            const clonedResponse = response.clone();
            
            // Log response status
            console.log('[Bootstrap] 📥 Response status:', response.status, response.statusText);
            
            // If error, log the response body
            if (!response.ok || response.status >= 400) {
              try {
                const text = await clonedResponse.text();
                console.error('[Bootstrap] ❌ GraphQL Error Response:', text);
                try {
                  const json = JSON.parse(text);
                  console.error('[Bootstrap] ❌ GraphQL Error (parsed):', JSON.stringify(json, null, 2));
                } catch (e) {
                  // Not JSON, that's ok
                }
              } catch (e) {
                console.error('[Bootstrap] ❌ Failed to read error response:', e);
              }
            } else {
              // Log successful response (first 500 chars)
              try {
                const text = await clonedResponse.text();
                const preview = text.substring(0, 500);
                console.log('[Bootstrap] ✅ GraphQL Response preview:', preview);
                try {
                  const json = JSON.parse(text);
                  if (json.errors) {
                    console.error('[Bootstrap] ❌ GraphQL Errors in response:', JSON.stringify(json.errors, null, 2));
                  }
                  if (json.data) {
                    const dataKeys = Object.keys(json.data);
                    console.log('[Bootstrap] ✅ GraphQL Data keys:', dataKeys);
                    // Log first transaction if available
                    if (json.data.transactions || json.data.transactionsConnection) {
                      const txs = json.data.transactions || json.data.transactionsConnection?.edges?.map(e => e.node) || [];
                      console.log('[Bootstrap] ✅ Transactions count:', txs.length);
                      if (txs.length > 0) {
                        console.log('[Bootstrap] ✅ First transaction:', JSON.stringify(txs[0], null, 2));
                      }
                    }
                  }
                } catch (e) {
                  // Not JSON, log raw
                  console.log('[Bootstrap] ✅ Response (not JSON):', preview);
                }
              } catch (e) {
                console.warn('[Bootstrap] ⚠️ Failed to read response:', e);
              }
            }
            
            return response;
          }).catch((error) => {
            console.error('[Bootstrap] ❌ Fetch error:', error);
            throw error;
          });
        }
      } catch (e) {
        console.warn('[Bootstrap] Fetch patch error:', e);
      }
      return origFetchBootstrap(...args);
    };
    console.log('[Bootstrap] 🚨 EARLIEST fetch patch applied - will log all GraphQL requests');
}

// Patch Sepolia configuration BEFORE SDK modules read it
// This ensures SDK functions that use networkName (not chain) can find Sepolia config
if (!NETWORK_CONFIG[NetworkName.EthereumSepolia]) {
  NETWORK_CONFIG[NetworkName.EthereumSepolia] = {};
}

const sepoliaConfig = NETWORK_CONFIG[NetworkName.EthereumSepolia];

// Set core chain configuration
sepoliaConfig.chain = { type: 0, id: 11155111 };
sepoliaConfig.name = NetworkName.EthereumSepolia;
sepoliaConfig.publicName = 'Sepolia Testnet';
sepoliaConfig.shortPublicName = 'Sepolia';

// V2 only - no V3 support needed
// Note: We're using V2_PoseidonMerkle only

// Configure POI
sepoliaConfig.hasPOI = true;
sepoliaConfig.poi = {
  launchBlock: 5944700,
  launchTimestamp: 1716309480,
  gatewayUrls: ['https://ppoi-agg.horsewithsixlegs.xyz'],
  aggregatorURLs: ['https://ppoi-agg.horsewithsixlegs.xyz'],
};

// Configure shield contract (official Sepolia proxy)
sepoliaConfig.shieldContracts = {
  [TXIDVersion.V2_PoseidonMerkle]: {
    railgunShield: '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea',
  },
};

// Proxy contract address (same as shield contract for V2)
sepoliaConfig.proxyContract = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea';

// Optional: Public RPC (will be overridden by initEngine with actual RPC)
sepoliaConfig.publicRPCs = sepoliaConfig.publicRPCs || [];
sepoliaConfig.fallbackRPCs = sepoliaConfig.fallbackRPCs || [];

// CRITICAL: Do NOT set V3 contract addresses at all (not even undefined/empty)
// The SDK may try to read them and pass empty strings to ethers.js, causing ENS errors
// By not setting them, SDK checks for existence will return undefined (safe)

console.log('✅ Railgun bootstrap: Sepolia config patched BEFORE SDK imports (V2 only)');


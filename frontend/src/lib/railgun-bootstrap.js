/**
 * Railgun Network Configuration Bootstrap
 * 
 * Patches NETWORK_CONFIG for Ethereum Sepolia BEFORE any SDK code runs.
 * This ensures SDK functions can find Sepolia configuration.
 * 
 * CRITICAL: This file must be imported BEFORE any Railgun SDK code.
 */

import { NETWORK_CONFIG, NetworkName } from '@railgun-community/shared-models';

// Patch Sepolia configuration BEFORE SDK modules read it
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
// Using the correct proxy from user's confirmation
sepoliaConfig.shieldContracts = {
  V2_PoseidonMerkle: {
    railgunShield: '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea',
  },
};

// Proxy contract address (same as shield contract for V2)
sepoliaConfig.proxyContract = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea';

// Base token configuration (WETH for Sepolia)
// Using the address from railgunV2SepoliaClient.js SEPOLIA constant
sepoliaConfig.baseToken = sepoliaConfig.baseToken || {};
sepoliaConfig.baseToken.wrappedAddress = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14'; // Sepolia WETH (from SEPOLIA constant)
sepoliaConfig.baseToken.symbol = 'WETH';
sepoliaConfig.baseToken.name = 'Wrapped Ether';
sepoliaConfig.baseToken.decimals = 18;

// Optional: Public RPC (will be overridden by loadProvider with actual RPC)
sepoliaConfig.publicRPCs = sepoliaConfig.publicRPCs || [];
sepoliaConfig.fallbackRPCs = sepoliaConfig.fallbackRPCs || [];

console.log('[Bootstrap] ✅ Sepolia network configuration patched');
console.log('[Bootstrap]   Chain ID:', sepoliaConfig.chain.id);
console.log('[Bootstrap]   Proxy:', sepoliaConfig.proxyContract);
console.log('[Bootstrap]   WETH:', sepoliaConfig.baseToken.wrappedAddress);

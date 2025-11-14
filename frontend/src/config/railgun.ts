// Single source of truth for your demo network + TXID version
// NOTE: These constants are for reference/documentation only.
// Actual configuration is done directly in railgunV2SepoliaClient.js via NETWORK_CONFIG.

export const RAILGUN_TXID_VERSION = 'V2_PoseidonMerkle' as const;
export const IS_TESTNET = true; // Sepolia demo
export const TARGET_NETWORK = 'EthereumSepolia' as const; // matches shared-models key
export const RAILGUN_USE_POI = true; // POI enabled on Sepolia (gateway: https://ppoi-agg.horsewithsixlegs.xyz)



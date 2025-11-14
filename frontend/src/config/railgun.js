// Railgun Configuration
// Single source of truth for TXID version and testnet settings
// NOTE: These constants are for reference/documentation only.
// Actual configuration is done directly in railgunV2SepoliaClient.js via NETWORK_CONFIG.

export const RAILGUN_TXID_VERSION = 'V2_PoseidonMerkle';
export const IS_TESTNET = true; // Sepolia
export const RAILGUN_USE_POI = true; // POI enabled on Sepolia (gateway: https://ppoi-agg.horsewithsixlegs.xyz)

// Network configuration
export const TARGET_NETWORK = 'EthereumSepolia';

// Balance reading configuration
export const ONLY_SPENDABLE_BALANCES = false; // Include ShieldPending (will be converted to Spendable via test-mode override)



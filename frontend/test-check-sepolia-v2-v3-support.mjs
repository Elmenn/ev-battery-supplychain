// test-check-sepolia-v2-v3-support.mjs
import { NETWORK_CONFIG, NetworkName } from '@railgun-community/shared-models';

const sepolia = NETWORK_CONFIG[NetworkName.EthereumSepolia];
console.log('=== SEPOLIA CONFIGURATION ANALYSIS ===');
console.log('Sepolia config keys:', Object.keys(sepolia));
console.log('');

console.log('=== V3 SUPPORT ===');
console.log('supportsV3:', sepolia.supportsV3);
console.log('V3 contracts:');
console.log('  poseidonMerkleAccumulatorV3Contract:', sepolia.poseidonMerkleAccumulatorV3Contract);
console.log('  poseidonMerkleVerifierV3Contract:', sepolia.poseidonMerkleVerifierV3Contract);
console.log('  tokenVaultV3Contract:', sepolia.tokenVaultV3Contract);
console.log('  deploymentBlockPoseidonMerkleAccumulatorV3:', sepolia.deploymentBlockPoseidonMerkleAccumulatorV3);
console.log('');

console.log('=== V2 SUPPORT ===');
console.log('V2 contracts:');
console.log('  poseidonMerkleAccumulatorV2Contract:', sepolia.poseidonMerkleAccumulatorV2Contract);
console.log('  poseidonMerkleVerifierV2Contract:', sepolia.poseidonMerkleVerifierV2Contract);
console.log('  txidV2Contract:', sepolia.txidV2Contract);
console.log('');

console.log('=== OTHER IMPORTANT FIELDS ===');
console.log('proxyContract:', sepolia.proxyContract);
console.log('relayAdaptContract:', sepolia.relayAdaptContract);
console.log('deploymentBlock:', sepolia.deploymentBlock);
console.log('isTestnet:', sepolia.isTestnet);
console.log('isDevOnlyNetwork:', sepolia.isDevOnlyNetwork);
console.log('');

console.log('=== ANALYSIS ===');
const hasV3Support = sepolia.supportsV3 && 
  sepolia.poseidonMerkleAccumulatorV3Contract && 
  sepolia.poseidonMerkleVerifierV3Contract && 
  sepolia.tokenVaultV3Contract;

const hasV2Support = sepolia.poseidonMerkleAccumulatorV2Contract && 
  sepolia.poseidonMerkleVerifierV2Contract && 
  sepolia.txidV2Contract;

console.log('Has V3 Support:', hasV3Support);
console.log('Has V2 Support:', hasV2Support);
console.log('Has Shield Contract:', !!sepolia.proxyContract);
console.log('Has Relay Adapt:', !!sepolia.relayAdaptContract);




// test-check-other-networks-v2-support.mjs
import { NETWORK_CONFIG, NetworkName } from '@railgun-community/shared-models';

console.log('=== COMPARING V2 SUPPORT ACROSS NETWORKS ===');
console.log('');

const networks = [
  NetworkName.Ethereum,
  NetworkName.Polygon,
  NetworkName.Arbitrum,
  NetworkName.EthereumSepolia,
  NetworkName.EthereumGoerli_DEPRECATED
];

networks.forEach(networkName => {
  const config = NETWORK_CONFIG[networkName];
  if (config) {
    console.log(`=== ${networkName} ===`);
    console.log('supportsV3:', config.supportsV3);
    console.log('V2 contracts:');
    console.log('  poseidonMerkleAccumulatorV2Contract:', config.poseidonMerkleAccumulatorV2Contract);
    console.log('  poseidonMerkleVerifierV2Contract:', config.poseidonMerkleVerifierV2Contract);
    console.log('  txidV2Contract:', config.txidV2Contract);
    console.log('V3 contracts:');
    console.log('  poseidonMerkleAccumulatorV3Contract:', config.poseidonMerkleAccumulatorV3Contract);
    console.log('  poseidonMerkleVerifierV3Contract:', config.poseidonMerkleVerifierV3Contract);
    console.log('  tokenVaultV3Contract:', config.tokenVaultV3Contract);
    console.log('');
  }
});










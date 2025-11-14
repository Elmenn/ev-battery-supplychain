// file: probe-txid-config.mjs
import { NETWORK_CONFIG, NetworkName } from '@railgun-community/shared-models';
import { Wallet, TXIDVersion } from '@railgun-community/wallet';
import { networkForChain } from '@railgun-community/shared-models';

const ethCfg = NETWORK_CONFIG[NetworkName.Ethereum];

console.log('Ethereum NETWORK_CONFIG keys:', Object.keys(ethCfg));
console.log('supportsV3:', ethCfg.supportsV3);
console.log('V2:', ethCfg.txidV2Contract);
console.log('V3.accumulator:', ethCfg.poseidonMerkleAccumulatorV3Contract);
console.log('V3.verifier:', ethCfg.poseidonMerkleVerifierV3Contract);
console.log('V3.tokenVault:', ethCfg.tokenVaultV3Contract);

const ethChain = networkForChain({ type: 0, id: 1 }); // ChainType.EVM=0, id=1

for (const v of [TXIDVersion.V2_PoseidonMerkle, TXIDVersion.V3_PoseidonMerkle]) {
  try {
    const tree = Wallet.getTXIDMerkletreeForNetwork(v, ethChain);
    console.log('getTXIDMerkletreeForNetwork', v, '=>', !!tree);
  } catch (err) {
    console.log('getTXIDMerkletreeForNetwork', v, 'ERROR =>', err?.message || err);
  }
}










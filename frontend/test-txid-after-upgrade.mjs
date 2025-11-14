// test-txid-after-upgrade.mjs
import {
  ChainType,
  NetworkName,
  NETWORK_CONFIG,
  TXIDVersion,
  networkForChain,
} from '@railgun-community/shared-models';
import {
  getTXIDMerkletreeForNetwork,
  getRailgunTxidMerkleroot,
  getLatestRailgunTxidData,
} from '@railgun-community/wallet';

const CHAINS = [
  [NetworkName.Ethereum,        1],
  [NetworkName.Polygon,         137],
  [NetworkName.Arbitrum,        42161],
  [NetworkName.BNBChain,        56],
  [NetworkName.EthereumSepolia, 11155111],
  [NetworkName.PolygonAmoy,     80002],
];

const show = (v) => (v ?? '(missing)');

async function probe(name, id) {
  const cfg = NETWORK_CONFIG[name];
  const network = networkForChain(ChainType.EVM, id);

  console.log(`\n=== ${name} (chainId ${id}) ===`);
  if (!cfg) { console.log('No NETWORK_CONFIG entry.'); return; }

  console.log('supportsV3:', show(cfg.supportsV3));
  console.log('V2:', 'txidV2Contract=', show(cfg.txidV2Contract),
              'accV2=', show(cfg.poseidonMerkleAccumulatorV2Contract),
              'verV2=', show(cfg.poseidonMerkleVerifierV2Contract));
  console.log('V3:', 'tokenVaultV3=', show(cfg.tokenVaultV3Contract),
              'accV3=', show(cfg.poseidonMerkleAccumulatorV3Contract),
              'verV3=', show(cfg.poseidonMerkleVerifierV3Contract));

  for (const ver of [TXIDVersion.V2_PoseidonMerkle, TXIDVersion.V3_PoseidonMerkle]) {
    try {
      await getTXIDMerkletreeForNetwork(network, ver);
      console.log(`getTXIDMerkletreeForNetwork(${ver}): ✅ exists`);
    } catch (e) {
      console.log(`getTXIDMerkletreeForNetwork(${ver}): ❌ ${e?.message || e}`);
    }
  }

  try {
    const root = await getRailgunTxidMerkleroot(network);
    console.log('getRailgunTxidMerkleroot:', root ? '✅ returned a root' : '❌ no root');
  } catch (e) {
    console.log('getRailgunTxidMerkleroot: ❌', e?.message || e);
  }

  try {
    await getLatestRailgunTxidData(network);
    console.log('getLatestRailgunTxidData: ✅ returned data');
  } catch (e) {
    console.log('getLatestRailgunTxidData: ❌', e?.message || e);
  }
}

(async () => {
  console.log('=== TESTING AFTER WALLET UPGRADE TO 10.7.0 ===');
  
  for (const [name, id] of CHAINS) {
    await probe(name, id);
  }
})();










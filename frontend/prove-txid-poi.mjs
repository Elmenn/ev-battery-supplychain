import {
  NETWORK_CONFIG,
  NetworkName,
  TXIDVersion,
  ChainType,
} from '@railgun-community/shared-models';
import {
  getTXIDMerkletreeForNetwork,
  getRailgunTxidMerkleroot,
  getLatestRailgunTxidData,
} from '@railgun-community/wallet';

const NETWORKS_TO_TEST = [
  NetworkName.Ethereum,
  NetworkName.Polygon,
  NetworkName.Arbitrum,
  NetworkName.BNBChain,
  NetworkName.EthereumSepolia,
  NetworkName.PolygonAmoy,
].filter(Boolean);

const NETWORK_ID = {
  [NetworkName.Ethereum]:        1,
  [NetworkName.Polygon]:         137,
  [NetworkName.Arbitrum]:        42161,
  [NetworkName.BNBChain]:        56,
  [NetworkName.EthereumSepolia]: 11155111,
  [NetworkName.PolygonAmoy]:     80002,
};

function print(val) { return val ?? '(missing)'; }

async function testOne(netName) {
  const cfg = NETWORK_CONFIG[netName];
  const id = NETWORK_ID[netName];
  const chain = { type: ChainType.EVM, id };

  console.log(`\n=== ${netName} (chainId ${id}) ===`);
  if (!cfg) { console.log('No NETWORK_CONFIG entry.'); return; }

  // 1) Static config check (what the SDK *thinks* exists)
  console.log('supportsV3:', print(cfg.supportsV3));
  console.log('V2 fields:',
    'txidV2Contract=', print(cfg.txidV2Contract),
    'poseidonMerkleAccumulatorV2Contract=', print(cfg.poseidonMerkleAccumulatorV2Contract),
    'poseidonMerkleVerifierV2Contract=', print(cfg.poseidonMerkleVerifierV2Contract),
  );
  console.log('V3 fields:',
    'tokenVaultV3Contract=', print(cfg.tokenVaultV3Contract),
    'poseidonMerkleAccumulatorV3Contract=', print(cfg.poseidonMerkleAccumulatorV3Contract),
    'poseidonMerkleVerifierV3Contract=', print(cfg.poseidonMerkleVerifierV3Contract),
  );

  // 2) Ask for merkletrees (runtime capability)
  for (const ver of [TXIDVersion.V2_PoseidonMerkle, TXIDVersion.V3_PoseidonMerkle]) {
    try {
      await getTXIDMerkletreeForNetwork(chain, ver);
      console.log(`getTXIDMerkletreeForNetwork(${ver}): ✅ exists`);
    } catch (e) {
      console.log(`getTXIDMerkletreeForNetwork(${ver}): ❌ ${e?.message || e}`);
    }
  }

  // 3) Ask for TXID data/root (requires TXID infra)
  try {
    const root = await getRailgunTxidMerkleroot(chain);
    console.log('getRailgunTxidMerkleroot:', root ? '✅ returned a root' : '❌ no root');
  } catch (e) {
    console.log('getRailgunTxidMerkleroot: ❌', e?.message || e);
  }

  try {
    await getLatestRailgunTxidData(chain);
    console.log('getLatestRailgunTxidData: ✅ returned data');
  } catch (e) {
    console.log('getLatestRailgunTxidData: ❌', e?.message || e);
  }
}

(async () => {
  console.log('SDK networks seen in NETWORK_CONFIG:', Object.keys(NETWORK_CONFIG));
  for (const net of NETWORKS_TO_TEST) {
    await testOne(net);
  }
})();










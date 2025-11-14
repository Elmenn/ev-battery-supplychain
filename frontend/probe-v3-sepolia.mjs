// probe-v3-sepolia.mjs
import { ethers } from 'ethers';
import {
  NETWORK_CONFIG, NetworkName,
  RailgunPoseidonMerkleAccumulatorV3Contract as AccAddr,
  RailgunPoseidonMerkleVerifierV3Contract as VerAddr,
  RailgunTokenVaultV3Contract as TVAddr,
} from '@railgun-community/shared-models';
import {
  ABIPoseidonMerkleAccumulator as ACC_ABI,
  ABIPoseidonMerkleVerifier   as VER_ABI,
  ABITokenVault               as TV_ABI,
} from '@railgun-community/engine';

const RPC = process.env.SEPOLIA_RPC; // set in PowerShell: $env:SEPOLIA_RPC="https://..."
const provider = new ethers.JsonRpcProvider(RPC);

const cfg = NETWORK_CONFIG[NetworkName.EthereumSepolia];

// 1) If you have suspected addresses, fill them here:
cfg.poseidonMerkleAccumulatorV3Contract = process.env.ACC || AccAddr[NetworkName.EthereumSepolia];
cfg.poseidonMerkleVerifierV3Contract   = process.env.VER || VerAddr[NetworkName.EthereumSepolia];
cfg.tokenVaultV3Contract               = process.env.TVL || TVAddr[NetworkName.EthereumSepolia];
cfg.supportsV3 = true;

async function checkOne(name, addr, abi, sanityCall) {
  if (!addr || addr === '0x' || addr === '') {
    console.log(`${name}: MISSING`);
    return;
  }
  const code = await provider.getCode(addr);
  if (!code || code === '0x') {
    console.log(`${name}: NO CODE at ${addr}`);
    return;
  }
  const c = new ethers.Contract(addr, abi, provider);
  try {
    const out = await sanityCall(c);
    console.log(`${name}: OK at ${addr} =>`, out);
  } catch (e) {
    console.log(`${name}: CODE EXISTS but call failed at ${addr}:`, e.message);
  }
}

(async () => {
  await checkOne('AccumulatorV3', cfg.poseidonMerkleAccumulatorV3Contract, ACC_ABI, c => c.treeNumber?.().catch(()=> 'readable'));
  await checkOne('VerifierV3',    cfg.poseidonMerkleVerifierV3Contract,   VER_ABI, c => c.VERSION?.().catch(()=> 'readable'));
  await checkOne('TokenVaultV3',  cfg.tokenVaultV3Contract,               TV_ABI,  c => c.fees().catch(()=> 'readable'));
})();

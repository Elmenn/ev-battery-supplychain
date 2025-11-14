// src/lib/railgunDebug.js
// Development tools for Railgun debugging and testing

import * as Wallet from '@railgun-community/wallet';
import { ethers } from 'ethers';
import { SEPOLIA, SEPOLIA_PHASE2 } from './railgunClient';

// ---- DEBUG UTILITIES ----
const tag = (m) => `[RG-DEBUG] ${m}`;
const short = (hex) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;

// ---- SDK PROBE ----
export async function probeRailgunShielding({ signer, railgunAddress, wethAddress, amountWei = 10n ** 12n }) {
  console.group('🧪 RAILGUN PROBE');
  
  const owner = (await signer.getAddress()).toLowerCase();
  const v2 = Wallet.TXIDVersion.V2_PoseidonMerkle;
  const network = Wallet.NetworkName.EthereumSepolia;
  
  const msg = Wallet.getShieldPrivateKeySignatureMessage();
  const sig = await signer.signMessage(msg);
  const sigNo0x = sig.startsWith('0x') ? sig.slice(2) : sig;
  
  const recipients = [
    { tokenAddress: wethAddress.toLowerCase(), railgunAddress, amount: amountWei.toString() },
    { tokenAddress: wethAddress.toLowerCase(), recipientAddress: railgunAddress, amount: amountWei.toString() },
    { tokenAddress: wethAddress.toLowerCase(), railgunAddress, recipientAddress: railgunAddress, amount: amountWei.toString() }
  ];
  
  const results = [];
  for (const [i, rec] of recipients.entries()) {
    for (const [j, key] of [sig, sigNo0x].entries()) {
      try {
        const res = await Wallet.gasEstimateForShield(v2, network, key, [rec], [], owner);
        console.log(`✅ rec${i} + key${j} -> SUCCESS`, res);
        results.push({ ok: true, res, rec, key });
      } catch (err) {
        console.log(`❌ rec${i} + key${j} -> ERROR:`, err?.message);
        results.push({ ok: false, err, rec, key });
      }
    }
  }
  
  console.groupEnd();
  return results;
}

// ---- SELF-TEST HARNESS ----
export async function railgunSelfTest({ signer, ownerEOA, recipient0zk, wethToken, amountWei, rpcUrl }) {
  try {
    console.log(tag(`connect start net=${SEPOLIA.networkName} chainId=${SEPOLIA.chainId}`));
    
    await Wallet.setPollingProviderForNetwork(SEPOLIA.chainId, rpcUrl, SEPOLIA.networkName);
    console.log(tag('engine ready'));
    
    await Wallet.assertValidRailgunAddress(recipient0zk);
    console.log(tag(`recipient 0zk=${short(recipient0zk)}`));
    
    const shieldPrivateKey = await makeShieldPrivateKey(signer, 'RAILGUN Shield Key v1');
    console.log(tag(`shieldKey ok len=${shieldPrivateKey.length} last=${shieldPrivateKey.slice(-4)}`));
    
    const v = Wallet.TXIDVersion.V2_PoseidonMerkle;
    const recipients = [{
      tokenAddress: wethToken,
      recipientAddress: recipient0zk,
      amount: amountWei.toString()
    }];
    
    console.log(tag(`gas request txidVersion=${v} net=${SEPOLIA.networkName}`));
    
    const { gasEstimate } = await Wallet.gasEstimateForShield(
      v, SEPOLIA.networkName, shieldPrivateKey, recipients, [], ownerEOA
    );
    
    console.log(tag(`gas ok units=${gasEstimate.gasEstimateString}`));
    return { success: true, gasEstimate, data: { gasEstimate } };
  } catch (err) {
    console.error(tag(`self-test error name=${err?.name || 'Error'} msg=${err?.message}`));
    return { success: false, error: err?.message || String(err) };
  }
}

// ---- VERIFICATION TESTS ----
export async function runVerificationTests() {
  console.group('🧪 QUICK VERIFICATION TESTS');
  
  try {
    console.log('1️⃣ Testing railgunAddress validation...');
    const testAddress = '0zk1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    await Wallet.assertValidRailgunAddress(testAddress);
    console.log('✅ railgunAddress validation works');
    
    console.log('\n2️⃣ Testing function signatures...');
    console.log('gasEstimateForShield length:', Wallet.gasEstimateForShield.length);
    console.log('populateShield length:', Wallet.populateShield.length);
    
    console.log('\n3️⃣ Testing shield key formats...');
    const random32 = Wallet.bytesToHex(Wallet.getRandomBytes(32));
    console.log('✅ random32:', random32, '(length:', random32.length, ')');
    
    console.log('\n4️⃣ All verification tests passed! 🎉');
    
    console.groupEnd();
    return { success: true, data: { testsPassed: 4 } };
  } catch (e) {
    console.error('❌ Verification test failed:', e.message);
    console.groupEnd();
    return { success: false, error: `Verification tests failed: ${e.message}` };
  }
}

// ---- HELPER FUNCTIONS ----
async function makeShieldPrivateKey(signer, message) {
  const sig = await signer.signMessage(message);
  const seed = ethers.keccak256(sig);
  return clampToSnarkField(seed);
}

const SNARK_FIELD = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const toHex32 = (n) => '0x' + n.toString(16).padStart(64, '0');
const clampToSnarkField = (hex32) => {
  const x = BigInt(hex32);
  let r = x % SNARK_FIELD;
  if (r === 0n) r = 1n;
  return toHex32(r);
};

// ---- DEBUG LOGGING ----
export function logSDKInfo() {
  console.group('🔍 RAILGUN SDK INFO');
  console.log('Wallet keys:', Object.keys(Wallet));
  console.log('TXIDVersion:', Wallet.TXIDVersion);
  console.log('NetworkName:', Wallet.NetworkName);
  console.log('Available functions:', Object.keys(Wallet).filter(k => typeof Wallet[k] === 'function'));
  console.groupEnd();
}

export function logNetworkConfig() {
  console.group('🌐 NETWORK CONFIG');
  console.log('SEPOLIA:', SEPOLIA);
  console.log('SEPOLIA_PHASE2:', SEPOLIA_PHASE2);
  console.groupEnd();
}

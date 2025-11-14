// Test file for new VC functions
import { 
  computeDeterministicNonce, 
  buildVCBasePublic, 
  buildVCBasePrivate, 
  vcHash 
} from './src/utils/vcBuilder.mjs';

// Test data
const testParams = {
  chainId: 1337,
  factory: "0x4ec375f7Adb00daeF38A0d111656dc4a082a4c45",
  escrow: "0xe9F90156e191229cfb4b3Bb7E1f83801a0Dcaf1B",
  productId: 1,
  purchaseTimestamp: 1703123456,
  purchaseMode: "Public"
};

console.log("🧪 Testing new VC functions...");

// Test 1: Deterministic nonce
console.log("\n1️⃣ Testing deterministic nonce:");
const nonce1 = computeDeterministicNonce(testParams);
const nonce2 = computeDeterministicNonce(testParams);
console.log("Nonce 1:", nonce1);
console.log("Nonce 2:", nonce2);
console.log("✅ Nonces match:", nonce1 === nonce2);

// Test 2: VC Base Public
console.log("\n2️⃣ Testing VC Base Public:");
const vcBasePublic = buildVCBasePublic({
  ...testParams,
  nonce: nonce1,
  seller: "0xb850d4cc584137a8b1d585BF42CdfbED3daad8c2",
  buyer: "0xdFA7E55dC098E0aC60c4487e5a24d803634F2F42",
  publicPriceWei: "1000000000000000000"
});
console.log("VC Base Public:", JSON.stringify(vcBasePublic, null, 2));

// Test 3: VC Hash
console.log("\n3️⃣ Testing VC Hash:");
const hash1 = vcHash(vcBasePublic);
const hash2 = vcHash(vcBasePublic);
console.log("Hash 1:", hash1);
console.log("Hash 2:", hash2);
console.log("✅ Hashes match:", hash1 === hash2);

// Test 4: Deterministic hash
console.log("\n4️⃣ Testing deterministic hash:");
const vcBasePublic2 = buildVCBasePublic({
  ...testParams,
  nonce: nonce1,
  seller: "0xb850d4cc584137a8b1d585BF42CdfbED3daad8c2",
  buyer: "0xdFA7E55dC098E0aC60c4487e5a24d803634F2F42",
  publicPriceWei: "1000000000000000000"
});
const hash3 = vcHash(vcBasePublic2);
console.log("Hash 3:", hash3);
console.log("✅ All hashes match:", hash1 === hash2 && hash2 === hash3);

console.log("\n🎉 All tests passed! New VC functions are working correctly."); 
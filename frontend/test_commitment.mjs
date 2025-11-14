// Test script for commitment flow
// Run from frontend directory: npm run test:commitment
// Or: node test_commitment.mjs (from frontend directory)

import { generateDeterministicBlinding, generateCommitmentWithDeterministicBlinding, verifyCommitmentMatch } from './src/utils/commitmentUtils.js';

async function testCommitmentFlow() {
  console.log("🧪 Testing Commitment Flow\n");
  
  // Test addresses
  const productAddress = "0x1234567890123456789012345678901234567890";
  const sellerAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const price = "1000000000000000000"; // 1 ETH in wei
  
  console.log("Test Parameters:");
  console.log(`  Product Address: ${productAddress}`);
  console.log(`  Seller Address: ${sellerAddress}`);
  console.log(`  Price: ${price} wei\n`);
  
  // Test 1: Deterministic blinding generation
  console.log("1. Testing deterministic blinding generation...");
  const blindingSeller = generateDeterministicBlinding(productAddress, sellerAddress);
  const blindingBuyer = generateDeterministicBlinding(productAddress, sellerAddress);
  
  console.log(`   Seller blinding: 0x${blindingSeller.substring(0, 16)}...${blindingSeller.substring(48)}`);
  console.log(`   Buyer blinding:  0x${blindingBuyer.substring(0, 16)}...${blindingBuyer.substring(48)}`);
  
  if (blindingSeller === blindingBuyer) {
    console.log("   ✅ PASS: Same blinding factor generated\n");
  } else {
    console.log("   ❌ FAIL: Different blinding factors!\n");
    process.exit(1);
  }
  
  // Test 2: Commitment generation (requires ZKP backend)
  console.log("2. Testing commitment generation (requires ZKP backend)...");
  const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
  console.log(`   ZKP Backend: ${zkpBackendUrl}\n`);
  
  try {
    // Seller generates commitment
    console.log("   Seller generating commitment...");
    const sellerCommitment = await generateCommitmentWithDeterministicBlinding(
      price,
      productAddress,
      sellerAddress,
      zkpBackendUrl
    );
    console.log(`   Commitment: ${sellerCommitment.commitment.substring(0, 16)}...${sellerCommitment.commitment.substring(48)}`);
    console.log(`   Verified: ${sellerCommitment.verified}\n`);
    
    // Buyer generates commitment (should be the same)
    console.log("   Buyer generating commitment...");
    const buyerCommitment = await generateCommitmentWithDeterministicBlinding(
      price,
      productAddress,
      sellerAddress,
      zkpBackendUrl
    );
    console.log(`   Commitment: ${buyerCommitment.commitment.substring(0, 16)}...${buyerCommitment.commitment.substring(48)}`);
    console.log(`   Verified: ${buyerCommitment.verified}\n`);
    
    // Verify commitments match
    if (sellerCommitment.commitment === buyerCommitment.commitment) {
      console.log("   ✅ PASS: Same commitment generated\n");
    } else {
      console.log("   ❌ FAIL: Different commitments generated!");
      console.log(`   Seller: ${sellerCommitment.commitment}`);
      console.log(`   Buyer:  ${buyerCommitment.commitment}\n`);
      process.exit(1);
    }
    
    // Test 3: Commitment matching
    console.log("3. Testing commitment matching...");
    const match = verifyCommitmentMatch(sellerCommitment.commitment, buyerCommitment.commitment);
    if (match) {
      console.log("   ✅ PASS: Commitments match\n");
    } else {
      console.log("   ❌ FAIL: Commitments do not match!\n");
      process.exit(1);
    }
    
    // Test 4: Test with different formats (with/without 0x prefix)
    console.log("4. Testing commitment matching with different formats...");
    const match1 = verifyCommitmentMatch(`0x${sellerCommitment.commitment}`, buyerCommitment.commitment);
    const match2 = verifyCommitmentMatch(sellerCommitment.commitment, `0x${buyerCommitment.commitment}`);
    const match3 = verifyCommitmentMatch(`0x${sellerCommitment.commitment}`, `0x${buyerCommitment.commitment}`);
    
    if (match1 && match2 && match3) {
      console.log("   ✅ PASS: Commitment matching works with different formats\n");
    } else {
      console.log("   ❌ FAIL: Commitment matching failed with different formats!\n");
      process.exit(1);
    }
    
    console.log("🎉 All tests passed!");
    console.log("\n📊 Summary:");
    console.log("   - Deterministic blinding: ✅");
    console.log("   - Same commitment generation: ✅");
    console.log("   - Commitment verification: ✅");
    console.log("   - Format handling: ✅");
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.message.includes("fetch") || error.message.includes("ECONNREFUSED")) {
      console.error("\n💡 Make sure the ZKP backend is running:");
      console.error("   cd zkp-backend && cargo run");
      console.error("\n   The backend should be running on http://localhost:5010");
    }
    process.exit(1);
  }
}

testCommitmentFlow().catch(console.error);


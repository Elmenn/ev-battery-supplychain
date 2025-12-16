/**
 * Step 7: Full Flow Testing
 * Tests: purchase → VC creation → verification
 * Identifies bugs causing verification failures
 */

// Mock data for testing
const MOCK_TX_HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const ZKP_BACKEND_URL = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';

console.log("=".repeat(60));
console.log("🧪 Step 7: Full Flow Testing");
console.log("=".repeat(60));

// Test 1: Generate TX hash commitment
async function test1_GenerateCommitment() {
  console.log("\n📝 Test 1: Generate TX Hash Commitment");
  console.log("-".repeat(60));
  
  try {
    const response = await fetch(`${ZKP_BACKEND_URL}/zkp/commit-tx-hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_hash: MOCK_TX_HASH }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    console.log("✅ Commitment generated:");
    console.log(`   Commitment: ${data.commitment.substring(0, 20)}...`);
    console.log(`   Proof size: ${data.proof.length / 2} bytes`);
    console.log(`   Verified: ${data.verified}`);
    
    if (!data.verified) {
      throw new Error("Commitment verification failed during generation");
    }
    
    return data;
  } catch (error) {
    console.error("❌ Test 1 FAILED:", error.message);
    return null;
  }
}

// Test 2: Verify the commitment
async function test2_VerifyCommitment(commitmentData) {
  console.log("\n📝 Test 2: Verify TX Hash Commitment");
  console.log("-".repeat(60));
  
  if (!commitmentData) {
    console.log("⏭️  Skipped (Test 1 failed)");
    return false;
  }
  
  try {
    const response = await fetch(`${ZKP_BACKEND_URL}/zkp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitment: commitmentData.commitment,
        proof: commitmentData.proof,
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    console.log(`✅ Verification result: ${data.verified}`);
    
    if (!data.verified) {
      throw new Error("Commitment verification failed");
    }
    
    return true;
  } catch (error) {
    console.error("❌ Test 2 FAILED:", error.message);
    return false;
  }
}

// Test 3: Create VC with commitment (simulate buildStage3VC)
async function test3_CreateVCWithCommitment(commitmentData) {
  console.log("\n📝 Test 3: Create VC with TX Hash Commitment");
  console.log("-".repeat(60));
  
  if (!commitmentData) {
    console.log("⏭️  Skipped (Test 1 failed)");
    return null;
  }
  
  try {
    // Simulate what buildStage3VC does
    const txHashCommitment = {
      commitment: commitmentData.commitment,
      proof: commitmentData.proof,
      protocol: "bulletproofs-pedersen",
      version: "1.0",
      encoding: "hex",
    };
    
    const mockVC = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential"],
      schemaVersion: "1.0",
      issuer: {
        id: "did:ethr:1337:0x1234567890123456789012345678901234567890",
        name: "Seller"
      },
      holder: {
        id: "did:ethr:1337:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        name: "Buyer"
      },
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: "did:ethr:1337:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        productName: "Test Product",
        batch: "BATCH001",
        quantity: 1,
        previousCredential: "QmTest123",
        componentCredentials: [],
        certificateCredential: {
          name: "",
          cid: ""
        },
        price: JSON.stringify({ hidden: true }),
        transactionId: MOCK_TX_HASH, // Backward compatibility
        txHashCommitment: txHashCommitment, // NEW
      },
      proof: []
    };
    
    console.log("✅ VC created with:");
    console.log(`   transactionId: ${mockVC.credentialSubject.transactionId ? "✅ Present" : "❌ Missing"}`);
    console.log(`   txHashCommitment: ${mockVC.credentialSubject.txHashCommitment ? "✅ Present" : "❌ Missing"}`);
    console.log(`   Commitment in VC: ${mockVC.credentialSubject.txHashCommitment?.commitment?.substring(0, 20)}...`);
    
    // Verify structure
    if (!mockVC.credentialSubject.txHashCommitment) {
      throw new Error("txHashCommitment not in VC");
    }
    
    if (!mockVC.credentialSubject.txHashCommitment.commitment) {
      throw new Error("commitment missing in txHashCommitment");
    }
    
    if (!mockVC.credentialSubject.txHashCommitment.proof) {
      throw new Error("proof missing in txHashCommitment");
    }
    
    return mockVC;
  } catch (error) {
    console.error("❌ Test 3 FAILED:", error.message);
    return null;
  }
}

// Test 4: Extract and verify commitment from VC
async function test4_ExtractAndVerifyFromVC(vc) {
  console.log("\n📝 Test 4: Extract and Verify Commitment from VC");
  console.log("-".repeat(60));
  
  if (!vc) {
    console.log("⏭️  Skipped (Test 3 failed)");
    return false;
  }
  
  try {
    // Simulate extractTxHashCommitment
    const txHashCommitment = vc?.credentialSubject?.txHashCommitment;
    
    if (!txHashCommitment) {
      throw new Error("txHashCommitment not found in VC");
    }
    
    if (!txHashCommitment.commitment || !txHashCommitment.proof) {
      throw new Error("txHashCommitment is malformed");
    }
    
    console.log("✅ Commitment extracted from VC:");
    console.log(`   Commitment: ${txHashCommitment.commitment.substring(0, 20)}...`);
    console.log(`   Protocol: ${txHashCommitment.protocol}`);
    console.log(`   Version: ${txHashCommitment.version}`);
    
    // Verify using API
    const response = await fetch(`${ZKP_BACKEND_URL}/zkp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitment: txHashCommitment.commitment,
        proof: txHashCommitment.proof,
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    console.log(`✅ Verification from VC: ${data.verified}`);
    
    if (!data.verified) {
      throw new Error("Commitment verification failed from VC");
    }
    
    return true;
  } catch (error) {
    console.error("❌ Test 4 FAILED:", error.message);
    console.error("   VC structure:", JSON.stringify(vc?.credentialSubject?.txHashCommitment, null, 2));
    return false;
  }
}

// Test 5: Check EIP-712 signing payload (should exclude txHashCommitment)
async function test5_CheckSigningPayload(vc) {
  console.log("\n📝 Test 5: Check EIP-712 Signing Payload");
  console.log("-".repeat(60));
  
  if (!vc) {
    console.log("⏭️  Skipped (Test 3 failed)");
    return false;
  }
  
  try {
    // Simulate preparePayloadForSigning (from signVcWithMetamask.js)
    const clone = JSON.parse(JSON.stringify(vc));
    delete clone.proof;
    
    if (clone.credentialSubject?.vcHash) {
      delete clone.credentialSubject.vcHash;
    }
    if (clone.credentialSubject?.transactionId !== undefined) {
      delete clone.credentialSubject.transactionId;
    }
    if (clone.credentialSubject?.txHashCommitment !== undefined) {
      delete clone.credentialSubject.txHashCommitment;
    }
    
    // Check that txHashCommitment is removed
    if (clone.credentialSubject?.txHashCommitment) {
      throw new Error("txHashCommitment should be removed from signing payload");
    }
    
    // Check that transactionId is removed
    if (clone.credentialSubject?.transactionId) {
      throw new Error("transactionId should be removed from signing payload");
    }
    
    // Check that other fields are still present
    if (!clone.credentialSubject?.productName) {
      throw new Error("productName should be present in signing payload");
    }
    
    console.log("✅ Signing payload is correct:");
    console.log(`   txHashCommitment excluded: ${!clone.credentialSubject?.txHashCommitment}`);
    console.log(`   transactionId excluded: ${!clone.credentialSubject?.transactionId}`);
    console.log(`   productName present: ${!!clone.credentialSubject?.productName}`);
    
    return true;
  } catch (error) {
    console.error("❌ Test 5 FAILED:", error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log("\n🚀 Starting Full Flow Tests...\n");
  
  const results = {
    test1: false,
    test2: false,
    test3: false,
    test4: false,
    test5: false,
  };
  
  let commitmentData = null;
  let vc = null;
  
  // Test 1: Generate commitment
  commitmentData = await test1_GenerateCommitment();
  results.test1 = !!commitmentData;
  
  // Test 2: Verify commitment
  results.test2 = await test2_VerifyCommitment(commitmentData);
  
  // Test 3: Create VC
  vc = await test3_CreateVCWithCommitment(commitmentData);
  results.test3 = !!vc;
  
  // Test 4: Extract and verify from VC
  results.test4 = await test4_ExtractAndVerifyFromVC(vc);
  
  // Test 5: Check signing payload
  results.test5 = await test5_CheckSigningPayload(vc);
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Results Summary");
  console.log("=".repeat(60));
  console.log(`Test 1 (Generate Commitment):     ${results.test1 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Test 2 (Verify Commitment):       ${results.test2 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Test 3 (Create VC):                ${results.test3 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Test 4 (Extract & Verify from VC): ${results.test4 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Test 5 (Check Signing Payload):    ${results.test5 ? "✅ PASS" : "❌ FAIL"}`);
  console.log("=".repeat(60));
  
  const allPassed = Object.values(results).every(r => r === true);
  if (allPassed) {
    console.log("✅ ALL TESTS PASSED!");
  } else {
    console.log("❌ SOME TESTS FAILED - Check errors above");
  }
  console.log("=".repeat(60));
  
  return { results, vc, commitmentData };
}

// Export for use in browser console or Node.js
if (typeof window !== 'undefined') {
  window.testFullFlow = runAllTests;
} else if (typeof module !== 'undefined') {
  module.exports = { runAllTests, test1_GenerateCommitment, test2_VerifyCommitment, test3_CreateVCWithCommitment, test4_ExtractAndVerifyFromVC, test5_CheckSigningPayload };
}

// Run if executed directly
if (typeof window === 'undefined' && typeof process !== 'undefined' && require.main === module) {
  runAllTests().then(({ results }) => {
    process.exit(Object.values(results).every(r => r === true) ? 0 : 1);
  }).catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}


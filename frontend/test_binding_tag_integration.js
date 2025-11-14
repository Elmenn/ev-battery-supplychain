// Integration test script for binding tag flow
// Run with: node test_binding_tag_integration.js
// Or use in browser console after product creation

/**
 * Test binding tag generation and verification
 * This script tests the complete binding tag flow
 */

async function testBindingTagIntegration() {
  console.log('🧪 Testing Binding Tag Integration\n');

  // Test 1: Verify binding tag is in VC
  console.log('Test 1: Verify binding tag is in VC');
  try {
    const vcJson = localStorage.getItem('vcDraft');
    if (!vcJson) {
      console.error('❌ No VC draft found in localStorage');
      return;
    }
    
    const vc = JSON.parse(vcJson);
    const priceObj = typeof vc.credentialSubject?.price === 'string' 
      ? JSON.parse(vc.credentialSubject.price) 
      : vc.credentialSubject?.price;
    
    const zkpProof = priceObj?.zkpProof;
    
    if (!zkpProof) {
      console.error('❌ No ZKP proof found in VC');
      return;
    }
    
    console.log('✅ ZKP proof found');
    console.log('   Commitment:', zkpProof.commitment);
    console.log('   Proof length:', zkpProof.proof?.length || 0);
    console.log('   Binding tag:', zkpProof.bindingTag || 'NOT FOUND');
    console.log('   Binding context:', zkpProof.bindingContext || 'NOT FOUND');
    
    if (zkpProof.bindingTag) {
      console.log('   ✅ Binding tag exists');
      if (zkpProof.bindingTag.length === 66) {
        console.log('   ✅ Binding tag has correct length (66 chars)');
      } else {
        console.error('   ❌ Binding tag has incorrect length:', zkpProof.bindingTag.length);
      }
    } else {
      console.warn('   ⚠️ Binding tag not found (backward compatible)');
    }
    
    if (zkpProof.bindingContext) {
      console.log('   ✅ Binding context exists');
      console.log('      Chain ID:', zkpProof.bindingContext.chainId);
      console.log('      Escrow Addr:', zkpProof.bindingContext.escrowAddr);
      console.log('      Product ID:', zkpProof.bindingContext.productId);
      console.log('      Stage:', zkpProof.bindingContext.stage);
      console.log('      Schema Version:', zkpProof.bindingContext.schemaVersion);
      if (zkpProof.bindingContext.previousVCCid) {
        console.log('      Previous VC CID:', zkpProof.bindingContext.previousVCCid);
      }
    } else {
      console.warn('   ⚠️ Binding context not found');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 2: Verify ZKP proof with binding tag
  console.log('\nTest 2: Verify ZKP proof with binding tag');
  try {
    const vcJson = localStorage.getItem('vcDraft');
    const vc = JSON.parse(vcJson);
    const priceObj = typeof vc.credentialSubject?.price === 'string' 
      ? JSON.parse(vc.credentialSubject.price) 
      : vc.credentialSubject?.price;
    
    const zkpProof = priceObj?.zkpProof;
    
    if (!zkpProof || !zkpProof.bindingTag) {
      console.warn('⚠️ Skipping binding tag verification (no binding tag found)');
      return;
    }
    
    const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
    
    // Verify with correct binding tag
    console.log('   Verifying with correct binding tag...');
    const res1 = await fetch(`${zkpBackendUrl}/zkp/verify-value-commitment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commitment: zkpProof.commitment,
        proof: zkpProof.proof,
        binding_tag_hex: zkpProof.bindingTag,
      }),
    });
    const data1 = await res1.json();
    console.log('   Result:', data1);
    
    if (data1.verified) {
      console.log('   ✅ ZKP proof verified with correct binding tag');
    } else {
      console.error('   ❌ ZKP proof verification failed with correct binding tag');
    }
    
    // Verify with wrong binding tag (should fail)
    console.log('   Verifying with wrong binding tag (should fail)...');
    const wrongBindingTag = '0x' + '0'.repeat(64);
    const res2 = await fetch(`${zkpBackendUrl}/zkp/verify-value-commitment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commitment: zkpProof.commitment,
        proof: zkpProof.proof,
        binding_tag_hex: wrongBindingTag,
      }),
    });
    const data2 = await res2.json();
    console.log('   Result:', data2);
    
    if (!data2.verified) {
      console.log('   ✅ ZKP proof correctly rejected with wrong binding tag');
    } else {
      console.error('   ❌ ZKP proof incorrectly verified with wrong binding tag');
    }
    
    // Verify without binding tag (should fail if proof was generated with binding tag)
    console.log('   Verifying without binding tag (should fail)...');
    const res3 = await fetch(`${zkpBackendUrl}/zkp/verify-value-commitment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commitment: zkpProof.commitment,
        proof: zkpProof.proof,
        // No binding_tag_hex
      }),
    });
    const data3 = await res3.json();
    console.log('   Result:', data3);
    
    if (!data3.verified) {
      console.log('   ✅ ZKP proof correctly rejected without binding tag');
    } else {
      console.warn('   ⚠️ ZKP proof verified without binding tag (backward compatible)');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n✅ Integration tests complete!');
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.testBindingTagIntegration = testBindingTagIntegration;
}

// Run if in Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testBindingTagIntegration };
}

// Auto-run if in browser console
if (typeof window !== 'undefined' && window.location) {
  console.log('💡 Run testBindingTagIntegration() in console to test binding tag integration');
}


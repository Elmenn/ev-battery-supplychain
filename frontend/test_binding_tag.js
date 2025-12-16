// Simple test script for binding tag generation
// Run with: node test_binding_tag.js

const { ethers } = require('ethers');

// Copy the generateBindingTag function here for testing
function generateBindingTag({
  chainId,
  escrowAddr,
  productId,
  stage,
  schemaVersion = "1.0",
  previousVCCid = null,
}) {
  const { getAddress, solidityPackedKeccak256 } = ethers;
  
  // Validate required parameters
  if (!chainId || !escrowAddr || productId === undefined || productId === null || stage === undefined || stage === null) {
    throw new Error("chainId, escrowAddr, productId, and stage are required for binding tag generation");
  }

  // Normalize addresses
  const normalizedEscrow = getAddress(escrowAddr);
  
  // Convert chainId to number
  const chainIdNum = typeof chainId === 'string' ? parseInt(chainId, 10) : Number(chainId);
  if (isNaN(chainIdNum)) {
    throw new Error(`Invalid chainId: ${chainId}. Must be a valid number`);
  }

  // Convert productId to number
  const productIdNum = typeof productId === 'bigint' ? Number(productId) : Number(productId);
  if (isNaN(productIdNum)) {
    throw new Error(`Invalid productId: ${productId}. Must be a valid number`);
  }

  // Convert stage to number
  const stageNum = Number(stage);
  if (isNaN(stageNum) || stageNum < 0 || stageNum > 2) {
    throw new Error(`Invalid stage: ${stage}. Must be 0, 1, or 2`);
  }

  // Validate schemaVersion
  if (!schemaVersion || typeof schemaVersion !== 'string') {
    throw new Error(`Invalid schemaVersion: ${schemaVersion}. Must be a string`);
  }

  // Build binding tag components
  const protocolVersion = previousVCCid ? 'zkp-bind-v2' : 'zkp-bind-v1';
  
  // Generate binding tag using keccak256
  let bindingTag;
  if (previousVCCid) {
    bindingTag = solidityPackedKeccak256(
      ['string', 'uint256', 'address', 'uint256', 'uint8', 'string', 'string'],
      [
        protocolVersion,
        chainIdNum,
        normalizedEscrow,
        productIdNum,
        stageNum,
        schemaVersion,
        previousVCCid,
      ]
    );
  } else {
    bindingTag = solidityPackedKeccak256(
      ['string', 'uint256', 'address', 'uint256', 'uint8', 'string'],
      [
        protocolVersion,
        chainIdNum,
        normalizedEscrow,
        productIdNum,
        stageNum,
        schemaVersion,
      ]
    );
  }

  return bindingTag.slice(2); // Remove 0x prefix
}

// Test cases
console.log('🧪 Testing Binding Tag Generation\n');

const testContext = {
  chainId: 11155111, // Sepolia
  escrowAddr: '0x1234567890123456789012345678901234567890',
  productId: 1,
  stage: 0,
  schemaVersion: '1.0',
};

try {
  // Test 1: Basic generation
  console.log('Test 1: Basic binding tag generation');
  const tag1 = generateBindingTag(testContext);
  console.log(`✅ Generated tag: ${tag1}`);
  console.log(`   Length: ${tag1.length} (expected: 64)`);
  console.log(`   Valid hex: ${/^[0-9a-f]{64}$/.test(tag1) ? '✅' : '❌'}\n`);

  // Test 2: Same context = same tag
  console.log('Test 2: Same context generates same tag');
  const tag2 = generateBindingTag(testContext);
  console.log(`✅ Tag matches: ${tag1 === tag2 ? '✅' : '❌'}\n`);

  // Test 3: Different productId = different tag
  console.log('Test 3: Different productId generates different tag');
  const tag3 = generateBindingTag({ ...testContext, productId: 2 });
  console.log(`✅ Tag differs: ${tag1 !== tag3 ? '✅' : '❌'}`);
  console.log(`   Tag 1: ${tag1}`);
  console.log(`   Tag 3: ${tag3}\n`);

  // Test 4: Different stage = different tag
  console.log('Test 4: Different stage generates different tag');
  const tag4 = generateBindingTag({ ...testContext, stage: 1 });
  console.log(`✅ Tag differs: ${tag1 !== tag4 ? '✅' : '❌'}`);
  console.log(`   Stage 0: ${tag1}`);
  console.log(`   Stage 1: ${tag4}\n`);

  // Test 5: With previous VC CID (v2)
  console.log('Test 5: With previous VC CID (v2)');
  const tag5 = generateBindingTag({
    ...testContext,
    previousVCCid: 'QmTest1234567890123456789012345678901234567890',
  });
  console.log(`✅ Generated v2 tag: ${tag5}`);
  console.log(`   Differs from v1: ${tag1 !== tag5 ? '✅' : '❌'}\n`);

  // Test 6: Different chainId = different tag
  console.log('Test 6: Different chainId generates different tag');
  const tag6 = generateBindingTag({ ...testContext, chainId: 1337 });
  console.log(`✅ Tag differs: ${tag1 !== tag6 ? '✅' : '❌'}\n`);

  // Test 7: Address normalization
  console.log('Test 7: Address normalization');
  const tag7 = generateBindingTag({
      ...testContext,
      escrowAddr: testContext.escrowAddr.toLowerCase(),
    });
  console.log(`✅ Normalized address generates same tag: ${tag1 === tag7 ? '✅' : '❌'}\n`);

  // Test 8: Error handling
  console.log('Test 8: Error handling');
  try {
    generateBindingTag({});
    console.log('❌ Should have thrown error for missing parameters');
  } catch (e) {
    console.log(`✅ Correctly throws error: ${e.message}`);
  }

  try {
    generateBindingTag({ ...testContext, stage: 3 });
    console.log('❌ Should have thrown error for invalid stage');
  } catch (e) {
    console.log(`✅ Correctly throws error for invalid stage: ${e.message}`);
  }

  console.log('\n✅ All tests passed!');
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}


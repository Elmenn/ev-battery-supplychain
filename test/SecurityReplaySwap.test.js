// Test 6.1: Replay and Swap Attack Prevention
// Verifies that binding tags prevent replay and swap attacks

const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const truffleAssert = require("truffle-assertions");
const { toWei } = web3.utils;
const axios = require('axios');
const crypto = require('crypto');

const ZKP_BACKEND = 'http://127.0.0.1:5010';

contract("Security: Replay and Swap Attack Prevention", (accounts) => {
  const [seller, buyer] = accounts;
  let factory, implementation;
  
  // Test parameters
  const value = 1000000; // 1,000,000 (in wei units, but we use as u64 for ZKP)
  const chainId = "11155111"; // Sepolia
  const schemaVersion = "1.0";
  const productId = 14;
  const stage = 0;

  beforeEach(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  // Helper function to compute blinding factor (deterministic)
  // In production: keccak256(abi.encodePacked(escrowAddr, owner))
  function computeBlinding(escrowAddr, owner) {
    const encoded = web3.eth.abi.encodeParameters(
      ['address', 'address'],
      [escrowAddr, owner]
    );
    return web3.utils.keccak256(encoded);
  }

  // Helper function to compute binding tag
  // Matches Rust implementation: sha256(chainId || escrowAddr || productId_le || stage || schemaVersion || previousVCCid)
  function computeBindingTag(chainId, escrowAddr, productId, stage, schemaVersion, previousVCCid = null) {
    // Convert escrowAddr to bytes (remove 0x, convert hex to bytes)
    const escrowBytes = Buffer.from(escrowAddr.replace('0x', ''), 'hex');
    
    // Convert productId to little-endian bytes (8 bytes for u64)
    const productIdBuffer = Buffer.allocUnsafe(8);
    productIdBuffer.writeUInt32LE(productId, 0);
    productIdBuffer.writeUInt32LE(0, 4); // u64 is 8 bytes, but we use u32 for productId
    
    // Stage as single byte
    const stageBuffer = Buffer.from([stage]);
    
    // String values as UTF-8 bytes
    const chainIdBytes = Buffer.from(chainId, 'utf8');
    const schemaVersionBytes = Buffer.from(schemaVersion, 'utf8');
    
    // Concatenate all parts
    const parts = [
      chainIdBytes,
      escrowBytes,
      productIdBuffer,
      stageBuffer,
      schemaVersionBytes
    ];
    
    if (previousVCCid) {
      parts.push(Buffer.from(previousVCCid, 'utf8'));
    }
    
    const concatenated = Buffer.concat(parts);
    

    // Use SHA256 to match Rust implementation exactly
    const hash = crypto.createHash('sha256').update(concatenated).digest();
    return '0x' + hash.toString('hex');
  }

  // Helper function to generate proof via ZKP backend
  async function generateProof(value, blindingHex, bindingTagHex = null) {
    const url = `${ZKP_BACKEND}/zkp/generate-value-commitment-with-binding`;
    const payload = {
      value: value,
      blinding_hex: blindingHex.replace('0x', ''),
      binding_tag_hex: bindingTagHex ? bindingTagHex.replace('0x', '') : null
    };
    
    try {
      const response = await axios.post(url, payload, { timeout: 5000 });
      return {
        commitment: '0x' + response.data.commitment,
        proof: '0x' + response.data.proof,
        verified: response.data.verified
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`ZKP backend not running. Please start it with: cd zkp-backend && cargo run (Error: ${error.message})`);
      }
      throw new Error(`ZKP backend error: ${error.message}`);
    }
  }

  // Helper function to verify proof via ZKP backend
  async function verifyProof(commitmentHex, proofHex, bindingTagHex = null) {
    const url = `${ZKP_BACKEND}/zkp/verify-value-commitment`;
    const payload = {
      commitment: commitmentHex.replace('0x', ''),
      proof: proofHex.replace('0x', ''),
      binding_tag_hex: bindingTagHex ? bindingTagHex.replace('0x', '') : null
    };
    
    try {
      const response = await axios.post(url, payload, { timeout: 5000 });
      return response.data.verified;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`ZKP backend not running. Please start it with: cd zkp-backend && cargo run (Error: ${error.message})`);
      }
      throw new Error(`ZKP backend error: ${error.message}`);
    }
  }

  describe("Replay Attack Prevention", () => {
    it("should prevent replay attacks (extract proof from VC A, use in VC B)", async () => {
      // Create two products (VC A and VC B) with different vcCids
      const productNameA = "Product A";
      const productNameB = "Product B";
      const commitmentA = web3.utils.randomHex(32);
      const commitmentB = web3.utils.randomHex(32);
      const price = toWei("1", "ether");

      // Create Product A
      const txA = await factory.createProduct(productNameA, commitmentA, price, { from: seller });
      const productAddressA = txA.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrowA = await ProductEscrow_Initializer.at(productAddressA);

      // Create Product B
      const txB = await factory.createProduct(productNameB, commitmentB, price, { from: seller });
      const productAddressB = txB.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrowB = await ProductEscrow_Initializer.at(productAddressB);

      // Generate proof for VC A
      const vcCidA = "QmVCACID123456789";
      const blindingA = computeBlinding(productAddressA, seller);
      const bindingTagA = computeBindingTag(chainId, productAddressA, productId, stage, schemaVersion, vcCidA);
      
      const proofA = await generateProof(value, blindingA, bindingTagA);
      assert.isTrue(proofA.verified, "Proof A should verify with correct binding tag");

      // Attempt to use proof A against VC B's binding tag (replay attack)
      const vcCidB = "QmVCBCID987654321"; // Different CID
      const bindingTagB = computeBindingTag(chainId, productAddressB, productId, stage, schemaVersion, vcCidB);
      
      const verifiedReplay = await verifyProof(proofA.commitment, proofA.proof, bindingTagB);
      assert.isFalse(verifiedReplay, "Proof A should NOT verify with VC B's binding tag (replay attack prevented)");
    });
  });

  describe("Swap Attack Prevention", () => {
    it("should prevent swap attacks (copy proof between credentials with same commitment)", async () => {
      // Create two credentials (X and Y) with the same commitment C
      const commitmentC = web3.utils.randomHex(32);
      const price = toWei("1", "ether");

      // Create Product X
      const txX = await factory.createProduct("Product X", commitmentC, price, { from: seller });
      const productAddressX = txX.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrowX = await ProductEscrow_Initializer.at(productAddressX);

      // Create Product Y (same commitment C)
      const txY = await factory.createProduct("Product Y", commitmentC, price, { from: seller });
      const productAddressY = txY.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrowY = await ProductEscrow_Initializer.at(productAddressY);

      // Generate proof for credential X
      const vcCidX = "QmVCXCID123456789";
      const blindingX = computeBlinding(productAddressX, seller);
      const bindingTagX = computeBindingTag(chainId, productAddressX, productId, stage, schemaVersion, vcCidX);
      
      const proofX = await generateProof(value, blindingX, bindingTagX);
      assert.isTrue(proofX.verified, "Proof X should verify with correct binding tag");

      // Attempt to use proof X against credential Y's binding tag (swap attack)
      const vcCidY = "QmVCYCID987654321"; // Different CID
      const bindingTagY = computeBindingTag(chainId, productAddressY, productId, stage, schemaVersion, vcCidY);
      
      const verifiedSwap = await verifyProof(proofX.commitment, proofX.proof, bindingTagY);
      assert.isFalse(verifiedSwap, "Proof X should NOT verify with credential Y's binding tag (swap attack prevented)");
    });
  });

  describe("Wrong Commitment Prevention", () => {
    it("should reject proof with wrong commitment", async () => {
      const commitment = web3.utils.randomHex(32);
      const price = toWei("1", "ether");

      const tx = await factory.createProduct("Test Product", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);

      // Generate proof with correct commitment
      const vcCid = "QmTestCID123456789";
      const blinding = computeBlinding(productAddress, seller);
      const bindingTag = computeBindingTag(chainId, productAddress, productId, stage, schemaVersion, vcCid);
      
      const proof = await generateProof(value, blinding, bindingTag);
      assert.isTrue(proof.verified, "Proof should verify with correct commitment and binding tag");

      // Attempt to verify with wrong commitment
      const wrongCommitment = web3.utils.randomHex(32);
      const verifiedWrong = await verifyProof(wrongCommitment, proof.proof, bindingTag);
      assert.isFalse(verifiedWrong, "Proof should NOT verify with wrong commitment");
    });
  });

  describe("Wrong Binding Tag Prevention", () => {
    it("should reject proof with wrong binding tag", async () => {
      const commitment = web3.utils.randomHex(32);
      const price = toWei("1", "ether");

      const tx = await factory.createProduct("Test Product", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);

      // Generate proof with correct binding tag
      const vcCid = "QmTestCID123456789";
      const blinding = computeBlinding(productAddress, seller);
      const bindingTag = computeBindingTag(chainId, productAddress, productId, stage, schemaVersion, vcCid);
      
      const proof = await generateProof(value, blinding, bindingTag);
      assert.isTrue(proof.verified, "Proof should verify with correct binding tag");

      // Attempt to verify with wrong binding tag
      const wrongBindingTag = web3.utils.randomHex(32);
      const verifiedWrong = await verifyProof(proof.commitment, proof.proof, wrongBindingTag);
      assert.isFalse(verifiedWrong, "Proof should NOT verify with wrong binding tag");
    });
  });

  describe("Wrong Chain/Context Prevention", () => {
    it("should prevent wrong chainId/escrowAddr attacks", async () => {
      const commitment = web3.utils.randomHex(32);
      const price = toWei("1", "ether");

      // Create product with context A (chainId=1, escrowAddr=addrA)
      const txA = await factory.createProduct("Product A", commitment, price, { from: seller });
      const productAddressA = txA.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrowA = await ProductEscrow_Initializer.at(productAddressA);

      // Create product with context B (chainId=5, escrowAddr=addrB)
      const txB = await factory.createProduct("Product B", commitment, price, { from: seller });
      const productAddressB = txB.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrowB = await ProductEscrow_Initializer.at(productAddressB);

      // Generate proof for context A (chainId=1, escrowAddr=addrA)
      const chainIdA = "1";
      const vcCidA = "QmVCACID123456789";
      const blindingA = computeBlinding(productAddressA, seller);
      const bindingTagA = computeBindingTag(chainIdA, productAddressA, productId, stage, schemaVersion, vcCidA);
      
      const proofA = await generateProof(value, blindingA, bindingTagA);
      assert.isTrue(proofA.verified, "Proof A should verify with context A's binding tag");

      // Attempt to verify against context B (chainId=5, escrowAddr=addrB)
      const chainIdB = "5";
      const vcCidB = "QmVCBCID987654321";
      const bindingTagB = computeBindingTag(chainIdB, productAddressB, productId, stage, schemaVersion, vcCidB);
      
      const verifiedWrongContext = await verifyProof(proofA.commitment, proofA.proof, bindingTagB);
      assert.isFalse(verifiedWrongContext, "Proof from context A should NOT verify with context B's binding tag (wrong chain/context prevented)");

      // Also test with same chainId but different escrowAddr
      const bindingTagB2 = computeBindingTag(chainIdA, productAddressB, productId, stage, schemaVersion, vcCidA);
      const verifiedWrongAddr = await verifyProof(proofA.commitment, proofA.proof, bindingTagB2);
      assert.isFalse(verifiedWrongAddr, "Proof from escrowAddr A should NOT verify with escrowAddr B's binding tag (wrong escrowAddr prevented)");
    });
  });

  describe("Valid Proof Verification", () => {
    it("should verify valid proof with correct commitment and binding tag", async () => {
      const commitment = web3.utils.randomHex(32);
      const price = toWei("1", "ether");

      const tx = await factory.createProduct("Test Product", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === 'ProductCreated').args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);

      // Generate proof with correct parameters
      const vcCid = "QmTestCID123456789";
      const blinding = computeBlinding(productAddress, seller);
      const bindingTag = computeBindingTag(chainId, productAddress, productId, stage, schemaVersion, vcCid);
      
      const proof = await generateProof(value, blinding, bindingTag);
      assert.isTrue(proof.verified, "Proof should verify during generation");

      // Verify proof separately
      const verified = await verifyProof(proof.commitment, proof.proof, bindingTag);
      assert.isTrue(verified, "Proof should verify with correct commitment and binding tag");
    });
  });
});


const fs = require('fs');
const path = require('path');
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const { toWei } = web3.utils;

contract("Baseline Comparison", (accounts) => {
  const [seller] = accounts;
  let factory, implementation, escrow;

  beforeEach(async () => {
    // Deploy implementation first
    implementation = await ProductEscrow_Initializer.new();
    
    // Deploy factory with implementation
    factory = await ProductFactory.new(implementation.address);
  });

  /**
   * Estimate gas cost for storing bytes array in Solidity
   * Based on EVM storage costs:
   * - First 32 bytes: 20,000 gas (SSTORE zero to non-zero)
   * - Each additional 32-byte chunk: 5,000 gas (SSTORE zero to non-zero)
   * - Length slot: 20,000 gas (if length >= 32)
   * 
   * @param {number} byteLength - Length of bytes array in bytes
   * @returns {number} Estimated gas cost
   */
  function estimateBytesStorageGas(byteLength) {
    if (byteLength === 0) return 0;
    
    // If length < 32, data fits in same slot as length (short bytes)
    if (byteLength < 32) {
      return 20000; // Single SSTORE (zero to non-zero)
    }
    
    // Long bytes: length slot + data slots
    const lengthSlotGas = 20000; // SSTORE for length
    const dataSlots = Math.ceil(byteLength / 32);
    
    // First data slot: 20,000 gas (zero to non-zero)
    // Additional slots: 5,000 gas each (zero to non-zero)
    const firstDataSlotGas = 20000;
    const additionalSlotsGas = (dataSlots - 1) * 5000;
    
    return lengthSlotGas + firstDataSlotGas + additionalSlotsGas;
  }

  /**
   * Estimate gas cost for storing string in Solidity
   * Similar to bytes, but with different encoding:
   * - Short strings (< 31 chars): length*2+1 encoding, data in same slot
   * - Long strings (>= 31 chars): length*2+1 in slot, data in separate slots
   * 
   * @param {number} byteLength - Length of string in bytes (UTF-8)
   * @returns {number} Estimated gas cost
   */
  function estimateStringStorageGas(byteLength) {
    if (byteLength === 0) return 0;
    
    // If length < 31, data fits in same slot as length (short string)
    if (byteLength < 31) {
      return 20000; // Single SSTORE (zero to non-zero)
    }
    
    // Long string: length slot + data slots
    const lengthSlotGas = 20000; // SSTORE for length encoding
    const dataSlots = Math.ceil(byteLength / 32);
    
    // First data slot: 20,000 gas (zero to non-zero)
    // Additional slots: 5,000 gas each (zero to non-zero)
    const firstDataSlotGas = 20000;
    const additionalSlotsGas = (dataSlots - 1) * 5000;
    
    return lengthSlotGas + firstDataSlotGas + additionalSlotsGas;
  }

  it("should estimate naïve on-chain VC storage", async () => {
    // Load sample VCs for S0, S1, S2
    const vcS0Path = path.join(__dirname, 'fixtures', 'sample-vc-s0.json');
    const vcS1Path = path.join(__dirname, 'fixtures', 'sample-vc-s1.json');
    const vcS2Path = path.join(__dirname, 'fixtures', 'sample-vc-s2.json');
    
    const vcS0 = JSON.parse(fs.readFileSync(vcS0Path, 'utf8'));
    const vcS1 = JSON.parse(fs.readFileSync(vcS1Path, 'utf8'));
    const vcS2 = JSON.parse(fs.readFileSync(vcS2Path, 'utf8'));
    
    // Measure UTF-8 encoded size (as would be stored in Solidity bytes array)
    const vcJsonS0 = JSON.stringify(vcS0);
    const vcJsonS1 = JSON.stringify(vcS1);
    const vcJsonS2 = JSON.stringify(vcS2);
    
    const vcSizeS0 = Buffer.from(vcJsonS0, 'utf8').length;
    const vcSizeS1 = Buffer.from(vcJsonS1, 'utf8').length;
    const vcSizeS2 = Buffer.from(vcJsonS2, 'utf8').length;
    
    // Estimate gas for storing as bytes array (no compression, no CBOR)
    const gasPerVCS0 = estimateBytesStorageGas(vcSizeS0);
    const gasPerVCS1 = estimateBytesStorageGas(vcSizeS1);
    const gasPerVCS2 = estimateBytesStorageGas(vcSizeS2);
    
    const totalGasNaive = gasPerVCS0 + gasPerVCS1 + gasPerVCS2;
    
    // Our approach: Store only CID as string (IPFS CID is typically ~46 bytes for CIDv0 or ~59 bytes for CIDv1)
    // Example CID: "QmeSTHELtvN6jjtEp58uMLVTfGqwc53Ts9UE4aa6j2Y2Ub" (46 bytes)
    // We store 3 CIDs (one per stage)
    const cidSize = 46; // Typical IPFS CIDv0 size
    const gasPerCID = estimateStringStorageGas(cidSize);
    const totalGasOurApproach = gasPerCID * 3; // 3 stages: S0, S1, S2
    
    // Calculate gas savings
    const gasSavings = totalGasNaive - totalGasOurApproach;
    const gasSavingsPercentage = ((gasSavings / totalGasNaive) * 100).toFixed(2);
    
    // Output results
    console.log("\n=== Baseline Comparison: Naïve On-Chain VC Storage ===");
    console.log("\nVC Sizes (UTF-8 JSON):");
    console.log("  S0 (Stage 0 - Product Listing):", vcSizeS0, "bytes");
    console.log("  S1 (Stage 1 - Purchase):", vcSizeS1, "bytes");
    console.log("  S2 (Stage 2 - Delivery):", vcSizeS2, "bytes");
    console.log("  Total:", vcSizeS0 + vcSizeS1 + vcSizeS2, "bytes");
    
    console.log("\nEncoding: UTF-8 JSON in Solidity bytes array (no compression, no CBOR)");
    console.log("Writes per product: 3 (once per stage: S0, S1, S2)");
    
    console.log("\nEstimated Gas Costs (Naïve Approach - Full VC Storage):");
    console.log("  S0:", gasPerVCS0, "gas");
    console.log("  S1:", gasPerVCS1, "gas");
    console.log("  S2:", gasPerVCS2, "gas");
    console.log("  Total:", totalGasNaive, "gas");
    
    console.log("\nOur Approach (CID Anchors Only):");
    console.log("  CID size per stage:", cidSize, "bytes");
    console.log("  Gas per CID:", gasPerCID, "gas");
    console.log("  Total (3 CIDs):", totalGasOurApproach, "gas");
    
    console.log("\nGas Savings:");
    console.log("  Absolute savings:", gasSavings, "gas");
    console.log("  Percentage savings:", gasSavingsPercentage + "%");
    
    console.log("\n=== Summary ===");
    console.log("Sample VC size (S0):", vcSizeS0, "bytes");
    console.log("Sample VC size (S1):", vcSizeS1, "bytes");
    console.log("Sample VC size (S2):", vcSizeS2, "bytes");
    console.log("Encoding: UTF-8 JSON in Solidity bytes array (no compression)");
    console.log("Number of writes per product: 3 (once per stage: S0, S1, S2)");
    console.log("Estimated gas per write (S0):", gasPerVCS0, "gas");
    console.log("Estimated gas per write (S1):", gasPerVCS1, "gas");
    console.log("Estimated gas per write (S2):", gasPerVCS2, "gas");
    console.log("Total estimated gas per product (3 writes):", totalGasNaive, "gas");
    console.log("Our approach gas (anchors only):", totalGasOurApproach, "gas");
    console.log("Gas savings percentage:", gasSavingsPercentage + "%");
    
    // Verify our approach is significantly cheaper
    assert.isTrue(totalGasOurApproach < totalGasNaive, "Our approach should be cheaper than naïve storage");
    assert.isTrue(parseFloat(gasSavingsPercentage) > 90, "Gas savings should be > 90%");
  });
});


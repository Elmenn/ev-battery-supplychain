const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const { toWei } = web3.utils;

contract("Storage Measurement", (accounts) => {
  const [seller, buyer, transporter] = accounts;
  let factory, implementation, escrow;

  beforeEach(async () => {
    // Deploy implementation first
    implementation = await ProductEscrow_Initializer.new();
    
    // Deploy factory with implementation
    factory = await ProductFactory.new(implementation.address);
  });

  // Helper function to get string storage size
  async function getStringStorageSize(contract, slot) {
    // String storage: slot contains length*2+1 (if length < 31, data is in same slot)
    // If length >= 31, slot contains length*2+1, data starts at keccak256(slot)
    const lengthSlot = await web3.eth.getStorageAt(contract.address, slot);
    const lengthEncoded = web3.utils.toBN(lengthSlot);
    
    if (lengthEncoded.isZero()) return 0;
    
    // For strings: encoding is length*2+1
    // If the encoded value is odd and < 63, it's a short string (data in same slot)
    // Otherwise, extract length and calculate data slots
    const isOdd = lengthEncoded.mod(web3.utils.toBN(2)).eq(web3.utils.toBN(1));
    if (!isOdd) return 0; // Invalid encoding
    
    const actualLength = lengthEncoded.sub(web3.utils.toBN(1)).div(web3.utils.toBN(2)).toNumber();
    
    if (actualLength === 0) return 0;
    
    if (actualLength < 31) {
      // Short string: data fits in same slot (1 slot total)
      return 1;
    } else {
      // Long string: 1 slot for length + data slots
      // String data: each character is 1 byte, stored in 32-byte chunks
      const dataSlots = Math.ceil(actualLength / 32);
      return 1 + dataSlots;
    }
  }

  // Helper function to get bytes storage size
  async function getBytesStorageSize(contract, slot) {
    // Bytes storage: slot contains length (if length < 32, data is in same slot)
    // If length >= 32, slot contains length, data starts at keccak256(slot)
    const lengthSlot = await web3.eth.getStorageAt(contract.address, slot);
    const length = web3.utils.toBN(lengthSlot).toNumber();
    
    if (length === 0) return 0;
    
    if (length < 32) {
      // Short bytes: data fits in same slot
      return 1;
    } else {
      // Long bytes: 1 slot for length + data slots
      const dataSlots = Math.ceil(length / 32);
      return 1 + dataSlots;
    }
  }

  it("should measure on-chain storage per product", async () => {
    // Create a product and go through full lifecycle to measure storage at different stages
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const priceWei = toWei("1", "ether");
    const vcCID = "ipfs://QmTest123456789012345678901234567890"; // 46 bytes
    const finalVCID = "ipfs://QmFinal123456789012345678901234567890"; // 50 bytes

    // Create product
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    escrow = await ProductEscrow_Initializer.at(productAddress);

    // Measure storage after creation (Listed phase)
    console.log("\n=== Storage Measurement: After Product Creation ===");
    let storageBreakdown = await measureStorage(escrow);
    console.log("Storage slots:", storageBreakdown.totalSlots);
    console.log("Total bytes:", storageBreakdown.totalBytes);
    console.log("Breakdown:", JSON.stringify(storageBreakdown.breakdown, null, 2));

    // Set public price with commitment
    await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    console.log("\n=== Storage Measurement: After Setting Public Price ===");
    storageBreakdown = await measureStorage(escrow);
    console.log("Storage slots:", storageBreakdown.totalSlots);
    console.log("Total bytes:", storageBreakdown.totalBytes);

    // Purchase
    await escrow.purchasePublic({ from: buyer, value: priceWei });
    console.log("\n=== Storage Measurement: After Purchase ===");
    storageBreakdown = await measureStorage(escrow);
    console.log("Storage slots:", storageBreakdown.totalSlots);
    console.log("Total bytes:", storageBreakdown.totalBytes);

    // Confirm order
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
    console.log("\n=== Storage Measurement: After Order Confirmation ===");
    storageBreakdown = await measureStorage(escrow);
    console.log("Storage slots:", storageBreakdown.totalSlots);
    console.log("Total bytes:", storageBreakdown.totalBytes);

    // Set transporter
    await escrow.createTransporter(toWei("0.1", "ether"), { from: transporter });
    await escrow.securityDeposit({ from: transporter, value: toWei("0.5", "ether") });
    await escrow.setTransporter(transporter, { from: seller, value: toWei("0.1", "ether") });
    console.log("\n=== Storage Measurement: After Setting Transporter ===");
    storageBreakdown = await measureStorage(escrow);
    console.log("Storage slots:", storageBreakdown.totalSlots);
    console.log("Total bytes:", storageBreakdown.totalBytes);

    // Reveal and confirm delivery
    const blinding = web3.utils.soliditySha3(
      { type: "address", value: escrow.address },
      { type: "address", value: seller }
    );
    const revealedValue = web3.utils.toBN(priceWei);
    await escrow.revealAndConfirmDelivery(revealedValue, blinding, finalVCID, { from: buyer });
    console.log("\n=== Storage Measurement: After Delivery (Final State) ===");
    storageBreakdown = await measureStorage(escrow);
    console.log("Storage slots:", storageBreakdown.totalSlots);
    console.log("Total bytes:", storageBreakdown.totalBytes);
    console.log("Final Breakdown:", JSON.stringify(storageBreakdown.breakdown, null, 2));

    // Summary
    console.log("\n=== Storage Summary ===");
    console.log("Total storage slots per product (final state):", storageBreakdown.totalSlots);
    console.log("Total bytes per product (final state):", storageBreakdown.totalBytes);
    console.log("Bytes per slot (EVM standard): 32");
  });

  async function measureStorage(contract) {
    const breakdown = {};
    let totalSlots = 0;

    // Fixed-size variables (1 slot each, unless packed)
    // Slot 0: id (uint256) - 32 bytes
    breakdown.id = { slots: 1, bytes: 32, description: "Product ID (uint256)" };
    totalSlots += 1;

    // Slot 1: name (string) - dynamic
    const nameSlots = await getStringStorageSize(contract, 1);
    breakdown.name = { slots: nameSlots, bytes: nameSlots * 32, description: "Product name (string)" };
    totalSlots += nameSlots;

    // Slot 2: priceCommitment (bytes32) - 32 bytes
    breakdown.priceCommitment = { slots: 1, bytes: 32, description: "Price commitment (bytes32)" };
    totalSlots += 1;

    // Slot 3: owner (address) - 20 bytes, but takes full slot
    breakdown.owner = { slots: 1, bytes: 32, description: "Owner address (address)" };
    totalSlots += 1;

    // Slot 4: buyer (address) - 20 bytes, but takes full slot
    breakdown.buyer = { slots: 1, bytes: 32, description: "Buyer address (address)" };
    totalSlots += 1;

    // Slot 5: transporter (address) - 20 bytes, but takes full slot
    breakdown.transporter = { slots: 1, bytes: 32, description: "Transporter address (address)" };
    totalSlots += 1;

    // Slot 6: Packed - phase (enum, ~uint8) + purchaseTimestamp (uint64) + orderConfirmedTimestamp (uint64) 
    // + purchased (bool) + delivered (bool) + transporterCount (uint32)
    // Total: ~1 byte + 8 bytes + 8 bytes + 1 byte + 1 byte + 4 bytes = 23 bytes, fits in 1 slot
    breakdown.packedState = { 
      slots: 1, 
      bytes: 32, 
      description: "Packed: phase, purchaseTimestamp, orderConfirmedTimestamp, purchased, delivered, transporterCount" 
    };
    totalSlots += 1;

    // Slot 7: deliveryFee (uint256) - 32 bytes
    breakdown.deliveryFee = { slots: 1, bytes: 32, description: "Delivery fee (uint256)" };
    totalSlots += 1;

    // Slot 8: productPrice (uint256) - 32 bytes
    breakdown.productPrice = { slots: 1, bytes: 32, description: "Product price (uint256)" };
    totalSlots += 1;

    // Slot 9: vcCid (string) - dynamic
    const vcCidSlots = await getStringStorageSize(contract, 9);
    breakdown.vcCid = { slots: vcCidSlots, bytes: vcCidSlots * 32, description: "VC CID (string)" };
    totalSlots += vcCidSlots;

    // Slot 10: purchaseMode (enum, ~uint8) - might be packed, but let's count as 1 slot for safety
    breakdown.purchaseMode = { slots: 1, bytes: 32, description: "Purchase mode (enum)" };
    totalSlots += 1;

    // Slot 11: publicPriceWei (uint256) - 32 bytes
    breakdown.publicPriceWei = { slots: 1, bytes: 32, description: "Public price in wei (uint256)" };
    totalSlots += 1;

    // Slot 12: publicPriceCommitment (bytes32) - 32 bytes
    breakdown.publicPriceCommitment = { slots: 1, bytes: 32, description: "Public price commitment (bytes32)" };
    totalSlots += 1;

    // Slot 13: Packed - commitmentFrozen (bool) + publicEnabled (bool) + privateEnabled (bool) + stopped (bool)
    // Total: 1 + 1 + 1 + 1 = 4 bytes, fits in 1 slot
    breakdown.packedFlags = { 
      slots: 1, 
      bytes: 32, 
      description: "Packed: commitmentFrozen, publicEnabled, privateEnabled, stopped" 
    };
    totalSlots += 1;

    // Slot 14: _initialized (bool) - might be packed, but let's count as 1 slot
    breakdown.initialized = { slots: 1, bytes: 32, description: "Initialization flag (bool)" };
    totalSlots += 1;

    // Slot 15: factory (address) - 20 bytes, but takes full slot
    breakdown.factory = { slots: 1, bytes: 32, description: "Factory address (address)" };
    totalSlots += 1;

    // Slot 16: valueCommitment (bytes32) - 32 bytes
    breakdown.valueCommitment = { slots: 1, bytes: 32, description: "Value commitment (bytes32)" };
    totalSlots += 1;

    // Slot 17: valueRangeProof (bytes) - dynamic
    const proofSlots = await getBytesStorageSize(contract, 17);
    breakdown.valueRangeProof = { slots: proofSlots, bytes: proofSlots * 32, description: "Value range proof (bytes)" };
    totalSlots += proofSlots;

    // Note: Mappings and arrays don't take storage slots themselves (only their data does)
    // They use keccak256 hashing for storage locations
    // For this measurement, we're only counting the base product storage, not mapping entries

    const totalBytes = totalSlots * 32;

    return {
      totalSlots,
      totalBytes,
      breakdown
    };
  }
});


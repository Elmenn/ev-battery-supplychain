const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");
const { toWei } = web3.utils;

contract("Gas Measurement", (accounts) => {
  const [seller, buyer, transporter] = accounts;
  let factory, implementation;
  const RUNS = 10; // Number of runs per transaction

  beforeEach(async () => {
    // Deploy implementation first
    implementation = await ProductEscrow_Initializer.new();
    
    // Deploy factory with implementation
    factory = await ProductFactory.new(implementation.address);
  });

  // Helper function to calculate statistics
  function calculateStats(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    return { mean, min, max, stdDev };
  }

  // Helper function to count events
  function countEvents(receipt, eventName) {
    return receipt.logs.filter(log => log.event === eventName).length;
  }

  it("should measure createProduct gas", async () => {
    const gasUsed = [];
    const commitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");

    for (let i = 0; i < RUNS; i++) {
      const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
      gasUsed.push(tx.receipt.gasUsed);
    }

    const stats = calculateStats(gasUsed);
    console.log("\n=== createProduct Gas Statistics ===");
    console.log("Mean:", stats.mean);
    console.log("Min:", stats.min);
    console.log("Max:", stats.max);
    console.log("Std Dev:", stats.stdDev);
    console.log("Events:", countEvents(await factory.createProduct("Test Battery", commitment, price, { from: seller }).then(tx => tx.receipt), "ProductCreated"));
  });

  it("should measure setPublicPriceWithCommitment gas", async () => {
    const gasUsed = [];
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const priceWei = toWei("1", "ether");

    for (let i = 0; i < RUNS; i++) {
      const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);
      
      const setPriceTx = await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
      gasUsed.push(setPriceTx.receipt.gasUsed);
    }

    const stats = calculateStats(gasUsed);
    console.log("\n=== setPublicPriceWithCommitment Gas Statistics ===");
    console.log("Mean:", stats.mean);
    console.log("Min:", stats.min);
    console.log("Max:", stats.max);
    console.log("Std Dev:", stats.stdDev);
    
    // Count events for one run
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const escrow = await ProductEscrow_Initializer.at(productAddress);
    const setPriceTx = await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    const events = countEvents(setPriceTx.receipt, "PublicPriceSet") + countEvents(setPriceTx.receipt, "PublicPriceCommitmentSet");
    console.log("Events:", events);
  });

  it("should measure purchasePublic gas", async () => {
    const gasUsed = [];
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const priceWei = toWei("1", "ether");

    for (let i = 0; i < RUNS; i++) {
      const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);
      
      await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
      
      const purchaseTx = await escrow.purchasePublic({ from: buyer, value: priceWei });
      gasUsed.push(purchaseTx.receipt.gasUsed);
    }

    const stats = calculateStats(gasUsed);
    console.log("\n=== purchasePublic Gas Statistics ===");
    console.log("Mean:", stats.mean);
    console.log("Min:", stats.min);
    console.log("Max:", stats.max);
    console.log("Std Dev:", stats.stdDev);
    
    // Count events for one run
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const escrow = await ProductEscrow_Initializer.at(productAddress);
    await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    const purchaseTx = await escrow.purchasePublic({ from: buyer, value: priceWei });
    const events = countEvents(purchaseTx.receipt, "PurchasedPublic") + countEvents(purchaseTx.receipt, "PhaseChanged") + countEvents(purchaseTx.receipt, "ProductStateChanged");
    console.log("Events:", events);
  });

  it("should measure confirmOrderWithCommitment gas (without purchase commitment)", async () => {
    const gasUsed = [];
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const priceWei = toWei("1", "ether");
    const vcCID = "ipfs://QmTest";
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";

    for (let i = 0; i < RUNS; i++) {
      const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);
      
      await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
      await escrow.purchasePublic({ from: buyer, value: priceWei });
      
      const confirmTx = await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
      gasUsed.push(confirmTx.receipt.gasUsed);
    }

    const stats = calculateStats(gasUsed);
    console.log("\n=== confirmOrderWithCommitment Gas Statistics (without purchase commitment) ===");
    console.log("Mean:", stats.mean);
    console.log("Min:", stats.min);
    console.log("Max:", stats.max);
    console.log("Std Dev:", stats.stdDev);
    
    // Count events for one run (should be 2: VcUpdated, OrderConfirmed)
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const escrow = await ProductEscrow_Initializer.at(productAddress);
    await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    await escrow.purchasePublic({ from: buyer, value: priceWei });
    const confirmTx = await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
    const events = countEvents(confirmTx.receipt, "VcUpdated") + countEvents(confirmTx.receipt, "OrderConfirmed");
    console.log("Events:", events, "(VcUpdated + OrderConfirmed, no PurchaseConfirmedWithCommitment)");
  });

  it("should measure confirmOrderWithCommitment gas (with purchase commitment)", async () => {
    const gasUsed = [];
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const priceWei = toWei("1", "ether");
    const vcCID = "ipfs://QmTest";
    const purchaseTxHashCommitment = web3.utils.randomHex(32); // Non-zero commitment

    for (let i = 0; i < RUNS; i++) {
      const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);
      
      await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
      await escrow.purchasePublic({ from: buyer, value: priceWei });
      
      const confirmTx = await escrow.confirmOrderWithCommitment(vcCID, purchaseTxHashCommitment, { from: seller });
      gasUsed.push(confirmTx.receipt.gasUsed);
    }

    const stats = calculateStats(gasUsed);
    console.log("\n=== confirmOrderWithCommitment Gas Statistics (with purchase commitment) ===");
    console.log("Mean:", stats.mean);
    console.log("Min:", stats.min);
    console.log("Max:", stats.max);
    console.log("Std Dev:", stats.stdDev);
    
    // Count events for one run (should be 3: VcUpdated, OrderConfirmed, PurchaseConfirmedWithCommitment)
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const escrow = await ProductEscrow_Initializer.at(productAddress);
    await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    await escrow.purchasePublic({ from: buyer, value: priceWei });
    const confirmTx = await escrow.confirmOrderWithCommitment(vcCID, purchaseTxHashCommitment, { from: seller });
    const events = countEvents(confirmTx.receipt, "VcUpdated") + 
                   countEvents(confirmTx.receipt, "OrderConfirmed") + 
                   countEvents(confirmTx.receipt, "PurchaseConfirmedWithCommitment");
    console.log("Events:", events, "(VcUpdated + OrderConfirmed + PurchaseConfirmedWithCommitment)");
  });

  it("should measure setTransporter gas", async () => {
    const gasUsed = [];
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const priceWei = toWei("1", "ether");
    const vcCID = "ipfs://QmTest";
    const fee = toWei("0.1", "ether");

    for (let i = 0; i < RUNS; i++) {
      const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);
      
      await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
      await escrow.purchasePublic({ from: buyer, value: priceWei });
      await escrow.confirmOrderWithCommitment(vcCID, "0x0000000000000000000000000000000000000000000000000000000000000000", { from: seller });
      
      await escrow.createTransporter(fee, { from: transporter });
      await escrow.securityDeposit({ from: transporter, value: toWei("0.5", "ether") });
      
      const setTransporterTx = await escrow.setTransporter(transporter, { from: seller, value: fee });
      gasUsed.push(setTransporterTx.receipt.gasUsed);
    }

    const stats = calculateStats(gasUsed);
    console.log("\n=== setTransporter Gas Statistics ===");
    console.log("Mean:", stats.mean);
    console.log("Min:", stats.min);
    console.log("Max:", stats.max);
    console.log("Std Dev:", stats.stdDev);
    
    // Count events for one run
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const escrow = await ProductEscrow_Initializer.at(productAddress);
    await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    await escrow.purchasePublic({ from: buyer, value: priceWei });
    await escrow.confirmOrderWithCommitment(vcCID, "0x0000000000000000000000000000000000000000000000000000000000000000", { from: seller });
    await escrow.createTransporter(fee, { from: transporter });
    await escrow.securityDeposit({ from: transporter, value: toWei("0.5", "ether") });
    const setTransporterTx = await escrow.setTransporter(transporter, { from: seller, value: fee });
    const events = countEvents(setTransporterTx.receipt, "PhaseChanged") + countEvents(setTransporterTx.receipt, "TransporterSelected");
    console.log("Events:", events);
  });

  it("should measure revealAndConfirmDelivery gas", async () => {
    const gasUsed = [];
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const priceWei = toWei("1", "ether");
    const vcCID = "ipfs://QmTest";
    const finalVCID = "ipfs://QmFinal";
    const fee = toWei("0.1", "ether");

    for (let i = 0; i < RUNS; i++) {
      const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
      const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(productAddress);
      
      await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
      await escrow.purchasePublic({ from: buyer, value: priceWei });
      await escrow.confirmOrderWithCommitment(vcCID, "0x0000000000000000000000000000000000000000000000000000000000000000", { from: seller });
      
      await escrow.createTransporter(fee, { from: transporter });
      await escrow.securityDeposit({ from: transporter, value: toWei("0.5", "ether") });
      await escrow.setTransporter(transporter, { from: seller, value: fee });
      
      // Prepare reveal values
      const blinding = web3.utils.soliditySha3(
        { type: "address", value: escrow.address },
        { type: "address", value: seller }
      );
      const revealedValue = web3.utils.toBN(priceWei);
      
      const revealTx = await escrow.revealAndConfirmDelivery(revealedValue, blinding, finalVCID, { from: buyer });
      gasUsed.push(revealTx.receipt.gasUsed);
    }

    const stats = calculateStats(gasUsed);
    console.log("\n=== revealAndConfirmDelivery Gas Statistics ===");
    console.log("Mean:", stats.mean);
    console.log("Min:", stats.min);
    console.log("Max:", stats.max);
    console.log("Std Dev:", stats.stdDev);
    
    // Count events for one run
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const escrow = await ProductEscrow_Initializer.at(productAddress);
    await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    await escrow.purchasePublic({ from: buyer, value: priceWei });
    await escrow.confirmOrderWithCommitment(vcCID, "0x0000000000000000000000000000000000000000000000000000000000000000", { from: seller });
    await escrow.createTransporter(fee, { from: transporter });
    await escrow.securityDeposit({ from: transporter, value: toWei("0.5", "ether") });
    await escrow.setTransporter(transporter, { from: seller, value: fee });
    const blinding = web3.utils.soliditySha3(
      { type: "address", value: escrow.address },
      { type: "address", value: seller }
    );
    const revealedValue = web3.utils.toBN(priceWei);
    const revealTx = await escrow.revealAndConfirmDelivery(revealedValue, blinding, finalVCID, { from: buyer });
    const events = countEvents(revealTx.receipt, "PhaseChanged") + countEvents(revealTx.receipt, "DeliveryConfirmed") + countEvents(revealTx.receipt, "VcUpdated");
    console.log("Events:", events);
  });
});


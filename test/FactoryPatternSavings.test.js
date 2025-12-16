const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const { toWei } = web3.utils;

contract("Factory Pattern Savings", (accounts) => {
  const [seller] = accounts;
  let factory, implementation;
  const RUNS = 10; // Number of runs for statistical analysis

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

  it("should measure factory pattern gas savings", async () => {
    const commitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const productName = "Test Battery";

    // Measure clone deployment gas (via factory)
    const cloneGasUsed = [];
    for (let i = 0; i < RUNS; i++) {
      const tx = await factory.createProduct(productName, commitment, price, { from: seller });
      cloneGasUsed.push(tx.receipt.gasUsed);
    }

    // Measure full contract deployment gas
    const fullDeploymentGasUsed = [];
    for (let i = 0; i < RUNS; i++) {
      // Deploy full contract
      const contract = await ProductEscrow_Initializer.new({ from: seller });
      // Get deployment transaction receipt
      const txHash = contract.transactionHash;
      const receipt = await web3.eth.getTransactionReceipt(txHash);
      fullDeploymentGasUsed.push(receipt.gasUsed);
    }

    // Calculate statistics
    const cloneStats = calculateStats(cloneGasUsed);
    const fullStats = calculateStats(fullDeploymentGasUsed);

    // Calculate savings
    const savings = fullStats.mean - cloneStats.mean;
    const savingsPercent = ((savings / fullStats.mean) * 100).toFixed(2);

    // Output results
    console.log("\n=== Factory Pattern Gas Savings ===");
    console.log("\nClone Deployment (via Factory):");
    console.log("  Mean:", cloneStats.mean, "gas");
    console.log("  Min:", cloneStats.min, "gas");
    console.log("  Max:", cloneStats.max, "gas");
    console.log("  Std Dev:", cloneStats.stdDev.toFixed(2), "gas");

    console.log("\nFull Contract Deployment:");
    console.log("  Mean:", fullStats.mean, "gas");
    console.log("  Min:", fullStats.min, "gas");
    console.log("  Max:", fullStats.max, "gas");
    console.log("  Std Dev:", fullStats.stdDev.toFixed(2), "gas");

    console.log("\nSavings:");
    console.log("  Absolute savings:", savings.toFixed(2), "gas");
    console.log("  Percentage savings:", savingsPercent + "%");

    console.log("\n=== Summary ===");
    console.log("Clone deployment gas:", cloneStats.mean.toFixed(2), "gas");
    console.log("Full contract deployment gas:", fullStats.mean.toFixed(2), "gas");
    console.log("Savings:", savings.toFixed(2), "gas (" + savingsPercent + "% reduction)");

    // Verify that clone deployment is cheaper
    assert.isTrue(cloneStats.mean < fullStats.mean, "Clone deployment should be cheaper than full deployment");
    assert.isTrue(parseFloat(savingsPercent) > 0, "Savings percentage should be positive");
  });
});


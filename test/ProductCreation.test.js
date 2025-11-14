const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");

contract("Product Creation Test", (accounts) => {
  let implementation;
  let factory;
  const seller = accounts[1];

  beforeEach(async () => {
    // Deploy the implementation contract
    implementation = await ProductEscrow_Initializer.new();
    
    // Deploy the factory with the implementation address
    factory = await ProductFactory.new(implementation.address);
  });

  it("should create a product and emit correct event", async () => {
    const productName = "Test Battery";
    const price = web3.utils.toWei("1", "ether");
    const blinding = web3.utils.randomHex(32);
    const priceCommitment = web3.utils.soliditySha3(
      { type: "uint256", value: price },
      { type: "bytes32", value: blinding }
    );

    console.log("Creating product with:");
    console.log("- Name:", productName);
    console.log("- Price:", price);
    console.log("- Blinding:", blinding);
    console.log("- Commitment:", priceCommitment);

    const tx = await factory.createProduct(productName, priceCommitment, { from: seller });
    
    console.log("Transaction hash:", tx.tx);
    console.log("Transaction receipt:", tx.receipt);

    // Check that ProductCreated event was emitted (no more DebugCommitment)
    assert.equal(tx.logs.length, 1, "Should have 1 event (ProductCreated)");
    
    const productCreatedEvent = tx.logs.find(log => log.event === "ProductCreated");
    assert.ok(productCreatedEvent, "ProductCreated event should be emitted");
    
    const productAddress = productCreatedEvent.args.product;
    const eventSeller = productCreatedEvent.args.seller;
    const productId = productCreatedEvent.args.productId;
    
    console.log("Product created at:", productAddress);
    console.log("Seller:", eventSeller);
    console.log("Product ID:", productId.toString());
    
    assert.notEqual(productAddress, "0x0000000000000000000000000000000000000000", "Product address should not be zero");
    assert.equal(eventSeller, seller, "Seller should match");
    assert.equal(productId.toString(), "1", "Product ID should be 1");
    
    // Verify the product was added to the factory (using getProductsRange)
    const products = await factory.getProductsRange(0, 1);
    assert.include(products, productAddress, "Product should be in factory's product list");
    
    // Verify product counter increased
    const counter = await factory.productCount();
    assert.equal(counter.toString(), "1", "Product counter should be 1");
    
    // Test the created product contract
    const product = await ProductEscrow_Initializer.at(productAddress);
    const name = await product.name();
    const owner = await product.owner();
    const id = await product.id();
    
    assert.equal(name, productName, "Product name should match");
    assert.equal(owner, seller, "Product owner should be seller");
    assert.equal(id.toString(), "1", "Product ID should match");
    
    console.log("✅ Product creation test passed!");
  });

  it("should handle multiple products correctly", async () => {
    const product1Name = "Battery A";
    const product2Name = "Battery B";
    
    const price1 = web3.utils.toWei("1", "ether");
    const price2 = web3.utils.toWei("2", "ether");
    
    const blinding1 = web3.utils.randomHex(32);
    const blinding2 = web3.utils.randomHex(32);
    
    const commitment1 = web3.utils.soliditySha3(
      { type: "uint256", value: price1 },
      { type: "bytes32", value: blinding1 }
    );
    
    const commitment2 = web3.utils.soliditySha3(
      { type: "uint256", value: price2 },
      { type: "bytes32", value: blinding2 }
    );

    // Create first product
    const tx1 = await factory.createProduct(product1Name, commitment1, { from: seller });
    const product1Address = tx1.logs.find(log => log.event === "ProductCreated").args.product;
    const product1Id = tx1.logs.find(log => log.event === "ProductCreated").args.productId;
    
    // Create second product
    const tx2 = await factory.createProduct(product2Name, commitment2, { from: seller });
    const product2Address = tx2.logs.find(log => log.event === "ProductCreated").args.product;
    const product2Id = tx2.logs.find(log => log.event === "ProductCreated").args.productId;
    
    // Verify both products are different
    assert.notEqual(product1Address, product2Address, "Products should have different addresses");
    assert.notEqual(product1Id.toString(), product2Id.toString(), "Products should have different IDs");
    
    // Verify counter is 2
    const counter = await factory.productCount();
    assert.equal(counter.toString(), "2", "Product counter should be 2");
    
    // Verify both products are in the list (using getProductsRange)
    const products = await factory.getProductsRange(0, 2);
    assert.include(products, product1Address, "Product 1 should be in list");
    assert.include(products, product2Address, "Product 2 should be in list");
    assert.equal(products.length, 2, "Should have exactly 2 products");
    
    // Verify product IDs are sequential
    assert.equal(product1Id.toString(), "1", "First product ID should be 1");
    assert.equal(product2Id.toString(), "2", "Second product ID should be 2");
    
    console.log("✅ Multiple products test passed!");
  });

  it("should create deterministic clones", async () => {
    const productName = "Deterministic Battery";
    const commitment = web3.utils.keccak256("deterministic");
    const salt = web3.utils.randomHex(32);
    
    // Predict the address (only salt is needed)
    const predictedAddress = await factory.predictProductAddress(salt);
    
    // Create the product deterministically
    const tx = await factory.createProductDeterministic(productName, commitment, salt, { from: seller });
    const actualAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    
    // Verify addresses match
    assert.equal(actualAddress, predictedAddress, "Predicted and actual addresses should match");
    
    console.log("✅ Deterministic cloning test passed!");
  });
}); 
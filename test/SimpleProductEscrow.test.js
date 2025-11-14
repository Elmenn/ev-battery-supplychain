const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");
const { toWei } = web3.utils;

contract("Simple ProductEscrow Test", accounts => {
  const [owner, seller, buyer, transporter] = accounts;
  let factory, implementation;

  beforeEach(async () => {
    // Deploy implementation first
    implementation = await ProductEscrow_Initializer.new();
    
    // Deploy factory with implementation
    factory = await ProductFactory.new(implementation.address);
  });

  it("should deploy ProductEscrow clone with correct parameters", async () => {
    const commitment = web3.utils.randomHex(32);
    
    // Create product through factory
    const price = toWei("1", "ether");
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    
    const esc = await ProductEscrow_Initializer.at(productAddress);
    
    assert.equal(await esc.id(), 1);
    assert.equal(await esc.name(), "Test Battery");
    assert.equal(await esc.priceCommitment(), commitment);
    assert.equal(await esc.owner(), seller);
    assert.equal(await esc.purchased(), false);
  });

  it("should allow buyer to purchase product via public flow", async () => {
    const commitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");

    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    await esc.setPublicPrice(price, { from: seller });
    const purchaseTx = await esc.purchasePublic({ from: buyer, value: price });

    assert.equal(await esc.purchased(), true);
    assert.equal(await esc.buyer(), buyer);
    truffleAssert.eventEmitted(purchaseTx, "PurchasedPublic");
  });

  it("should prevent seller from buying own product via public flow", async () => {
    const commitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");

    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    await esc.setPublicPrice(price, { from: seller });
    await truffleAssert.reverts(
      esc.purchasePublic({ from: seller, value: price })
    );
  });

  it("allows seller to set public price with commitment", async () => {
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const priceWei = toWei("1", "ether");

    const price = toWei("1", "ether");
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    const receipt = await esc.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });

    assert.equal((await esc.publicPriceWei()).toString(), priceWei.toString());
    assert.equal(await esc.publicPriceCommitment(), publicCommitment);
    assert.equal(await esc.publicEnabled(), true);
    assert.equal(await esc.commitmentFrozen(), true, "Commitment should be frozen after setting");

    truffleAssert.eventEmitted(receipt, "PublicPriceSet", event => event.priceWei.toString() === priceWei.toString());
    truffleAssert.eventEmitted(receipt, "PublicPriceCommitmentSet", event => {
      return event.id && event.commitment === publicCommitment;
    });
  });

  it("prevents non-seller from setting public price with commitment", async () => {
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const priceWei = toWei("1", "ether");

    const price = toWei("1", "ether");
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    await truffleAssert.reverts(
      esc.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: buyer })
    );
  });

  it("cannot set public price with commitment twice", async () => {
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const publicCommitment2 = web3.utils.randomHex(32);
    const priceWei = toWei("1", "ether");

    const price = toWei("1", "ether");
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    // Set commitment first time
    await esc.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    assert.equal(await esc.commitmentFrozen(), true, "Commitment should be frozen");
    const originalCommitment = await esc.publicPriceCommitment();

    // Try to set again - should fail (will revert with CommitmentFrozen or Already set)
    await truffleAssert.reverts(
      esc.setPublicPriceWithCommitment(priceWei, publicCommitment2, { from: seller })
    );
    
    // Verify commitment was not changed
    assert.equal(await esc.publicPriceCommitment(), originalCommitment, "Commitment should not change");
    assert.equal(await esc.commitmentFrozen(), true, "Commitment should still be frozen");
  });

  it("cannot set commitment when already frozen", async () => {
    const commitment = web3.utils.randomHex(32);
    const publicCommitment = web3.utils.randomHex(32);
    const publicCommitment2 = web3.utils.randomHex(32);
    const priceWei = toWei("1", "ether");

    const price = toWei("1", "ether");
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    // Set commitment first time - freezes it
    await esc.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
    
    // Verify it's frozen
    assert.equal(await esc.commitmentFrozen(), true, "Commitment should be frozen");
    const originalCommitment = await esc.publicPriceCommitment();
    
    // Try to set again with different commitment - should fail
    await truffleAssert.reverts(
      esc.setPublicPriceWithCommitment(priceWei, publicCommitment2, { from: seller })
    );
    
    // Verify original commitment is still there and frozen
    assert.equal(await esc.publicPriceCommitment(), publicCommitment, "Original commitment should remain");
    assert.equal(await esc.publicPriceCommitment(), originalCommitment, "Commitment should not change");
    assert.equal(await esc.commitmentFrozen(), true, "Commitment should still be frozen");
  });

  it("legacy setPublicPrice leaves commitment unset and not frozen", async () => {
    const commitment = web3.utils.randomHex(32);
    const priceWei = toWei("2", "ether");

    const price = toWei("1", "ether");
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    await esc.setPublicPrice(priceWei, { from: seller });

    assert.equal((await esc.publicPriceWei()).toString(), priceWei.toString());
    assert.equal(await esc.publicPriceCommitment(), "0x0000000000000000000000000000000000000000000000000000000000000000");
    assert.equal(await esc.commitmentFrozen(), false, "Commitment should not be frozen when using legacy setPublicPrice");
  });

  it("rejects zero commitment", async () => {
    const commitment = web3.utils.randomHex(32);
    const priceWei = toWei("1", "ether");
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";

    const price = toWei("1", "ether");
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    // Should revert when trying to set zero commitment
    await truffleAssert.reverts(
      esc.setPublicPriceWithCommitment(priceWei, zeroCommitment, { from: seller })
    );
    
    // Verify commitment was not set and not frozen
    assert.equal(await esc.publicPriceCommitment(), "0x0000000000000000000000000000000000000000000000000000000000000000", "Commitment should not be set");
    assert.equal(await esc.commitmentFrozen(), false, "Commitment should not be frozen");
  });

  it("commitmentFrozen is false initially", async () => {
    const commitment = web3.utils.randomHex(32);
    const price = toWei("1", "ether");
    const tx = await factory.createProduct("Test Battery", commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(productAddress);

    assert.equal(await esc.commitmentFrozen(), false, "Commitment should not be frozen initially");
  });
}); 
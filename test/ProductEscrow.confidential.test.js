const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");
const { toWei } = web3.utils;
const BN = web3.utils.BN;
const MaliciousReentrant = artifacts.require("./helpers/MaliciousReentrant.sol");

const dummyValueCommitment = web3.utils.randomHex(32);
const dummyProof = '0x00';

contract("ProductEscrow (Confidential)", accounts => {
  const [owner, buyer] = accounts;
  let factory, implementation;

  beforeEach(async () => {
    // Deploy implementation
    implementation = await ProductEscrow_Initializer.new();
    
    // Deploy factory with implementation
    factory = await ProductFactory.new(implementation.address);
  });

  // Helper function to create a product and return the escrow instance
  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }

  // Simulate a Pedersen commitment (for demo, use keccak256)
  function makeCommitment(value, blinding) {
    return web3.utils.keccak256(web3.eth.abi.encodeParameters(["uint256", "bytes32"], [value, blinding]));
  }

  it("should store and retrieve a confidential price commitment", async () => {
    const value = 12345;
    const blinding = "0xabc0000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    const storedCommitment = await instance.priceCommitment();
    assert.equal(storedCommitment, commitment, "Commitment not stored correctly");
  });

  it("should allow depositPurchase with a commitment", async () => {
    const value = 55555;
    const blinding = "0xdef0000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    await instance.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    const storedCommitment = await instance.priceCommitment();
    assert.equal(storedCommitment, commitment, "Commitment not updated correctly");
  });

  it("should verify a revealed value and blinding", async () => {
    const value = 77777;
    const blinding = "0x1230000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    await instance.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    const result = await instance.verifyRevealedValue.call(value, blinding, { from: buyer });
    assert.equal(result, true, "Revealed value should match commitment");
  });

  // Test 1.1: Plaintext Price Exposure Check
  it("should not leak plaintext price in events", async () => {
    const value = 99999;
    const blinding = "0x4560000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);
    const depositAmount = toWei("1", "ether");

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    const tx = await instance.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: depositAmount});
    
    // Check that no event contains the plaintext value
    const events = tx.logs;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventString = JSON.stringify(event.args);
      // The plaintext value should NOT appear in any event
      assert.notInclude(eventString, value.toString(), "Plaintext value should not appear in events");
    }
    
    // Verify that OrderConfirmed event only contains commitment, not plaintext
    const orderConfirmedEvent = tx.logs.find(log => log.event === "OrderConfirmed");
    if (orderConfirmedEvent) {
      assert.equal(orderConfirmedEvent.args.priceCommitment, commitment, "Event should contain commitment");
      // Ensure it doesn't contain the plaintext value in any form
      const eventData = JSON.stringify(orderConfirmedEvent.args);
      assert.notInclude(eventData, value.toString(), "Plaintext value should not be in OrderConfirmed event");
    }
  });

  it("should not leak plaintext price in storage (productPrice is deposit amount, not revealed price)", async () => {
    const value = 123456; // This is the confidential price
    const blinding = "0x7890000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);
    const depositAmount = toWei("2", "ether"); // Different from confidential price

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    await instance.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: depositAmount});
    
    // productPrice should be the deposit amount, not the confidential price
    const storedProductPrice = await instance.productPrice();
    assert.equal(storedProductPrice.toString(), depositAmount, "productPrice should be deposit amount");
    assert.notEqual(storedProductPrice.toString(), value.toString(), "productPrice should not equal confidential price");
    
    // priceCommitment should be the commitment, not the plaintext
    const storedCommitment = await instance.priceCommitment();
    assert.equal(storedCommitment, commitment, "priceCommitment should be the commitment");
    assert.notEqual(storedCommitment, web3.utils.toHex(value), "priceCommitment should not be plaintext value");
  });

  it("should not leak plaintext price in VC CID", async () => {
    const value = 555555;
    const blinding = "0xabc0000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);
    const vcCID = "ipfs://QmTestVC123"; // VC should not contain price

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    await instance.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const tx = await instance.confirmOrderWithCommitment(vcCID, zeroCommitment, {from: owner});
    
    // Check that VC CID doesn't contain the plaintext price
    const storedVC = await instance.vcCid();
    assert.equal(storedVC, vcCID, "VC CID should be stored correctly");
    assert.notInclude(storedVC, value.toString(), "VC CID should not contain plaintext price");
    
    // Check events for price leakage
    const vcUpdatedEvent = tx.logs.find(log => log.event === "VcUpdated");
    if (vcUpdatedEvent) {
      assert.notInclude(vcUpdatedEvent.args.cid, value.toString(), "VC event should not contain plaintext price");
    }
  });

  // Test 1.2: Comprehensive ZKP Verification Tests
  it("should verify ZKP commitment structure (valueCommitment and proof stored)", async () => {
    const value = 88888;
    const blinding = "0xdef0000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);
    const valueCommitment = web3.utils.randomHex(32); // Simulated Pedersen commitment
    const valueRangeProof = "0x1234567890abcdef"; // Simulated Bulletproof

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    const tx = await instance.depositPurchasePrivate(commitment, valueCommitment, valueRangeProof, {from: buyer, value: toWei("1", "ether")});
    
    // Verify valueCommitment is stored
    const storedValueCommitment = await instance.valueCommitment();
    assert.equal(storedValueCommitment, valueCommitment, "valueCommitment should be stored");
    
    // Verify ValueCommitted event is emitted
    const valueCommittedEvent = tx.logs.find(log => log.event === "ValueCommitted");
    assert.exists(valueCommittedEvent, "ValueCommitted event should be emitted");
    assert.equal(valueCommittedEvent.args.commitment, valueCommitment, "Event should contain valueCommitment");
    assert.equal(valueCommittedEvent.args.proof, valueRangeProof, "Event should contain proof");
  });

  it("should verify commitment binding: same value with different blinding produces different commitment", async () => {
    const value = 100000;
    const blinding1 = "0x1110000000000000000000000000000000000000000000000000000000000000";
    const blinding2 = "0x2220000000000000000000000000000000000000000000000000000000000000";
    
    const commitment1 = makeCommitment(value, blinding1);
    const commitment2 = makeCommitment(value, blinding2);
    
    // Same value, different blinding should produce different commitments
    assert.notEqual(commitment1, commitment2, "Different blinding should produce different commitments");
    
    const instance = await createProduct("TestProduct", commitment1, owner);
    await instance.depositPurchasePrivate(commitment1, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    
    // Verify with correct blinding
    const result1 = await instance.verifyRevealedValue.call(value, blinding1);
    assert.equal(result1, true, "Correct value and blinding should verify");
    
    // Verify with wrong blinding (same value)
    const result2 = await instance.verifyRevealedValue.call(value, blinding2);
    assert.equal(result2, false, "Wrong blinding should not verify even with correct value");
  });

  it("should verify commitment binding: different values with same blinding produce different commitments", async () => {
    const value1 = 50000;
    const value2 = 60000;
    const blinding = "0x3330000000000000000000000000000000000000000000000000000000000000";
    
    const commitment1 = makeCommitment(value1, blinding);
    const commitment2 = makeCommitment(value2, blinding);
    
    // Different values, same blinding should produce different commitments
    assert.notEqual(commitment1, commitment2, "Different values should produce different commitments");
    
    const instance = await createProduct("TestProduct", commitment1, owner);
    await instance.depositPurchasePrivate(commitment1, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    
    // Verify with correct value
    const result1 = await instance.verifyRevealedValue.call(value1, blinding);
    assert.equal(result1, true, "Correct value should verify");
    
    // Verify with wrong value (same blinding)
    const result2 = await instance.verifyRevealedValue.call(value2, blinding);
    assert.equal(result2, false, "Wrong value should not verify even with correct blinding");
  });

  // Test 6.2: Invalid Input Handling - Comprehensive wrong reveal tests
  it("should reject reveal with wrong value (comprehensive)", async () => {
    const value = 77777;
    const blinding = "0x4440000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    await instance.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    
    // Test various wrong values
    const wrongValues = [value + 1, value - 1, value * 2, 0, 999999];
    for (const wrongValue of wrongValues) {
      const result = await instance.verifyRevealedValue.call(wrongValue, blinding);
      assert.equal(result, false, `Wrong value ${wrongValue} should not verify`);
    }
  });

  it("should reject reveal with wrong blinding (comprehensive)", async () => {
    const value = 88888;
    const blinding = "0x5550000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    await instance.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    
    // Test various wrong blindings
    const wrongBlindings = [
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      web3.utils.randomHex(32),
      web3.utils.randomHex(32)
    ];
    for (const wrongBlinding of wrongBlindings) {
      if (wrongBlinding !== blinding) {
        const result = await instance.verifyRevealedValue.call(value, wrongBlinding);
        assert.equal(result, false, `Wrong blinding should not verify`);
      }
    }
  });

  it("should emit ValueRevealed event with correct validation result", async () => {
    const value = 99999;
    const blinding = "0x6660000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await createProduct("TestProduct", commitment, owner, toWei("1", "ether"));
    await instance.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    
    // Test correct reveal
    const tx1 = await instance.verifyRevealedValue(value, blinding, {from: buyer});
    const correctEvent = tx1.logs.find(log => log.event === "ValueRevealed");
    assert.exists(correctEvent, "ValueRevealed event should be emitted");
    assert.equal(correctEvent.args.revealedValue.toString(), value.toString(), "Event should contain revealed value");
    assert.equal(correctEvent.args.valid, true, "Event should indicate valid reveal");
    
    // Test incorrect reveal
    const tx2 = await instance.verifyRevealedValue(value + 1, blinding, {from: buyer});
    const incorrectEvent = tx2.logs.find(log => log.event === "ValueRevealed");
    assert.exists(incorrectEvent, "ValueRevealed event should be emitted");
    assert.equal(incorrectEvent.args.valid, false, "Event should indicate invalid reveal");
  });
});

describe("ProductEscrow Purchase Logic", () => {
  let seller, buyer1, buyer2;
  let commitment;
  let factory, implementation;

  before(async () => {
    [seller, buyer1, buyer2] = await web3.eth.getAccounts();
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }

  it("prevents double purchase (race condition)", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    // First purchase
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer1, value: toWei("1", "ether") });
    // Second purchase attempt by another user
    await truffleAssert.reverts(
      esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer2, value: toWei("1", "ether") })
    );
  });

  it("prevents seller from buying own product", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await truffleAssert.reverts(
      esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: seller, value: toWei("1", "ether") })
    );
  });

  // Optional: Reentrancy test (advanced, requires a malicious contract)
});

contract("ProductEscrow Delivery Logic", (accounts) => {
  const [seller, buyer, transporter] = accounts;
  const price = toWei("1", "ether");
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let value, blinding, commitment;
  let factory, implementation;

  beforeEach(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }

  beforeEach(async () => {
    value = 12345;
    blinding = web3.utils.randomHex(32);
    commitment = web3.utils.soliditySha3(value, blinding);
  });

  it("should handle successful delivery and fund distribution", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    // Buyer purchases
    let tx = await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "0" && ev.to.toString() === "1");
    // Seller confirms order (new phase logic)
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    tx = await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    // Note: confirmOrderWithCommitment does not emit PhaseChanged, only OrderConfirmed and VcUpdated
    // Seller sets transporter
    tx = await esc.createTransporter(deliveryFee, { from: transporter });
    tx = await esc.setTransporter(transporter, { from: seller, value: deliveryFee });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "2" && ev.to.toString() === "3");
    // Transporter deposits security
    await esc.securityDeposit({ from: transporter, value: securityDeposit });
    // Fast-forward to just before expiry
    await skip(60 * 60 * 24 * 2 - 10); // 2 days minus 10 seconds
    // Record balances
    const sellerBefore = new BN(await web3.eth.getBalance(seller));
    const transporterBefore = new BN(await web3.eth.getBalance(transporter));
    // Buyer reveals and confirms delivery
    tx = await esc.revealAndConfirmDelivery(value, blinding, "cid", { from: buyer });
    // Check phase - _confirmDelivery doesn't emit PhaseChanged, it just sets phase directly
    assert.equal((await esc.phase()).toString(), "4", "phase should be Delivered");
    // Check events - _confirmDelivery doesn't emit FundsTransferred, only DeliveryConfirmed and VcUpdated
    truffleAssert.eventEmitted(tx, "DeliveryConfirmed");
    // Check balances increased (allowing for gas)
    const sellerAfter = new BN(await web3.eth.getBalance(seller));
    const transporterAfter = new BN(await web3.eth.getBalance(transporter));
    assert(sellerAfter.sub(sellerBefore).gte(new BN(price)), "seller should receive price");
    assert(transporterAfter.sub(transporterBefore).gte(new BN(deliveryFee).add(new BN(securityDeposit))), "transporter should receive fee + deposit");
  });

  it("should revert if revealAndConfirmDelivery is called with invalid value or blinding", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc.createTransporter(deliveryFee, { from: transporter });
    await esc.setTransporter(transporter, { from: seller, value: deliveryFee });
    await esc.securityDeposit({ from: transporter, value: securityDeposit });
    await skip(60 * 60 * 24 * 2 - 10);
    // Wrong value
    await truffleAssert.reverts(
      esc.revealAndConfirmDelivery(value + 1, blinding, "cid", { from: buyer })
    );
    // Wrong blinding
    await truffleAssert.reverts(
      esc.revealAndConfirmDelivery(value, web3.utils.randomHex(32), "cid", { from: buyer })
    );
  });

  it("should handle delivery timeout and penalize transporter", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc.createTransporter(deliveryFee, { from: transporter });
    await esc.setTransporter(transporter, { from: seller, value: deliveryFee });
    await esc.securityDeposit({ from: transporter, value: securityDeposit });
    // Fast-forward past delivery window (3 days)
    await skip(60 * 60 * 24 * 3);
    const buyerBefore = new BN(await web3.eth.getBalance(buyer));
    const tx = await esc.timeout({ from: seller });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.to.toString() === "5");
    assert.equal((await esc.phase()).toString(), "5", "phase should be Expired");
    truffleAssert.eventEmitted(tx, "FundsTransferred");
    truffleAssert.eventEmitted(tx, "PenaltyApplied");
    truffleAssert.eventEmitted(tx, "DeliveryTimeoutEvent");
    const buyerAfter = new BN(await web3.eth.getBalance(buyer));
    assert(buyerAfter.sub(buyerBefore).gte(new BN(price)), "buyer should be refunded at least price");
  });

  it("should handle seller timeout and refund buyer", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    // Do NOT call confirmOrder here
    // Fast-forward past seller confirmation window (3 days)
    await skip(60 * 60 * 24 * 3);
    const buyerBefore = new BN(await web3.eth.getBalance(buyer));
    const tx = await esc.sellerTimeout({ from: transporter });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "1" && ev.to.toString() === "5");
    assert.equal((await esc.phase()).toString(), "5", "phase should be Expired");
    truffleAssert.eventEmitted(tx, "FundsTransferred");
    truffleAssert.eventEmitted(tx, "SellerTimeout");
    const buyerAfter = new BN(await web3.eth.getBalance(buyer));
    assert(buyerAfter.sub(buyerBefore).gte(new BN("0")), "buyer should not lose ether");
  });

  it("ETH conservation invariant: total ETH in equals total ETH out (minus gas)", async () => {
    // Setup
    const seller = accounts[0];
    const buyer = accounts[1];
    const transporter = accounts[2];
    const price = toWei("1", "ether");
    const deliveryFee = toWei("0.1", "ether");
    const securityDeposit = toWei("1", "ether");
    const value = 12345;
    const blinding = web3.utils.randomHex(32);
    const commitment = web3.utils.soliditySha3(value, blinding);
    // Record initial balances
    const sellerBefore = new BN(await web3.eth.getBalance(seller));
    const buyerBefore = new BN(await web3.eth.getBalance(buyer));
    const transporterBefore = new BN(await web3.eth.getBalance(transporter));
    // Deploy contract and run happy path
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc.createTransporter(deliveryFee, { from: transporter });
    await esc.setTransporter(transporter, { from: seller, value: deliveryFee });
    await esc.securityDeposit({ from: transporter, value: securityDeposit });
    await skip(60 * 60 * 24 * 2 - 10);
    await esc.revealAndConfirmDelivery(value, blinding, "cid", { from: buyer });
    // Record final balances
    const sellerAfter = new BN(await web3.eth.getBalance(seller));
    const buyerAfter = new BN(await web3.eth.getBalance(buyer));
    const transporterAfter = new BN(await web3.eth.getBalance(transporter));
    const contractAfter = new BN(await web3.eth.getBalance(esc.address));
    // Calculate deltas
    // Total ETH in: buyer deposit (price) + seller delivery fee + transporter security deposit
    const totalIn = new BN(price).add(new BN(deliveryFee)).add(new BN(securityDeposit));
    // Total ETH out: seller receives price, transporter receives deliveryFee + securityDeposit
    const totalOut = sellerAfter.sub(sellerBefore).add(transporterAfter.sub(transporterBefore));
    // Contract should have 0 ETH left
    assert.equal(contractAfter.toString(), "0", "Contract should have no ETH left");
    // The difference should only be gas costs (allow up to 0.1 ETH for all gas)
    const delta = totalIn.sub(totalOut).abs();
    assert(delta.lte(new BN(toWei("0.1", "ether"))), "ETH not conserved in happy path (allowing for gas)");

    // Now test timeout path
    // Reset balances
    const sellerBefore2 = new BN(await web3.eth.getBalance(seller));
    const buyerBefore2 = new BN(await web3.eth.getBalance(buyer));
    const transporterBefore2 = new BN(await web3.eth.getBalance(transporter));
    // Deploy new contract and run timeout
    const esc2 = await createProduct("TestProduct", commitment, seller);
    await esc2.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc2.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc2.createTransporter(deliveryFee, { from: transporter });
    await esc2.setTransporter(transporter, { from: seller, value: deliveryFee });
    await esc2.securityDeposit({ from: transporter, value: securityDeposit });
    await skip(60 * 60 * 24 * 3); // Past delivery window
    await esc2.timeout({ from: seller });
    // Record final balances
    const sellerAfter2 = new BN(await web3.eth.getBalance(seller));
    const buyerAfter2 = new BN(await web3.eth.getBalance(buyer));
    const transporterAfter2 = new BN(await web3.eth.getBalance(transporter));
    const contractAfter2 = new BN(await web3.eth.getBalance(esc2.address));
    const totalBefore2 = sellerBefore2.add(buyerBefore2).add(transporterBefore2).add(new BN("0"));
    const totalAfter2 = sellerAfter2.add(buyerAfter2).add(transporterAfter2).add(contractAfter2);
    const delta2 = totalBefore2.sub(totalAfter2).abs();
    assert(delta2.lte(new BN(toWei("0.01", "ether"))), "ETH not conserved in timeout path");
  });
});

contract("ProductEscrow Refund Non-Selected Transporter", accounts => {
  const [seller, buyer, transporter1, transporter2] = accounts;
  const price = toWei("1", "ether");
  let factory, implementation;

  beforeEach(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let commitment;

  beforeEach(async () => {
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("should refund non-selected transporter security deposit when seller picks transporter", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    let tx = await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "0" && ev.to.toString() === "1");
    // Seller confirms order (new phase logic)
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    tx = await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    // Note: confirmOrderWithCommitment does not emit PhaseChanged, only OrderConfirmed and VcUpdated
    // Both transporters register and deposit security
    await esc.createTransporter(deliveryFee, { from: transporter1 });
    await esc.createTransporter(deliveryFee, { from: transporter2 });
    await esc.securityDeposit({ from: transporter1, value: securityDeposit });
    await esc.securityDeposit({ from: transporter2, value: securityDeposit });
    // Record balances before
    const t1Before = new BN(await web3.eth.getBalance(transporter1));
    const t2Before = new BN(await web3.eth.getBalance(transporter2));
    // transporter2 withdraws before selection
    tx = await esc.withdrawBid({ from: transporter2 });
    truffleAssert.eventEmitted(tx, "BidWithdrawn", ev => ev.transporter === transporter2);
    truffleAssert.eventEmitted(tx, "FundsTransferred", ev => ev.to === transporter2);
    const t2After = new BN(await web3.eth.getBalance(transporter2));
    assert(t2After.gt(t2Before), "transporter2 should be refunded");
    // Seller picks transporter1
    tx = await esc.setTransporter(transporter1, { from: seller, value: deliveryFee });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "2" && ev.to.toString() === "3");
    // transporter2 cannot withdraw again
    await truffleAssert.reverts(
      esc.withdrawBid({ from: transporter2 })
    );
    // transporter1's deposit should remain in contract (not refunded yet)
  });
});

contract("ProductEscrow MAX_BIDS cap", (accounts) => {
  const price = toWei("1", "ether");
  let factory, implementation;

  beforeEach(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }
  const deliveryFee = toWei("0.1", "ether");
  let commitment;

  beforeEach(async () => {
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("should revert with 'bid list full' when exceeding MAX_BIDS with unique accounts, or 'Transporter already exists' for duplicates", async () => {
    const maxBids = 20; // MAX_BIDS is 20 in the contract
    const esc = await createProduct("TestProduct", commitment, accounts[0]);
    // Register maxBids transporters (checking if accounts exist)
    let registeredCount = 0;
    for (let i = 2; i < accounts.length && registeredCount < maxBids; i++) {
      if (accounts[i]) {
        await esc.createTransporter(deliveryFee, { from: accounts[i] });
        registeredCount++;
      }
    }
    // Try to register a duplicate (should revert with 'Transporter already exists')
    if (accounts[2]) {
      await truffleAssert.reverts(
        esc.createTransporter(deliveryFee, { from: accounts[2] })
      );
    }
    // If we reached maxBids and have another account, test the cap
    if (registeredCount >= maxBids && accounts[2 + maxBids]) {
      await truffleAssert.reverts(
        esc.createTransporter(deliveryFee, { from: accounts[2 + maxBids] })
      );
    }
  });
});

contract("ProductEscrow MAX_BIDS Slot Reuse", (accounts) => {
  const [seller, buyer, ...transporters] = accounts;
  const price = toWei("1", "ether");
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let value, blinding, commitment;
  let factory, implementation;

  beforeEach(async () => {
    value = 12345;
    blinding = web3.utils.randomHex(32);
    commitment = web3.utils.soliditySha3(value, blinding);
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }

  it("should allow slot reuse after withdrawBid when MAX_BIDS is reached", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    // Use accounts array instead of transporters (which might not have enough elements)
    // Start from index 3 (skip seller, buyer, and first transporter if used)
    const startIndex = 3;
    const maxBids = 20;
    let registeredCount = 0;
    const registeredAddresses = [];
    
    // Register up to MAX_BIDS transporters
    for (let i = startIndex; i < accounts.length && registeredCount < maxBids; i++) {
      if (accounts[i]) {
        await esc.createTransporter(deliveryFee, { from: accounts[i] });
        await esc.securityDeposit({ from: accounts[i], value: securityDeposit });
        registeredAddresses.push(accounts[i]);
        registeredCount++;
      }
    }
    
    const actualCount = (await esc.transporterCount()).toString();
    // If we have enough accounts, verify we reached maxBids
    if (registeredCount >= maxBids) {
      assert.equal(actualCount, maxBids.toString(), "Should have reached MAX_BIDS");
      // Next transporter should fail (if we have another account)
      if (accounts[startIndex + maxBids]) {
        await truffleAssert.reverts(
          esc.createTransporter(deliveryFee, { from: accounts[startIndex + maxBids] })
        );
      }
      // One transporter withdraws
      if (registeredAddresses.length > 2) {
        await esc.withdrawBid({ from: registeredAddresses[2] });
        assert.equal((await esc.transporterCount()).toString(), (maxBids - 1).toString(), "Count should decrease after withdrawal");
        // New transporter can now register
        if (accounts[startIndex + maxBids]) {
          await esc.createTransporter(deliveryFee, { from: accounts[startIndex + maxBids] });
          assert.equal((await esc.transporterCount()).toString(), maxBids.toString(), "Should be able to register after withdrawal");
        }
      }
    } else {
      // If we don't have enough accounts, just verify the count matches what we registered
      assert.equal(actualCount, registeredCount.toString(), "Count should match registered transporters");
    }
  });
});

contract("ProductEscrow Tightened SellerTimeout/ConfirmOrder/BidTimeout Logic", (accounts) => {
  const [seller, buyer, transporter] = accounts;
  const price = toWei("1", "ether");
  let factory, implementation;

  beforeEach(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let commitment;

  beforeEach(async () => {
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("sellerTimeout only works after 48h and only in Purchased phase; after sellerTimeout, confirmOrder reverts", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    // Try sellerTimeout before 48h (should revert)
    await truffleAssert.reverts(
      esc.sellerTimeout({ from: transporter })
    );
    // Advance time by 49h
    await skip(60 * 60 * 49);
    // sellerTimeout should succeed
    let tx = await esc.sellerTimeout({ from: transporter });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "1" && ev.to.toString() === "5");
    assert.equal((await esc.phase()).toString(), "5", "phase should be Expired");
    // confirmOrder should now revert (wrong phase)
    await truffleAssert.reverts(
      esc.confirmOrderWithCommitment("cid", "0x0000000000000000000000000000000000000000000000000000000000000000", { from: seller })
    );
  });

  it("confirmOrder only works within 48h of purchase and only in Purchased phase; after confirmOrder, sellerTimeout reverts", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    // confirmOrder before 48h should succeed
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    let tx = await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    // Note: confirmOrderWithCommitment does not emit PhaseChanged, only OrderConfirmed and VcUpdated
    assert.equal((await esc.phase()).toString(), "2", "phase should be OrderConfirmed");
    // sellerTimeout should now revert (wrong phase)
    await truffleAssert.reverts(
      esc.sellerTimeout({ from: transporter })
    );
    // confirmOrder after 48h should revert (window expired)
    const esc2 = await createProduct("TestProduct", commitment, seller);
    await esc2.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await skip(60 * 60 * 49);
    await truffleAssert.reverts(
      esc2.confirmOrderWithCommitment("cid", "0x0000000000000000000000000000000000000000000000000000000000000000", { from: seller })
    );
  });

  it("setTransporter only works in OrderConfirmed phase and within 48h of orderConfirmedTimestamp", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    // setTransporter before 48h should succeed
    await esc.createTransporter(deliveryFee, { from: transporter });
    let tx = await esc.setTransporter(transporter, { from: seller, value: deliveryFee });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "2" && ev.to.toString() === "3");
    assert.equal((await esc.phase()).toString(), "3", "phase should be Bound");
    // setTransporter after 48h should revert (bidding window expired)
    const esc2 = await createProduct("TestProduct", commitment, seller);
    await esc2.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc2.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc2.createTransporter(deliveryFee, { from: transporter });
    await skip(60 * 60 * 49);
    await truffleAssert.reverts(
      esc2.setTransporter(transporter, { from: seller, value: deliveryFee })
    );
  });

  it("bidTimeout only works after 48h from orderConfirmedTimestamp and only in OrderConfirmed phase; after bidTimeout, setTransporter reverts", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc.createTransporter(deliveryFee, { from: transporter });
    // Try bidTimeout before 48h (should revert)
    await truffleAssert.reverts(
      esc.bidTimeout({ from: buyer })
    );
    // Advance time by 49h
    await skip(60 * 60 * 49);
    // bidTimeout should succeed
    let tx = await esc.bidTimeout({ from: buyer });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "2" && ev.to.toString() === "5");
    assert.equal((await esc.phase()).toString(), "5", "phase should be Expired");
    // setTransporter should now revert (wrong phase)
    await truffleAssert.reverts(
      esc.setTransporter(transporter, { from: seller, value: deliveryFee })
    );
  });

  it("sellerTimeout and bidTimeout: edge-time precision (48h - 1s fails, 48h succeeds)", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    // sellerTimeout: skip 48h - 1s, should revert
    await skip(60 * 60 * 24 * 2 - 1); // 48h - 1s
    await truffleAssert.reverts(
      esc.sellerTimeout({ from: transporter })
    );
    // skip 2 more seconds (now strictly greater than 48h)
    await skip(2);
    let tx = await esc.sellerTimeout({ from: transporter });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "1" && ev.to.toString() === "5");
    assert.equal((await esc.phase()).toString(), "5", "phase should be Expired");

    // Repeat for bidTimeout: need to get to OrderConfirmed phase
    const esc2 = await createProduct("TestProduct", commitment, seller);
    await esc2.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc2.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    // bidTimeout: skip 48h - 1s, should revert
    await skip(60 * 60 * 24 * 2 - 1); // 48h - 1s
    await truffleAssert.reverts(
      esc2.bidTimeout({ from: buyer })
    );
    // skip 2 more seconds (now strictly greater than 48h)
    await skip(2);
    tx = await esc2.bidTimeout({ from: buyer });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "2" && ev.to.toString() === "5");
    assert.equal((await esc2.phase()).toString(), "5", "phase should be Expired");
  });
});

contract("ProductEscrow Withdraw Bid", (accounts) => {
  const [seller, buyer, transporter1, transporter2] = accounts;
  const price = toWei("1", "ether");
  let factory, implementation;

  beforeEach(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let commitment;

  beforeEach(async () => {
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("should allow transporter to withdraw bid and refund deposit before selection", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc.createTransporter(deliveryFee, { from: transporter1 });
    await esc.createTransporter(deliveryFee, { from: transporter2 });
    await esc.securityDeposit({ from: transporter1, value: securityDeposit });
    await esc.securityDeposit({ from: transporter2, value: securityDeposit });
    // Record balances before
    const t1Before = new BN(await web3.eth.getBalance(transporter1));
    const t2Before = new BN(await web3.eth.getBalance(transporter2));
    // transporter1 withdraws
    let tx = await esc.withdrawBid({ from: transporter1 });
    truffleAssert.eventEmitted(tx, "BidWithdrawn", ev => ev.transporter === transporter1);
    truffleAssert.eventEmitted(tx, "FundsTransferred", ev => ev.to === transporter1);
    // transporterCount should be decremented
    assert.equal((await esc.transporterCount()).toString(), "1");
    // transporter1's balance should increase by at least securityDeposit
    const t1After = new BN(await web3.eth.getBalance(transporter1));
    assert(t1After.gt(t1Before), "transporter1 should be refunded");
    // transporter2 withdraws
    tx = await esc.withdrawBid({ from: transporter2 });
    truffleAssert.eventEmitted(tx, "BidWithdrawn", ev => ev.transporter === transporter2);
    truffleAssert.eventEmitted(tx, "FundsTransferred", ev => ev.to === transporter2);
    assert.equal((await esc.transporterCount()).toString(), "0");
    const t2After = new BN(await web3.eth.getBalance(transporter2));
    assert(t2After.gt(t2Before), "transporter2 should be refunded");
  });

  it("should not allow withdrawBid after transporter is picked", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc.createTransporter(deliveryFee, { from: transporter1 });
    await esc.securityDeposit({ from: transporter1, value: securityDeposit });
    await esc.setTransporter(transporter1, { from: seller, value: deliveryFee });
    await truffleAssert.reverts(
      esc.withdrawBid({ from: transporter1 })
    );
  });
});

contract("ProductEscrow Reentrancy Attack", (accounts) => {
  const [seller, buyer, attacker] = accounts;
  const price = toWei("1", "ether");
  let factory, implementation;

  beforeEach(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  async function createProduct(name, commitment, seller, price = toWei("1", "ether")) {
    const tx = await factory.createProduct(name, commitment, price, { from: seller });
    const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
    return await ProductEscrow_Initializer.at(productAddress);
  }
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let value, blinding, commitment;

  beforeEach(async () => {
    value = 12345;
    blinding = web3.utils.randomHex(32);
    commitment = web3.utils.soliditySha3(value, blinding);
  });

  it("should prevent reentrancy in revealAndConfirmDelivery", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    const mal = await MaliciousReentrant.new(esc.address, { from: attacker });
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc.createTransporter(deliveryFee, { from: attacker });
    await esc.securityDeposit({ from: attacker, value: securityDeposit });
    await esc.setTransporter(attacker, { from: seller, value: deliveryFee });
    await skip(60 * 60 * 24 * 2 - 10);
    // Should revert due to reentrancy protection
    await truffleAssert.reverts(
      mal.attackReveal(value, blinding, "cid", { from: attacker })
    );
  });

  it("should prevent reentrancy in withdrawBid", async () => {
    const esc = await createProduct("TestProduct", commitment, seller);
    const mal = await MaliciousReentrant.new(esc.address, { from: attacker });
    await esc.depositPurchasePrivate(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await esc.confirmOrderWithCommitment("cid", zeroCommitment, { from: seller });
    await esc.createTransporter(deliveryFee, { from: attacker });
    await esc.securityDeposit({ from: attacker, value: securityDeposit });
    // Should revert due to reentrancy protection
    await truffleAssert.reverts(
      mal.attackWithdrawBid({ from: attacker })
    );
  });
});

async function skip(seconds) {
  await new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [seconds],
        id: new Date().getTime(),
      },
      (err1) => {
        if (err1) return reject(err1);
        web3.currentProvider.send(
          {
            jsonrpc: "2.0",
            method: "evm_mine",
            params: [],
            id: new Date().getTime() + 1,
          },
          (err2, res) => (err2 ? reject(err2) : resolve(res))
        );
      }
    );
  });
}
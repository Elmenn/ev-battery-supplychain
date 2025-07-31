const ProductEscrow = artifacts.require("ProductEscrow");
const truffleAssert = require("truffle-assertions");
const { toWei } = web3.utils;
const BN = web3.utils.BN;
const MaliciousReentrant = artifacts.require("./helpers/MaliciousReentrant.sol");
const ProductEscrow_Test = artifacts.require("ProductEscrow_Test");

const dummyValueCommitment = web3.utils.randomHex(32);
const dummyProof = '0x00';

contract("ProductEscrow (Confidential)", accounts => {
  const [owner, buyer] = accounts;

  // Simulate a Pedersen commitment (for demo, use keccak256)
  function makeCommitment(value, blinding) {
    return web3.utils.keccak256(web3.eth.abi.encodeParameters(["uint256", "bytes32"], [value, blinding]));
  }

  it("should store and retrieve a confidential price commitment", async () => {
    const value = 12345;
    const blinding = "0xabc0000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await ProductEscrow.new("TestProduct", commitment, owner);
    const storedCommitment = await instance.priceCommitment();
    assert.equal(storedCommitment, commitment, "Commitment not stored correctly");
  });

  it("should allow depositPurchase with a commitment", async () => {
    const value = 55555;
    const blinding = "0xdef0000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await ProductEscrow.new("TestProduct", commitment, owner);
    await instance.depositPurchase(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    const storedCommitment = await instance.priceCommitment();
    assert.equal(storedCommitment, commitment, "Commitment not updated correctly");
  });

  it("should verify a revealed value and blinding", async () => {
    const value = 77777;
    const blinding = "0x1230000000000000000000000000000000000000000000000000000000000000";
    const commitment = makeCommitment(value, blinding);

    const instance = await ProductEscrow.new("TestProduct", commitment, owner);
    await instance.depositPurchase(commitment, dummyValueCommitment, dummyProof, {from: buyer, value: toWei("1", "ether")});
    const result = await instance.verifyRevealedValue.call(value, blinding, { from: buyer });
    assert.equal(result, true, "Revealed value should match commitment");
  });
});

describe("ProductEscrow Purchase Logic", () => {
  let seller, buyer1, buyer2;
  let commitment;

  before(async () => {
    [seller, buyer1, buyer2] = await web3.eth.getAccounts();
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("prevents double purchase (race condition)", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    // First purchase
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer1, value: toWei("1", "ether") });
    // Second purchase attempt by another user
    await truffleAssert.reverts(
      esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer2, value: toWei("1", "ether") })
    );
  });

  it("prevents seller from buying own product", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await truffleAssert.reverts(
      esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: seller, value: toWei("1", "ether") })
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

  beforeEach(async () => {
    value = 12345;
    blinding = web3.utils.randomHex(32);
    commitment = web3.utils.soliditySha3(value, blinding);
  });

  it("should handle successful delivery and fund distribution", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    // Buyer purchases
    let tx = await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "0" && ev.to.toString() === "1");
    // Seller confirms order (new phase logic)
    tx = await esc.confirmOrder("cid", { from: seller });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "1" && ev.to.toString() === "2");
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
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "3" && ev.to.toString() === "4");
    // Check phase
    assert.equal((await esc.phase()).toString(), "4", "phase should be Delivered");
    // Check events
    truffleAssert.eventEmitted(tx, "FundsTransferred");
    truffleAssert.eventEmitted(tx, "DeliveryConfirmed");
    // Check balances increased (allowing for gas)
    const sellerAfter = new BN(await web3.eth.getBalance(seller));
    const transporterAfter = new BN(await web3.eth.getBalance(transporter));
    assert(sellerAfter.sub(sellerBefore).gte(new BN(price)), "seller should receive price");
    assert(transporterAfter.sub(transporterBefore).gte(new BN(deliveryFee).add(new BN(securityDeposit))), "transporter should receive fee + deposit");
  });

  it("should revert if revealAndConfirmDelivery is called with invalid value or blinding", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
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
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
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
    truffleAssert.eventEmitted(tx, "DeliveryTimeout");
    const buyerAfter = new BN(await web3.eth.getBalance(buyer));
    assert(buyerAfter.sub(buyerBefore).gte(new BN(price)), "buyer should be refunded at least price");
  });

  it("should handle seller timeout and refund buyer", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
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
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
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
    const totalBefore = sellerBefore.add(buyerBefore).add(transporterBefore).add(new BN("0"));
    const totalAfter = sellerAfter.add(buyerAfter).add(transporterAfter).add(contractAfter);
    // Allow for gas cost (should be < 0.01 ETH)
    const delta = totalBefore.sub(totalAfter).abs();
    assert(delta.lte(new BN(toWei("0.01", "ether"))), "ETH not conserved in happy path");

    // Now test timeout path
    // Reset balances
    const sellerBefore2 = new BN(await web3.eth.getBalance(seller));
    const buyerBefore2 = new BN(await web3.eth.getBalance(buyer));
    const transporterBefore2 = new BN(await web3.eth.getBalance(transporter));
    // Deploy new contract and run timeout
    const esc2 = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc2.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc2.confirmOrder("cid", { from: seller });
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
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let commitment;

  beforeEach(async () => {
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("should refund non-selected transporter security deposit when seller picks transporter", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    let tx = await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "0" && ev.to.toString() === "1");
    // Seller confirms order (new phase logic)
    tx = await esc.confirmOrder("cid", { from: seller });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "1" && ev.to.toString() === "2");
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
    truffleAssert.eventEmitted(tx, "BidWithdrawn", ev => ev.transporter === transporter2 && ev.amount.toString() === securityDeposit);
    truffleAssert.eventEmitted(tx, "FundsTransferred", ev => ev.to === transporter2 && ev.amount.toString() === securityDeposit);
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
  const deliveryFee = toWei("0.1", "ether");
  let commitment;

  beforeEach(async () => {
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("should revert with 'bid list full' when exceeding MAX_BIDS with unique accounts, or 'Transporter already exists' for duplicates", async () => {
    const maxBids = 8;
    const esc = await ProductEscrow.new("TestProduct", commitment, accounts[0], { from: accounts[0] });
    // Register maxBids transporters
    for (let i = 2; i < 2 + maxBids; i++) {
      await esc.createTransporter(deliveryFee, { from: accounts[i] });
    }
    // Try to register a duplicate (should revert with 'Transporter already exists')
    await truffleAssert.reverts(
      esc.createTransporter(deliveryFee, { from: accounts[2] })
    );
    // If another unique account is available, test the cap
    if (accounts[2 + maxBids]) {
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

  beforeEach(async () => {
    value = 12345;
    blinding = web3.utils.randomHex(32);
    commitment = web3.utils.soliditySha3(value, blinding);
  });

  it("should allow slot reuse after withdrawBid when MAX_BIDS is reached", async () => {
    const esc = await ProductEscrow_Test.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
    // Register MAX_BIDS transporters
    for (let i = 0; i < 5; i++) {
      await esc.createTransporter(deliveryFee, { from: transporters[i] });
      await esc.securityDeposit({ from: transporters[i], value: securityDeposit });
    }
    assert.equal((await esc.transporterCount()).toString(), "5");
    // Next transporter should fail
    await truffleAssert.reverts(
      esc.createTransporter(deliveryFee, { from: transporters[5] })
    );
    // One transporter withdraws
    await esc.withdrawBid({ from: transporters[2] });
    assert.equal((await esc.transporterCount()).toString(), "4");
    // New transporter can now register
    await esc.createTransporter(deliveryFee, { from: transporters[5] });
    assert.equal((await esc.transporterCount()).toString(), "5");
  });
});

contract("ProductEscrow Tightened SellerTimeout/ConfirmOrder/BidTimeout Logic", (accounts) => {
  const [seller, buyer, transporter] = accounts;
  const price = toWei("1", "ether");
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let commitment;

  beforeEach(async () => {
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("sellerTimeout only works after 48h and only in Purchased phase; after sellerTimeout, confirmOrder reverts", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
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
      esc.confirmOrder("cid", { from: seller })
    );
  });

  it("confirmOrder only works within 48h of purchase and only in Purchased phase; after confirmOrder, sellerTimeout reverts", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    // confirmOrder before 48h should succeed
    let tx = await esc.confirmOrder("cid", { from: seller });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "1" && ev.to.toString() === "2");
    assert.equal((await esc.phase()).toString(), "2", "phase should be OrderConfirmed");
    // sellerTimeout should now revert (wrong phase)
    await truffleAssert.reverts(
      esc.sellerTimeout({ from: transporter })
    );
    // confirmOrder after 48h should revert (window expired)
    const esc2 = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc2.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await skip(60 * 60 * 49);
    await truffleAssert.reverts(
      esc2.confirmOrder("cid", { from: seller })
    );
  });

  it("setTransporter only works in OrderConfirmed phase and within 48h of orderConfirmedTimestamp", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
    // setTransporter before 48h should succeed
    await esc.createTransporter(deliveryFee, { from: transporter });
    let tx = await esc.setTransporter(transporter, { from: seller, value: deliveryFee });
    truffleAssert.eventEmitted(tx, "PhaseChanged", ev => ev.from.toString() === "2" && ev.to.toString() === "3");
    assert.equal((await esc.phase()).toString(), "3", "phase should be Bound");
    // setTransporter after 48h should revert (bidding window expired)
    const esc2 = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc2.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc2.confirmOrder("cid", { from: seller });
    await esc2.createTransporter(deliveryFee, { from: transporter });
    await skip(60 * 60 * 49);
    await truffleAssert.reverts(
      esc2.setTransporter(transporter, { from: seller, value: deliveryFee })
    );
  });

  it("bidTimeout only works after 48h from orderConfirmedTimestamp and only in OrderConfirmed phase; after bidTimeout, setTransporter reverts", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
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
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
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
    const esc2 = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc2.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc2.confirmOrder("cid", { from: seller });
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
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let commitment;

  beforeEach(async () => {
    commitment = web3.utils.soliditySha3("1000", web3.utils.randomHex(32));
  });

  it("should allow transporter to withdraw bid and refund deposit before selection", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
    await esc.createTransporter(deliveryFee, { from: transporter1 });
    await esc.createTransporter(deliveryFee, { from: transporter2 });
    await esc.securityDeposit({ from: transporter1, value: securityDeposit });
    await esc.securityDeposit({ from: transporter2, value: securityDeposit });
    // Record balances before
    const t1Before = new BN(await web3.eth.getBalance(transporter1));
    const t2Before = new BN(await web3.eth.getBalance(transporter2));
    // transporter1 withdraws
    let tx = await esc.withdrawBid({ from: transporter1 });
    truffleAssert.eventEmitted(tx, "BidWithdrawn", ev => ev.transporter === transporter1 && ev.amount.toString() === securityDeposit);
    truffleAssert.eventEmitted(tx, "FundsTransferred", ev => ev.to === transporter1 && ev.amount.toString() === securityDeposit);
    // transporterCount should be decremented
    assert.equal((await esc.transporterCount()).toString(), "1");
    // transporter1's balance should increase by at least securityDeposit
    const t1After = new BN(await web3.eth.getBalance(transporter1));
    assert(t1After.gt(t1Before), "transporter1 should be refunded");
    // transporter2 withdraws
    tx = await esc.withdrawBid({ from: transporter2 });
    truffleAssert.eventEmitted(tx, "BidWithdrawn", ev => ev.transporter === transporter2 && ev.amount.toString() === securityDeposit);
    truffleAssert.eventEmitted(tx, "FundsTransferred", ev => ev.to === transporter2 && ev.amount.toString() === securityDeposit);
    assert.equal((await esc.transporterCount()).toString(), "0");
    const t2After = new BN(await web3.eth.getBalance(transporter2));
    assert(t2After.gt(t2Before), "transporter2 should be refunded");
  });

  it("should not allow withdrawBid after transporter is picked", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
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
  const deliveryFee = toWei("0.1", "ether");
  const securityDeposit = toWei("1", "ether");
  let value, blinding, commitment;

  beforeEach(async () => {
    value = 12345;
    blinding = web3.utils.randomHex(32);
    commitment = web3.utils.soliditySha3(value, blinding);
  });

  it("should prevent reentrancy in revealAndConfirmDelivery", async () => {
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    const mal = await MaliciousReentrant.new(esc.address, { from: attacker });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
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
    const esc = await ProductEscrow.new("TestProduct", commitment, seller, { from: seller });
    const mal = await MaliciousReentrant.new(esc.address, { from: attacker });
    await esc.depositPurchase(commitment, dummyValueCommitment, dummyProof, { from: buyer, value: price });
    await esc.confirmOrder("cid", { from: seller });
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
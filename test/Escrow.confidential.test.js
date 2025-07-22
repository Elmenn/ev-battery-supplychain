/*  test/Escrow.confidential.test.js */
const Escrow        = artifacts.require("Escrow");
const truffleAssert = require("truffle-assertions");
const { toWei }     = web3.utils;
const BN = web3.utils.BN;

contract("Escrow Confidential", accounts => {
  const [buyer, seller, agent, transporter] = accounts;
  const secondsTillExpiry = 3600;
  const value      = 12345;
  const blinding   = web3.utils.randomHex(32);
  const commitment = web3.utils.soliditySha3(value, blinding);
  const twoEthWei  = toWei("2", "ether");
  const feeWei     = toWei("1", "ether");

  /* helper to jump Ganache time */
  async function skip(sec) {
    await web3.currentProvider.send({jsonrpc:"2.0",method:"evm_increaseTime",params:[sec],id:0},()=>{});
    await web3.currentProvider.send({jsonrpc:"2.0",method:"evm_mine",params:[],id:0},()=>{});
  }

  it("stores commitment and runs full happy-path", async () => {
    const twoEthWei = toWei("2", "ether");
    const esc = await Escrow.new(seller, agent, secondsTillExpiry, commitment, { from: buyer });
    // Funded step
    let txDeposit = await esc.deposit({ from: buyer, value: twoEthWei });
    truffleAssert.eventEmitted(txDeposit, "PhaseChanged",
      ev => ev.from.toString() === "0" && ev.to.toString() === "1");

    // sellerConfirm  -> Bid
    let txSellerConfirm = await esc.sellerConfirm({ from: seller });
    truffleAssert.eventEmitted(txSellerConfirm, "PhaseChanged", ev => ev.from.toString()==="1" && ev.to.toString()==="2");
    assert.equal((await esc.phase()).toString(), "2");

    // Bid -> Bound (seller picks transporter)
    await esc.createTransporter(1, { from: transporter });
    let txSetTransporter = await esc.setTransporter(transporter, { from: seller, value: feeWei });
    truffleAssert.eventEmitted(txSetTransporter, "PhaseChanged", ev => ev.from.toString()==="2" && ev.to.toString()==="3");
    assert.equal((await esc.phase()).toString(), "3");

    // verification code + delivered  -> Delivered
    await esc.setVerificationCode("code", { from: seller });
    let txDelivered = await esc.delivered("code", { from: buyer });
    truffleAssert.eventEmitted(txDelivered, "PhaseChanged", ev => ev.from.toString()==="3" && ev.to.toString()==="5");
    assert.equal((await esc.phase()).toString(), "5");

    // withdrawAmount must succeed in Delivered (assert seller balance increases)
    const before = new BN(await web3.eth.getBalance(seller));
    const txWithdraw = await esc.withdrawAmount({ from: seller });
    const after = new BN(await web3.eth.getBalance(seller));
    // Seller should receive at least 2 ether minus gas
    assert(after.sub(before).gte(new BN(toWei("1.7", "ether"))), "seller should receive deposit");
  });

  it("reverts delivered() when NOT in Bound", async () => {
    const esc = await Escrow.new(seller, agent, secondsTillExpiry, commitment, { from: buyer });
    await esc.deposit({ from: buyer, value: twoEthWei });

    await truffleAssert.reverts(
      esc.delivered("code", { from: buyer }),
      "Wrong phase"
    );
  });

  it("cancel() rules: expiry & phase", async () => {
    const esc = await Escrow.new(seller, agent, secondsTillExpiry, commitment, { from: buyer });
    await esc.deposit({ from: buyer, value: twoEthWei });     // Funded

    /* too early -> expiry guard */
    await truffleAssert.reverts(
      esc.cancel({ from: buyer }),
      "Cannot cancel before expiry"
    );

    /* go to Bid, still before expiry */
    await esc.sellerConfirm({ from: seller });
    await truffleAssert.reverts(
      esc.cancel({ from: buyer }),
      "Cannot cancel before expiry"
    );

    /* after expiry → success */
    await skip(secondsTillExpiry + 1);
    const tx = await esc.cancel({ from: buyer });
    truffleAssert.eventEmitted(tx, "EscrowCancelled", ev => ev.by === buyer);
    truffleAssert.eventEmitted(tx, "PhaseChanged",
      ev => ev.from.toString() === "2" && ev.to.toString() === "6");

    /* second call -> Already cancelled */
    await truffleAssert.reverts(
      esc.cancel({ from: buyer }),
      "Already cancelled"
    );
  });

  it("verifyRevealedAmount fails with wrong value OR blinding", async () => {
    const esc = await Escrow.new(seller, agent, secondsTillExpiry, commitment, { from: buyer });

    let tx = await esc.verifyRevealedAmount(value + 1, blinding, { from: buyer });
    assert.isFalse(tx.logs[0].args.valid);

    tx = await esc.verifyRevealedAmount(value, web3.utils.randomHex(32), { from: buyer });
    assert.isFalse(tx.logs[0].args.valid);
  });

  it("buyer refund after cancel (phase Bid, expired)", async () => {
    const twoEthWei = toWei("2", "ether");
    const esc = await Escrow.new(seller, agent, secondsTillExpiry, commitment, { from: buyer });
    await esc.deposit({ from: buyer, value: twoEthWei });
    await esc.sellerConfirm({ from: seller });

    const before = new BN(await web3.eth.getBalance(buyer));
    await skip(secondsTillExpiry + 1);
    await esc.cancel({ from: buyer });
    const after  = new BN(await web3.eth.getBalance(buyer));
    // we just check that some gas-adjusted refund happened (>=0.5 ether)
    assert(after.sub(before).gte(new BN(toWei("1.5", "ether"))), "buyer should receive refund");
    // Check contract balance is zero after refund
    const bal = await web3.eth.getBalance(esc.address);
    assert.equal(bal, "0", "contract should hold no ether after refund");
  });

  it("withdrawal allowed only after Delivered", async () => {
    const esc = await Escrow.new(seller, agent, secondsTillExpiry, commitment, { from: buyer });
    await esc.deposit({ from: buyer, value: twoEthWei });
    await esc.sellerConfirm({ from: seller });
    await esc.createTransporter(1, { from: transporter });
    await esc.setTransporter(transporter, { from: seller, value: feeWei });

    await truffleAssert.reverts(
      esc.withdrawAmount({ from: seller }),
      "Wrong phase"
    );

    await esc.setVerificationCode("code",{ from: seller });
    await esc.delivered("code", { from: buyer });
    await truffleAssert.passes(esc.withdrawAmount({ from: seller }));
  });

  it("checkTimeouts refunds buyer and expires escrow after deadline", async () => {
    const twoEthWei = toWei("2", "ether");
    const esc = await Escrow.new(seller, agent, secondsTillExpiry, commitment, { from: buyer });
    await esc.deposit({ from: buyer, value: twoEthWei });
    await esc.sellerConfirm({ from: seller }); // Move to Bid phase

    // Fast-forward time past expiry
    await skip(secondsTillExpiry + 1);

    // Call checkTimeouts from a third party (agent)
    const before = new BN(await web3.eth.getBalance(buyer));
    await esc.checkTimeouts({ from: agent });
    const after = new BN(await web3.eth.getBalance(buyer));

    // Phase should be Expired
    assert.equal((await esc.phase()).toString(), "7", "phase should be Expired");
    // Buyer should be refunded (allowing for gas)
    assert(after.sub(before).gte(new BN(toWei("1.7", "ether"))), "buyer should receive refund");
    // Contract balance should be zero
    const bal = await web3.eth.getBalance(esc.address);
    assert.equal(bal, "0", "contract should hold no ether after refund");
  });
});

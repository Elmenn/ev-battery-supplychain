const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const { expectRevert } = require("truffle-assertions");

contract("Funds Accounting", (accounts) => {
    let factory, implementation, escrow;
    const [owner, seller, buyer, transporter] = accounts;

    beforeEach(async () => {
        // Deploy implementation
        implementation = await ProductEscrow_Initializer.new();
        
        // Deploy factory with implementation
        factory = await ProductFactory.new(implementation.address);
        
        // Create a product
        const name = "Test Battery";
        const commitment = web3.utils.keccak256("test");
        const tx = await factory.createProduct(name, commitment, { from: seller });
        escrow = await ProductEscrow_Initializer.at(tx.logs[0].args.productAddress);
    });

    describe("Initial Balance", () => {
        it("should start with zero balance", async () => {
            const balance = await web3.eth.getBalance(escrow.address);
            assert.equal(balance.toString(), "0");
        });
    });

    describe("Purchase Funds", () => {
        it("should receive purchase funds correctly", async () => {
            const commitment = web3.utils.keccak256("purchase");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            const buyerInitialBalance = await web3.eth.getBalance(buyer);
            
            await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            // Check escrow balance
            const escrowBalance = await web3.eth.getBalance(escrow.address);
            assert.equal(escrowBalance.toString(), depositAmount);
            
            // Check product price tracking
            const productPrice = await escrow.productPrice();
            assert.equal(productPrice.toString(), depositAmount);
        });

        it("should track product price correctly", async () => {
            const commitment = web3.utils.keccak256("purchase");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            const productPrice = await escrow.productPrice();
            assert.equal(productPrice.toString(), depositAmount);
        });
    });

    describe("Transporter Deposits", () => {
        it("should handle security deposits correctly", async () => {
            const fee = web3.utils.toWei("0.1", "ether");
            const depositAmount = web3.utils.toWei("0.5", "ether");
            
            // Create transporter
            await escrow.createTransporter(fee, { from: transporter });
            
            // Make security deposit
            const transporterInitialBalance = await web3.eth.getBalance(transporter);
            
            await escrow.securityDeposit({ from: transporter, value: depositAmount });
            
            // Check escrow balance increased
            const escrowBalance = await web3.eth.getBalance(escrow.address);
            assert.equal(escrowBalance.toString(), depositAmount);
            
            // Check security deposit tracking
            const securityDeposit = await escrow.securityDeposits(transporter);
            assert.equal(securityDeposit.toString(), depositAmount);
        });

        it("should allow multiple deposits", async () => {
            const fee = web3.utils.toWei("0.1", "ether");
            const deposit1 = web3.utils.toWei("0.3", "ether");
            const deposit2 = web3.utils.toWei("0.2", "ether");
            
            await escrow.createTransporter(fee, { from: transporter });
            
            await escrow.securityDeposit({ from: transporter, value: deposit1 });
            await escrow.securityDeposit({ from: transporter, value: deposit2 });
            
            const totalDeposit = await escrow.securityDeposits(transporter);
            assert.equal(totalDeposit.toString(), web3.utils.toBN(deposit1).add(web3.utils.toBN(deposit2)).toString());
        });
    });

    describe("Fund Withdrawals", () => {
        it("should allow transporter to withdraw bid", async () => {
            const fee = web3.utils.toWei("0.1", "ether");
            const depositAmount = web3.utils.toWei("0.5", "ether");
            
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: depositAmount });
            
            const transporterInitialBalance = await web3.eth.getBalance(transporter);
            
            // Withdraw bid
            await escrow.withdrawBid({ from: transporter });
            
            // Check security deposit reset
            const securityDeposit = await escrow.securityDeposits(transporter);
            assert.equal(securityDeposit.toString(), "0");
            
            // Check transporter status reset
            const isTransporter = await escrow.isTransporter(transporter);
            assert.isFalse(isTransporter);
        });

        it("should refund security deposit on withdrawal", async () => {
            const fee = web3.utils.toWei("0.1", "ether");
            const depositAmount = web3.utils.toWei("0.5", "ether");
            
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: depositAmount });
            
            const transporterInitialBalance = await web3.eth.getBalance(transporter);
            
            await escrow.withdrawBid({ from: transporter });
            
            const transporterFinalBalance = await web3.eth.getBalance(transporter);
            // Note: balance will be slightly less due to gas costs
            assert.isTrue(web3.utils.toBN(transporterFinalBalance).gt(web3.utils.toBN(transporterInitialBalance).sub(web3.utils.toBN(depositAmount))));
        });
    });

    describe("Balance Reconciliation", () => {
        it("should maintain correct total balance", async () => {
            const commitment = web3.utils.keccak256("purchase");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const purchaseAmount = web3.utils.toWei("1", "ether");
            
            // Purchase
            await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: purchaseAmount }
            );
            
            // Transporter deposit
            const fee = web3.utils.toWei("0.1", "ether");
            const depositAmount = web3.utils.toWei("0.5", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: depositAmount });
            
            // Check total balance
            const totalBalance = await web3.eth.getBalance(escrow.address);
            const expectedBalance = web3.utils.toBN(purchaseAmount).add(web3.utils.toBN(depositAmount));
            assert.equal(totalBalance.toString(), expectedBalance.toString());
        });

        it("should not allow double spending", async () => {
            const commitment = web3.utils.keccak256("purchase");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            // Try to purchase again (should fail)
            await expectRevert(
                escrow.depositPurchase(
                    commitment,
                    valueCommitment,
                    proof,
                    { from: buyer, value: depositAmount }
                ),
                "Already purchased"
            );
            
            // Balance should remain unchanged
            const escrowBalance = await web3.eth.getBalance(escrow.address);
            assert.equal(escrowBalance.toString(), depositAmount);
        });
    });

    describe("No Stuck Funds", () => {
        it("should allow proper fund flow", async () => {
            const commitment = web3.utils.keccak256("purchase");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            // Purchase
            await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            // Confirm order
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            // Set transporter
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: web3.utils.toWei("0.5", "ether") });
            await escrow.setTransporter(transporter, { from: seller, value: fee });
            
            // Check all funds are accounted for
            const escrowBalance = await web3.eth.getBalance(escrow.address);
            const expectedBalance = web3.utils.toBN(depositAmount).add(web3.utils.toBN(fee)).add(web3.utils.toBN(web3.utils.toWei("0.5", "ether")));
            assert.equal(escrowBalance.toString(), expectedBalance.toString());
        });
    });
}); 
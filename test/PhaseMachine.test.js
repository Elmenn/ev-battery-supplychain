const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const { expectRevert } = require("truffle-assertions");

contract("Phase Machine", (accounts) => {
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

    describe("Initial State", () => {
        it("should start in Listed phase", async () => {
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "0"); // Listed
        });

        it("should have correct initial values", async () => {
            assert.isFalse(await escrow.purchased());
            assert.equal(await escrow.buyer(), "0x0000000000000000000000000000000000000000");
            assert.equal(await escrow.transporter(), "0x0000000000000000000000000000000000000000");
        });
    });

    describe("Phase Transitions", () => {
        it("should transition from Listed to Purchased", async () => {
            const commitment = web3.utils.keccak256("purchase");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            const tx = await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            // Check phase change
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "1"); // Purchased
            
            // Check event
            assert.equal(tx.logs[0].event, "PhaseChanged");
            assert.equal(tx.logs[0].args.from.toString(), "0"); // Listed
            assert.equal(tx.logs[0].args.to.toString(), "1"); // Purchased
        });

        it("should transition from Purchased to OrderConfirmed", async () => {
            // First make purchase
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
            
            // Then confirm order
            const vcCID = "ipfs://QmTest";
            const tx = await escrow.confirmOrder(vcCID, { from: seller });
            
            // Check phase change
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "2"); // OrderConfirmed
            
            // Check event
            assert.equal(tx.logs[0].event, "PhaseChanged");
            assert.equal(tx.logs[0].args.from.toString(), "1"); // Purchased
            assert.equal(tx.logs[0].args.to.toString(), "2"); // OrderConfirmed
        });

        it("should transition from OrderConfirmed to Bound", async () => {
            // Setup: go through purchase and confirmation
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
            
            const vcCID = "ipfs://QmTest";
            await escrow.confirmOrder(vcCID, { from: seller });
            
            // Create transporter
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: web3.utils.toWei("0.5", "ether") });
            
            // Set transporter
            const tx = await escrow.setTransporter(transporter, { from: seller, value: fee });
            
            // Check phase change
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "3"); // Bound
            
            // Check event
            assert.equal(tx.logs[0].event, "PhaseChanged");
            assert.equal(tx.logs[0].args.from.toString(), "2"); // OrderConfirmed
            assert.equal(tx.logs[0].args.to.toString(), "3"); // Bound
        });
    });

    describe("Invalid Phase Transitions", () => {
        it("should revert confirmOrder from wrong phase", async () => {
            const vcCID = "ipfs://QmTest";
            
            await expectRevert(
                escrow.confirmOrder(vcCID, { from: seller }),
                "Wrong phase"
            );
        });

        it("should revert setTransporter from wrong phase", async () => {
            const fee = web3.utils.toWei("0.1", "ether");
            
            await expectRevert(
                escrow.setTransporter(transporter, { from: seller, value: fee }),
                "Wrong phase"
            );
        });

        it("should revert depositPurchase if already purchased", async () => {
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
            
            // Try to purchase again
            await expectRevert(
                escrow.depositPurchase(
                    commitment,
                    valueCommitment,
                    proof,
                    { from: buyer, value: depositAmount }
                ),
                "Already purchased"
            );
        });
    });

    describe("Event Emissions", () => {
        it("should emit all required events during purchase", async () => {
            const commitment = web3.utils.keccak256("purchase");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            const tx = await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            // Check events
            const events = tx.logs.map(log => log.event);
            assert.include(events, "PhaseChanged");
            assert.include(events, "OrderConfirmed");
            assert.include(events, "ValueCommitted");
            assert.include(events, "ProductStateChanged");
        });

        it("should emit ProductStateChanged on every state change", async () => {
            const commitment = web3.utils.keccak256("purchase");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            const tx = await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            // Check ProductStateChanged event
            const stateChangedEvent = tx.logs.find(log => log.event === "ProductStateChanged");
            assert.exists(stateChangedEvent);
            assert.equal(stateChangedEvent.args.productId.toString(), "1");
            assert.equal(stateChangedEvent.args.seller, seller);
            assert.equal(stateChangedEvent.args.buyer, buyer);
            assert.equal(stateChangedEvent.args.phase.toString(), "1"); // Purchased
        });
    });
}); 
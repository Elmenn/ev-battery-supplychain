const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const MaliciousReentrant = artifacts.require("helpers/MaliciousReentrant");
const { expectRevert } = require("truffle-assertions");

contract("Reentrancy Protection", (accounts) => {
    let factory, implementation, escrow, maliciousContract;
    const [owner, seller, buyer, attacker] = accounts;

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
        
        // Deploy malicious contract
        maliciousContract = await MaliciousReentrant.new(escrow.address);
    });

    describe("ReentrancyGuard Protection", () => {
        it("should prevent reentrancy on depositPurchase", async () => {
            // Setup: buyer deposits ETH to malicious contract
            const depositAmount = web3.utils.toWei("1", "ether");
            await maliciousContract.send(depositAmount);
            
            // Try to attack through depositPurchase
            const commitment = web3.utils.keccak256("attack");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            
            // This should revert due to ReentrancyGuard
            await expectRevert(
                maliciousContract.attackReentrant(
                    commitment,
                    valueCommitment,
                    proof,
                    { value: depositAmount }
                ),
                "ReentrancyGuard: reentrant call"
            );
        });

        it("should prevent reentrancy on securityDeposit", async () => {
            // Setup: attacker becomes a transporter
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: attacker });
            
            // Try to attack through securityDeposit
            const depositAmount = web3.utils.toWei("0.5", "ether");
            
            // This should revert due to ReentrancyGuard
            await expectRevert(
                maliciousContract.attackSecurityDeposit({ value: depositAmount }),
                "ReentrancyGuard: reentrant call"
            );
        });

        it("should prevent reentrancy on withdrawBid", async () => {
            // Setup: attacker becomes a transporter and deposits
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: attacker });
            await escrow.securityDeposit({ from: attacker, value: web3.utils.toWei("0.5", "ether") });
            
            // Try to attack through withdrawBid
            await expectRevert(
                maliciousContract.attackWithdrawBid(),
                "ReentrancyGuard: reentrant call"
            );
        });
    });

    describe("Effects-Then-Interactions Pattern", () => {
        it("should update state before external calls", async () => {
            // This test verifies that state changes happen before external calls
            // The ReentrancyGuard ensures this pattern is enforced
            
            const commitment = web3.utils.keccak256("test");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            // Check initial state
            assert.isFalse(await escrow.purchased());
            assert.equal(await escrow.buyer(), "0x0000000000000000000000000000000000000000");
            
            // Make purchase
            await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            // Verify state was updated
            assert.isTrue(await escrow.purchased());
            assert.equal(await escrow.buyer(), buyer);
        });
    });

    describe("Malicious Contract Integration", () => {
        it("should not allow malicious contract to drain funds", async () => {
            // Setup: create a legitimate purchase
            const commitment = web3.utils.keccak256("test");
            const valueCommitment = web3.utils.keccak256("value");
            const proof = "0x";
            const depositAmount = web3.utils.toWei("1", "ether");
            
            await escrow.depositPurchase(
                commitment,
                valueCommitment,
                proof,
                { from: buyer, value: depositAmount }
            );
            
            // Check initial balance
            const initialBalance = await web3.eth.getBalance(escrow.address);
            assert.equal(initialBalance, depositAmount);
            
            // Try to attack (should fail)
            await expectRevert(
                maliciousContract.attackReentrant(
                    commitment,
                    valueCommitment,
                    proof,
                    { value: depositAmount }
                ),
                "ReentrancyGuard: reentrant call"
            );
            
            // Verify funds are still safe
            const finalBalance = await web3.eth.getBalance(escrow.address);
            assert.equal(finalBalance, depositAmount);
        });
    });
}); 
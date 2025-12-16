const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");

contract("Access Control", (accounts) => {
    let factory, implementation, newImplementation;
    const [owner, nonOwner, seller] = accounts;

    beforeEach(async () => {
        // Deploy implementation
        implementation = await ProductEscrow_Initializer.new();
        newImplementation = await ProductEscrow_Initializer.new();
        
        // Deploy factory with implementation
        factory = await ProductFactory.new(implementation.address);
    });

    describe("Factory Ownership", () => {
        it("should set correct owner on deployment", async () => {
            const factoryOwner = await factory.owner();
            assert.equal(factoryOwner, owner);
        });

        it("should only allow owner to pause", async () => {
            // Owner can pause
            await factory.pause({ from: owner });
            assert.isTrue(await factory.isPaused());
            
            // Non-owner cannot pause
            await truffleAssert.reverts(
                factory.pause({ from: nonOwner })
            );
        });

        it("should only allow owner to unpause", async () => {
            await factory.pause({ from: owner });
            
            // Non-owner cannot unpause
            await truffleAssert.reverts(
                factory.unpause({ from: nonOwner })
            );
            
            // Owner can unpause
            await factory.unpause({ from: owner });
            assert.isFalse(await factory.isPaused());
        });
    });

    describe("Implementation Updates", () => {
        it("should only allow owner to update implementation", async () => {
            // Non-owner cannot update
            await truffleAssert.reverts(
                factory.setImplementation(newImplementation.address, { from: nonOwner })
            );
            
            // Owner can update
            await factory.setImplementation(newImplementation.address, { from: owner });
            
            const currentImpl = await factory.implementation();
            assert.equal(currentImpl, newImplementation.address);
        });

        it("should revert update to zero address", async () => {
            await truffleAssert.reverts(
                factory.setImplementation("0x0000000000000000000000000000000000000000", { from: owner })
            );
        });

        it("should emit ImplementationUpdated event", async () => {
            const tx = await factory.setImplementation(newImplementation.address, { from: owner });
            
            assert.equal(tx.logs[0].event, "ImplementationUpdated");
            assert.equal(tx.logs[0].args.oldImpl, implementation.address);
            assert.equal(tx.logs[0].args.newImpl, newImplementation.address);
        });
    });

    describe("Paused State", () => {
        it("should prevent product creation when paused", async () => {
            await factory.pause({ from: owner });
            
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const price = web3.utils.toWei("1", "ether");
            
            await truffleAssert.reverts(
                factory.createProduct(name, commitment, price, { from: seller })
            );
        });

        it("should allow implementation updates when paused (emergency updates)", async () => {
            await factory.pause({ from: owner });
            
            // Implementation updates are allowed even when paused (for emergency fixes)
            const tx = await factory.setImplementation(newImplementation.address, { from: owner });
            const currentImpl = await factory.implementation();
            assert.equal(currentImpl, newImplementation.address, "Implementation should be updated even when paused");
        });

        it("should allow product creation when unpaused", async () => {
            await factory.pause({ from: owner });
            await factory.unpause({ from: owner });
            
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const price = web3.utils.toWei("1", "ether");
            
            const tx = await factory.createProduct(name, commitment, price, { from: seller });
            // Find ProductCreated event in logs
            const productCreatedEvent = tx.logs.find(log => log.event === "ProductCreated");
            assert.isDefined(productCreatedEvent, "ProductCreated event should be emitted");
            assert.equal(productCreatedEvent.args.seller, seller, "Seller should match");
        });
    });
}); 
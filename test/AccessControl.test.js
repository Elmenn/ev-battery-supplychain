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
            assert.isTrue(await factory.paused());
            
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
            assert.isFalse(await factory.paused());
        });
    });

    describe("Implementation Updates", () => {
        it("should only allow owner to update implementation", async () => {
            // Non-owner cannot update
            await truffleAssert.reverts(
                factory.updateImplementation(newImplementation.address, { from: nonOwner })
            );
            
            // Owner can update
            await factory.updateImplementation(newImplementation.address, { from: owner });
            
            const currentImpl = await factory.implementation();
            assert.equal(currentImpl, newImplementation.address);
        });

        it("should revert update to zero address", async () => {
            await truffleAssert.reverts(
                factory.updateImplementation("0x0000000000000000000000000000000000000000", { from: owner })
            );
        });

        it("should emit ImplementationUpdated event", async () => {
            const tx = await factory.updateImplementation(newImplementation.address, { from: owner });
            
            assert.equal(tx.logs[0].event, "ImplementationUpdated");
            assert.equal(tx.logs[0].args.oldImplementation, implementation.address);
            assert.equal(tx.logs[0].args.newImplementation, newImplementation.address);
        });
    });

    describe("Paused State", () => {
        it("should prevent product creation when paused", async () => {
            await factory.pause({ from: owner });
            
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            await truffleAssert.reverts(
                factory.createProduct(name, commitment, { from: seller })
            );
        });

        it("should prevent implementation updates when paused", async () => {
            await factory.pause({ from: owner });
            
            await truffleAssert.reverts(
                factory.updateImplementation(newImplementation.address, { from: owner })
            );
        });

        it("should allow product creation when unpaused", async () => {
            await factory.pause({ from: owner });
            await factory.unpause({ from: owner });
            
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            const tx = await factory.createProduct(name, commitment, { from: seller });
            assert.equal(tx.logs[1].event, "ProductCreated"); // ProductCreated is the second event
        });
    });
}); 
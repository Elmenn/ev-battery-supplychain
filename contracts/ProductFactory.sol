// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProductEscrow.sol";

contract ProductFactory {
    /// @notice Emitted when a new ProductEscrow is deployed
    event ProductCreated(address indexed productAddress, address indexed seller);
    event DebugCommitment(bytes32 commitment);

    address[] public products;
    uint256 public productCounter = 0;

    /// @notice Deploys a new ProductEscrow and emits ProductCreated
    /// @param _name  The name of the product
    /// @param _priceCommitment The price commitment (hash) of the product
    function createProduct(string memory _name, bytes32 _priceCommitment) public {
        emit DebugCommitment(_priceCommitment);
        productCounter++;
        ProductEscrow newProduct = new ProductEscrow(productCounter, _name, _priceCommitment, msg.sender);
        address escrowAddr = address(newProduct);

        products.push(escrowAddr);
        emit ProductCreated(escrowAddr, msg.sender);
    }

    /// @notice Returns all deployed escrow addresses
    function getProducts() public view returns (address[] memory) {
        return products;
    }
}

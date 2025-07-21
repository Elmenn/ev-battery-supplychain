// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProductEscrow.sol";

contract ProductFactory {
    /// @notice Emitted when a new ProductEscrow is deployed
    event ProductCreated(address indexed productAddress, address indexed seller);

    address[] public products;

    /// @notice Deploys a new ProductEscrow and emits ProductCreated
    /// @param _name  The name of the product
    /// @param _price The price (in wei) of the product
    function createProduct(string memory _name, uint _price) public {
        ProductEscrow newProduct = new ProductEscrow(_name, _price, msg.sender);
        address escrowAddr = address(newProduct);

        products.push(escrowAddr);
        emit ProductCreated(escrowAddr, msg.sender);
    }

    /// @notice Returns all deployed escrow addresses
    function getProducts() public view returns (address[] memory) {
        return products;
    }
}

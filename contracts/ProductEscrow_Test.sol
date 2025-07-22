// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProductEscrow.sol";

contract ProductEscrow_Test is ProductEscrow {
    function maxBids() internal view virtual override returns (uint8) {
        return 5;
    }
    constructor(string memory _name, bytes32 _priceCommitment, address _owner)
        ProductEscrow(_name, _priceCommitment, _owner) {}
} 
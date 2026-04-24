// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ProductEscrowConfidential_Initializer} from "./ProductEscrowConfidential_Initializer.sol";

error ZeroPriceCommitment();

contract ProductEscrowConfidential_PrivatePrice is ProductEscrowConfidential_Initializer {
    bytes32 public privatePriceCommitment;

    event ProductInitializedPrivate(
        uint256 indexed productId,
        address indexed seller,
        address indexed paymentToken,
        bytes32 priceCommitment
    );

    function initializeConfidentialPrivatePrice(
        uint256 _id,
        string memory _name,
        bytes32 _priceCommitment,
        address _owner,
        IERC7984 _paymentToken,
        address _factory
    ) external {
        if (_priceCommitment == bytes32(0)) revert ZeroPriceCommitment();

        privatePriceCommitment = _priceCommitment;
        _initializeConfidentialCore(_id, _name, 0, bytes32(0), _owner, _paymentToken, _factory, false);

        emit ProductInitializedPrivate(_id, _owner, address(_paymentToken), _priceCommitment);
    }

    function priceVisibility() external pure override returns (uint8) {
        return 1;
    }

    function priceCommitment() external view override returns (bytes32) {
        return privatePriceCommitment;
    }
}

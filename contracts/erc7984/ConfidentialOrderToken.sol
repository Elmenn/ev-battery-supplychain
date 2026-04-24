// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// Spike scaffold only.
// Expected dependencies once installed in this worktree:
// - @fhevm/solidity
// - @openzeppelin/confidential-contracts

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @notice Confidential settlement token used by the ERC-7984 marketplace flow.
/// @dev This implementation remains intentionally small; wrapping and liquidity are separate concerns.
contract ConfidentialOrderToken is ERC7984, Ownable, ZamaEthereumConfig {
    constructor(
        address owner_,
        string memory name_,
        string memory symbol_,
        string memory contractURI_
    ) ERC7984(name_, symbol_, contractURI_) Ownable(owner_) {}

    function confidentialMint(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner returns (euint64 minted) {
        minted = FHE.fromExternal(encryptedAmount, inputProof);
        _mint(to, minted);
    }

    function mintFromPublicAmount(address to, uint64 amount) external onlyOwner returns (euint64 minted) {
        minted = FHE.asEuint64(amount);
        _mint(to, minted);
    }

    function confidentialBurn(
        address from,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner returns (euint64 burned) {
        burned = FHE.fromExternal(encryptedAmount, inputProof);
        _burn(from, burned);
    }

    /// @notice Burns a clear public amount from a confidential balance.
    /// @dev Used by the funding wrapper for deterministic redeem (confidential -> public).
    function burnFromPublicAmount(address from, uint64 amount) external onlyOwner returns (euint64 burned) {
        burned = FHE.asEuint64(amount);
        _burn(from, burned);
    }
}

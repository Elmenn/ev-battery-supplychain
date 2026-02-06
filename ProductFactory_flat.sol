// File: @openzeppelin\contracts\utils\Errors.sol

// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/Errors.sol)

pragma solidity ^0.8.21;

/**
 * @dev Collection of common custom errors used in multiple contracts
 *
 * IMPORTANT: Backwards compatibility is not guaranteed in future versions of the library.
 * It is recommended to avoid relying on the error API for critical functionality.
 *
 * _Available since v5.1._
 */
library Errors {
    /**
     * @dev The ETH balance of the account is not enough to perform the operation.
     */
    error InsufficientBalance(uint256 balance, uint256 needed);

    /**
     * @dev A call to an address target failed. The target may have reverted.
     */
    error FailedCall();

    /**
     * @dev The deployment failed.
     */
    error FailedDeployment();

    /**
     * @dev A necessary precompile is missing.
     */
    error MissingPrecompile(address);
}

// File: @openzeppelin\contracts\utils\Create2.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/Create2.sol)


/**
 * @dev Helper to make usage of the `CREATE2` EVM opcode easier and safer.
 * `CREATE2` can be used to compute in advance the address where a smart
 * contract will be deployed, which allows for interesting new mechanisms known
 * as 'counterfactual interactions'.
 *
 * See the https://eips.ethereum.org/EIPS/eip-1014#motivation[EIP] for more
 * information.
 */
library Create2 {
    /**
     * @dev There's no code to deploy.
     */
    error Create2EmptyBytecode();

    /**
     * @dev Deploys a contract using `CREATE2`. The address where the contract
     * will be deployed can be known in advance via {computeAddress}.
     *
     * The bytecode for a contract can be obtained from Solidity with
     * `type(contractName).creationCode`.
     *
     * Requirements:
     *
     * - `bytecode` must not be empty.
     * - `salt` must have not been used for `bytecode` already.
     * - the factory must have a balance of at least `amount`.
     * - if `amount` is non-zero, `bytecode` must have a `payable` constructor.
     */
    function deploy(uint256 amount, bytes32 salt, bytes memory bytecode) internal returns (address addr) {
        if (address(this).balance < amount) {
            revert Errors.InsufficientBalance(address(this).balance, amount);
        }
        if (bytecode.length == 0) {
            revert Create2EmptyBytecode();
        }
        assembly ("memory-safe") {
            addr := create2(amount, add(bytecode, 0x20), mload(bytecode), salt)
            // if no address was created, and returndata is not empty, bubble revert
            if and(iszero(addr), not(iszero(returndatasize()))) {
                let p := mload(0x40)
                returndatacopy(p, 0, returndatasize())
                revert(p, returndatasize())
            }
        }
        if (addr == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Returns the address where a contract will be stored if deployed via {deploy}. Any change in the
     * `bytecodeHash` or `salt` will result in a new destination address.
     */
    function computeAddress(bytes32 salt, bytes32 bytecodeHash) internal view returns (address) {
        return computeAddress(salt, bytecodeHash, address(this));
    }

    /**
     * @dev Returns the address where a contract will be stored if deployed via {deploy} from a contract located at
     * `deployer`. If `deployer` is this contract's address, returns the same value as {computeAddress}.
     */
    function computeAddress(bytes32 salt, bytes32 bytecodeHash, address deployer) internal pure returns (address addr) {
        assembly ("memory-safe") {
            let ptr := mload(0x40) // Get free memory pointer

            // |                   | Ôåô ptr ...  Ôåô ptr + 0x0B (start) ...  Ôåô ptr + 0x20 ...  Ôåô ptr + 0x40 ...   |
            // |-------------------|---------------------------------------------------------------------------|
            // | bytecodeHash      |                                                        CCCCCCCCCCCCC...CC |
            // | salt              |                                      BBBBBBBBBBBBB...BB                   |
            // | deployer          | 000000...0000AAAAAAAAAAAAAAAAAAA...AA                                     |
            // | 0xFF              |            FF                                                             |
            // |-------------------|---------------------------------------------------------------------------|
            // | memory            | 000000...00FFAAAAAAAAAAAAAAAAAAA...AABBBBBBBBBBBBB...BBCCCCCCCCCCCCC...CC |
            // | keccak(start, 85) |            ÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæÔåæ |

            mstore(add(ptr, 0x40), bytecodeHash)
            mstore(add(ptr, 0x20), salt)
            mstore(ptr, deployer) // Right-aligned with 12 preceding garbage bytes
            let start := add(ptr, 0x0b) // The hashed data starts at the final garbage byte which we will set to 0xff
            mstore8(start, 0xff)
            addr := and(keccak256(start, 85), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }
}

// File: @openzeppelin\contracts\proxy\Clones.sol

// OpenZeppelin Contracts (last updated v5.4.0) (proxy/Clones.sol)



/**
 * @dev https://eips.ethereum.org/EIPS/eip-1167[ERC-1167] is a standard for
 * deploying minimal proxy contracts, also known as "clones".
 *
 * > To simply and cheaply clone contract functionality in an immutable way, this standard specifies
 * > a minimal bytecode implementation that delegates all calls to a known, fixed address.
 *
 * The library includes functions to deploy a proxy using either `create` (traditional deployment) or `create2`
 * (salted deterministic deployment). It also includes functions to predict the addresses of clones deployed using the
 * deterministic method.
 */
library Clones {
    error CloneArgumentsTooLong();

    /**
     * @dev Deploys and returns the address of a clone that mimics the behavior of `implementation`.
     *
     * This function uses the create opcode, which should never revert.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     */
    function clone(address implementation) internal returns (address instance) {
        return clone(implementation, 0);
    }

    /**
     * @dev Same as {xref-Clones-clone-address-}[clone], but with a `value` parameter to send native currency
     * to the new contract.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function clone(address implementation, uint256 value) internal returns (address instance) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        assembly ("memory-safe") {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(value, 0x09, 0x37)
        }
        if (instance == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Deploys and returns the address of a clone that mimics the behavior of `implementation`.
     *
     * This function uses the create2 opcode and a `salt` to deterministically deploy
     * the clone. Using the same `implementation` and `salt` multiple times will revert, since
     * the clones cannot be deployed twice at the same address.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     */
    function cloneDeterministic(address implementation, bytes32 salt) internal returns (address instance) {
        return cloneDeterministic(implementation, salt, 0);
    }

    /**
     * @dev Same as {xref-Clones-cloneDeterministic-address-bytes32-}[cloneDeterministic], but with
     * a `value` parameter to send native currency to the new contract.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function cloneDeterministic(
        address implementation,
        bytes32 salt,
        uint256 value
    ) internal returns (address instance) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        assembly ("memory-safe") {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create2(value, 0x09, 0x37, salt)
        }
        if (instance == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     */
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt,
        address deployer
    ) internal pure returns (address predicted) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(add(ptr, 0x38), deployer)
            mstore(add(ptr, 0x24), 0x5af43d82803e903d91602b57fd5bf3ff)
            mstore(add(ptr, 0x14), implementation)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73)
            mstore(add(ptr, 0x58), salt)
            mstore(add(ptr, 0x78), keccak256(add(ptr, 0x0c), 0x37))
            predicted := and(keccak256(add(ptr, 0x43), 0x55), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     */
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt
    ) internal view returns (address predicted) {
        return predictDeterministicAddress(implementation, salt, address(this));
    }

    /**
     * @dev Deploys and returns the address of a clone that mimics the behavior of `implementation` with custom
     * immutable arguments. These are provided through `args` and cannot be changed after deployment. To
     * access the arguments within the implementation, use {fetchCloneArgs}.
     *
     * This function uses the create opcode, which should never revert.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     */
    function cloneWithImmutableArgs(address implementation, bytes memory args) internal returns (address instance) {
        return cloneWithImmutableArgs(implementation, args, 0);
    }

    /**
     * @dev Same as {xref-Clones-cloneWithImmutableArgs-address-bytes-}[cloneWithImmutableArgs], but with a `value`
     * parameter to send native currency to the new contract.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function cloneWithImmutableArgs(
        address implementation,
        bytes memory args,
        uint256 value
    ) internal returns (address instance) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        bytes memory bytecode = _cloneCodeWithImmutableArgs(implementation, args);
        assembly ("memory-safe") {
            instance := create(value, add(bytecode, 0x20), mload(bytecode))
        }
        if (instance == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Deploys and returns the address of a clone that mimics the behavior of `implementation` with custom
     * immutable arguments. These are provided through `args` and cannot be changed after deployment. To
     * access the arguments within the implementation, use {fetchCloneArgs}.
     *
     * This function uses the create2 opcode and a `salt` to deterministically deploy the clone. Using the same
     * `implementation`, `args` and `salt` multiple times will revert, since the clones cannot be deployed twice
     * at the same address.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     */
    function cloneDeterministicWithImmutableArgs(
        address implementation,
        bytes memory args,
        bytes32 salt
    ) internal returns (address instance) {
        return cloneDeterministicWithImmutableArgs(implementation, args, salt, 0);
    }

    /**
     * @dev Same as {xref-Clones-cloneDeterministicWithImmutableArgs-address-bytes-bytes32-}[cloneDeterministicWithImmutableArgs],
     * but with a `value` parameter to send native currency to the new contract.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function cloneDeterministicWithImmutableArgs(
        address implementation,
        bytes memory args,
        bytes32 salt,
        uint256 value
    ) internal returns (address instance) {
        bytes memory bytecode = _cloneCodeWithImmutableArgs(implementation, args);
        return Create2.deploy(value, salt, bytecode);
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministicWithImmutableArgs}.
     */
    function predictDeterministicAddressWithImmutableArgs(
        address implementation,
        bytes memory args,
        bytes32 salt,
        address deployer
    ) internal pure returns (address predicted) {
        bytes memory bytecode = _cloneCodeWithImmutableArgs(implementation, args);
        return Create2.computeAddress(salt, keccak256(bytecode), deployer);
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministicWithImmutableArgs}.
     */
    function predictDeterministicAddressWithImmutableArgs(
        address implementation,
        bytes memory args,
        bytes32 salt
    ) internal view returns (address predicted) {
        return predictDeterministicAddressWithImmutableArgs(implementation, args, salt, address(this));
    }

    /**
     * @dev Get the immutable args attached to a clone.
     *
     * - If `instance` is a clone that was deployed using `clone` or `cloneDeterministic`, this
     *   function will return an empty array.
     * - If `instance` is a clone that was deployed using `cloneWithImmutableArgs` or
     *   `cloneDeterministicWithImmutableArgs`, this function will return the args array used at
     *   creation.
     * - If `instance` is NOT a clone deployed using this library, the behavior is undefined. This
     *   function should only be used to check addresses that are known to be clones.
     */
    function fetchCloneArgs(address instance) internal view returns (bytes memory) {
        bytes memory result = new bytes(instance.code.length - 45); // revert if length is too short
        assembly ("memory-safe") {
            extcodecopy(instance, add(result, 32), 45, mload(result))
        }
        return result;
    }

    /**
     * @dev Helper that prepares the initcode of the proxy with immutable args.
     *
     * An assembly variant of this function requires copying the `args` array, which can be efficiently done using
     * `mcopy`. Unfortunately, that opcode is not available before cancun. A pure solidity implementation using
     * abi.encodePacked is more expensive but also more portable and easier to review.
     *
     * NOTE: https://eips.ethereum.org/EIPS/eip-170[EIP-170] limits the length of the contract code to 24576 bytes.
     * With the proxy code taking 45 bytes, that limits the length of the immutable args to 24531 bytes.
     */
    function _cloneCodeWithImmutableArgs(
        address implementation,
        bytes memory args
    ) private pure returns (bytes memory) {
        if (args.length > 24531) revert CloneArgumentsTooLong();
        return
            abi.encodePacked(
                hex"61",
                uint16(args.length + 45),
                hex"3d81600a3d39f3363d3d373d3d3d363d73",
                implementation,
                hex"5af43d82803e903d91602b57fd5bf3",
                args
            );
    }
}

// File: @openzeppelin\contracts\utils\Context.sol

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)


/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// File: @openzeppelin\contracts\access\Ownable.sol

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// File: @openzeppelin\contracts\utils\ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)


/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

// File: contracts\ProductEscrow_Initializer.sol



// Standardized custom errors for gas efficiency and consistency
// Role-specific errors
error NotBuyer();
error NotSeller();
error NotTransporter();
error NotFactory();

// Shared business logic errors
error InvalidPhase();
error InvalidProductId();
error InvalidOwnerAddress();
error EmptyName();
error ZeroPriceCommitment();
error CommitmentFrozen();
error AlreadyInitialized();
error AlreadyPurchased();
error AlreadyDelivered();
error AlreadyExists();
error AlreadyPaid();
error AlreadySelected();

// State validation errors
error WrongPhase();
error TransporterNotSet();
error BidCapReached();
error NotRegistered();
error IncorrectFee();
error NotATransporter();
error OwnerCannotPurchase();
error NotPurchased();
error NotDelivered();
error TooEarlyToDelete();
error RevealInvalid();
error DeliveryTimeout();
error PriceZero();
error SellerWindowNotExpired();
error BiddingWindowNotExpired();
error NotYetTimeout();

// Transfer and payment errors
error TransferFailed(address to, uint256 amount);
error BuyerRefundFailed();
error RefundFailed();
error IncorrectDeliveryFee();

// Railgun and memo errors
error WrongProductId();
error ZeroMemoHash();
error ZeroTxRef();
error WrongPhaseForPayment();
error NoTransporter();
error MemoAlreadyUsed();
error PaymentAlreadyRecorded();
error NotParticipant();

// --- Public Purchase Errors ---
error PublicDisabled();
error PrivateDisabled();
error PublicPriceNotSet();
error InvalidPurchaseMode();

contract ProductEscrow_Initializer is ReentrancyGuard {
    // Packed storage for gas optimization - Group 1 (32 bytes)
    uint256 public id;
    string public name;
    bytes32 public priceCommitment; // Confidential price commitment
    
    // Packed storage - Group 2 (32 bytes) - addresses pack together
    address payable public owner;
    address payable public buyer;
    address payable public transporter;
    
    // Packed storage - Group 3 (32 bytes) - enum + timestamps + booleans + counters
    enum Phase { Listed, Purchased, OrderConfirmed, Bound, Delivered, Expired }
    Phase public phase;
    uint64 public purchaseTimestamp; // Timestamp when purchase is confirmed
    uint64 public orderConfirmedTimestamp; // Timestamp when seller confirms order
    bool public purchased;
    bool public delivered;
    uint32 public transporterCount;
    
    // Packed storage - Group 4 (32 bytes) - constants pack together
    uint32 public constant SELLER_WINDOW = 2 days; // Seller must confirm within 48h
    uint32 public constant BID_WINDOW = 2 days;    // Bidding window after seller confirmation
    uint32 public constant DELIVERY_WINDOW = 2 days; // Delivery window after transporter is set
    uint8 public constant MAX_BIDS = 20; // Cap on number of transporter bids
    
    // Separate storage for larger values (don't pack with smaller types)
    uint public deliveryFee;
    uint public productPrice; // Explicitly track the buyer's deposit amount
    string public vcCid; // IPFS hash or other identifier
    
    // --- Modes ---
    enum PurchaseMode { None, Public, Private }
    PurchaseMode public purchaseMode;
    
    // --- Pricing/toggles ---
    uint256 public publicPriceWei;       // 0 = no public price set
    bytes32 public publicPriceCommitment; // Optional Pedersen-style commitment to the public price
    bool public commitmentFrozen;        // Commitment immutability flag (frozen after first set)
    bool public publicEnabled = true;    // both on by default
    bool public privateEnabled = true;
    
    // --- Lightweight kill-switch ---
    bool private stopped;
    
    // Ô£à Admin functions to enable/disable purchase modes
    function setPublicEnabled(bool _enabled) external onlySeller {
        publicEnabled = _enabled;
        emit PublicEnabledSet(id, _enabled);
    }
    
    function setPrivateEnabled(bool _enabled) external onlySeller {
        privateEnabled = _enabled;
        emit PrivateEnabledSet(id, _enabled);
    }
    
    // Mappings and arrays
    mapping(address => uint) public securityDeposits; // Track each transporter's deposit
    mapping(address => uint) public transporters; // Store transporter fees
    mapping(address => bool) public isTransporter; // Membership mapping for transporters
    address[] public transporterAddresses; // Store all transporter addresses
    
    // Initialization guard
    bool private _initialized;
    
    // Factory access control (immutable after initialization)
    address public factory;
    
    modifier onlyFactory() {
        if (msg.sender != factory && factory != address(0)) revert NotFactory();
        _;
    }
    

    
    modifier whenNotStopped() {
        require(!stopped, "stopped");
        _;
    }
    
    // Cap on number of transporter bids to prevent DoS and high gas
    function maxBids() internal view virtual returns (uint8) {
        return MAX_BIDS;
    }
    
    function pauseByFactory() external {
        if (msg.sender != factory) revert NotFactory();
        stopped = true;
    }
    
    // Explicit getter for stopped state (UI probes this)
    function isStopped() external view returns (bool) { 
        return stopped; 
    }
    
    // Canonical commitment computation helper (pure function for tests and UI)
    function computeCommitment(uint256 value, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(value, salt));
    }
    
    // Railgun Integration State
    mapping(bytes32 => bool) public privatePayments; // Track recorded private payments by memoHash
    mapping(uint256 => bytes32) public productMemoHashes; // Link productId to memoHash
    mapping(uint256 => bytes32) public productRailgunTxRefs; // Link productId to Railgun tx reference
    mapping(bytes32 => bool) public usedMemoHash; // Global reuse guard for memos
    mapping(uint256 => address) public productPaidBy; // Track who recorded the payment (for audit)

    // Confidential value commitment and proof (Pedersen + Bulletproofs)
    bytes32 public valueCommitment;
    bytes public valueRangeProof;
    event ValueCommitted(bytes32 commitment, bytes proof);

    modifier onlyBuyer() {
        if (msg.sender != buyer) revert NotBuyer();
        _;
    }

    modifier onlySeller() {
        if (msg.sender != owner) revert NotSeller();
        _;
    }

    modifier transporterSet() {
        if (transporter == address(0)) revert TransporterNotSet();
        _;
    }

    modifier onlyTransporter() {
        if (msg.sender != transporter) revert NotTransporter();
        _;
    }

    event OrderConfirmed(address indexed buyer, address indexed seller, uint256 indexed productId, bytes32 priceCommitment, string vcCID, uint256 timestamp);
    event PurchaseConfirmedWithCommitment(uint256 indexed productId, bytes32 indexed purchaseTxHashCommitment, address indexed buyer, string vcCID, uint256 timestamp);
    event TransporterCreated(address indexed transporter, uint256 indexed productId, uint256 timestamp);
    event TransporterSecurityDeposit(address indexed transporter, uint256 indexed productId, uint256 timestamp);
    event DeliveryConfirmed(address indexed buyer, address indexed transporter, address indexed seller, uint256 productId, bytes32 priceCommitment, string vcCID, uint256 timestamp);
    event DeliveryConfirmedWithCommitment(uint256 indexed productId, bytes32 indexed txHashCommitment, address indexed buyer, string vcCID, uint256 timestamp);
    event VcUpdated(uint256 indexed productId, string cid, address indexed seller, uint256 timestamp);
    event ValueRevealed(uint256 indexed productId, bytes32 commitment, bool valid, uint256 timestamp);
    event FundsTransferred(address indexed to, uint256 indexed productId, uint256 timestamp);
    event PenaltyApplied(address indexed to, uint256 indexed productId, string reason, uint256 timestamp);
    event DeliveryTimeoutEvent(address indexed caller, uint256 indexed productId, uint time, uint256 timestamp);
    event SellerTimeout(address indexed caller, uint256 indexed productId, uint time, uint256 timestamp);
    event PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, bytes32 ref);
    event BidWithdrawn(address indexed transporter, uint256 indexed productId, uint256 timestamp);
    event TransporterSelected(uint256 indexed productId, address indexed transporter, uint256 timestamp);
    
    // Comprehensive product state change event for frontend indexing
    event PublicEnabledSet(uint256 indexed id, bool enabled);
    event PrivateEnabledSet(uint256 indexed id, bool enabled);
    
    event ProductStateChanged(
        uint256 indexed productId,
        address indexed seller,
        address indexed buyer,
        Phase phase,
        uint256 timestamp,
        bytes32 priceCommitment,
        bool purchased,
        bool delivered
    );
    
    // Railgun Integration Events
    event PaidPrivately(uint256 indexed productId, bytes32 memoHash, bytes32 railgunTxRef, uint256 timestamp);
    event PrivatePaymentRecorded(uint256 indexed productId, bytes32 memoHash, bytes32 railgunTxRef, address indexed recorder, uint256 timestamp);
    
    // --- Public Purchase Events ---
    event PublicPriceSet(uint256 priceWei);
    event PublicPriceCommitmentSet(uint256 indexed id, bytes32 commitment);
    event PurchasedPublic(address indexed buyer);
    event PurchasedPrivate(address indexed buyer, bytes32 memoHash, bytes32 railgunTxRef);

    // Initialize function instead of constructor
    function initialize(
        uint256 _id,
        string memory _name,
        bytes32 _priceCommitment,
        address _owner,
        uint256 _productPrice,
        address _factory
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (_owner == address(0)) revert InvalidOwnerAddress();
        if (bytes(_name).length == 0) revert EmptyName();
        if (_priceCommitment == bytes32(0)) revert ZeroPriceCommitment();
        if (_id == 0) revert InvalidProductId();
        if (msg.sender != _factory) revert NotFactory(); // Ô£à Only factory can initialize
        
        _initialized = true;
        
        // Bind to factory (immutable after initialization)
        factory = _factory;
        
        id = _id;
        name = _name;
        priceCommitment = _priceCommitment;
        productPrice = _productPrice; // Ô£à Set the price during initialization
        owner = payable(_owner);
        purchased = false;
        buyer = payable(address(0));
        phase = Phase.Listed;
        
        // Ô£à Explicitly enable both purchase modes during initialization
        publicEnabled = true;
        privateEnabled = true;
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
        
        // Emit PhaseChanged event for initialization
        emit PhaseChanged(id, Phase.Listed, Phase.Listed, msg.sender, block.timestamp, bytes32(0));
    }

    // Seller sets a public price (add)
    function setPublicPrice(uint256 priceWei) external onlySeller whenNotStopped {
        if (phase != Phase.Listed) revert WrongPhase();
        if (publicPriceWei != 0) revert("Already set");
        if (priceWei == 0) revert("Zero price");
        
        publicPriceWei = priceWei;
        publicEnabled = (priceWei > 0); // Ô£à Auto-enable when price is set
        emit PublicPriceSet(priceWei);
    }

    /// @notice Set the public price together with its Pedersen commitment.
    /// @dev The commitment is frozen after first set to ensure immutability.
    /// @param priceWei The public price in Wei
    /// @param commitment The Pedersen commitment (bytes32) to the price
    function setPublicPriceWithCommitment(uint256 priceWei, bytes32 commitment) external onlySeller whenNotStopped {
        if (phase != Phase.Listed) revert WrongPhase();
        if (commitmentFrozen) revert CommitmentFrozen(); // Explicit immutability check
        if (publicPriceWei != 0) revert("Already set"); // Defense in depth
        if (priceWei == 0) revert("Zero price");
        if (commitment == bytes32(0)) revert ZeroPriceCommitment();

        publicPriceWei = priceWei;
        publicPriceCommitment = commitment; // Pedersen commitment (Ristretto point) for ZKP verification
        publicEnabled = (priceWei > 0);
        commitmentFrozen = true; // Freeze immediately after setting
        
        // Ô£à Also update priceCommitment for revealAndConfirmDelivery compatibility
        // Compute deterministic blinding factor: keccak256(productAddress, sellerAddress)
        bytes32 deterministicBlinding = keccak256(abi.encodePacked(address(this), owner));
        // Compute keccak256 commitment: keccak256(priceWei, deterministicBlinding)
        priceCommitment = keccak256(abi.encodePacked(priceWei, deterministicBlinding));

        emit PublicPriceSet(priceWei);
        emit PublicPriceCommitmentSet(id, commitment);
    }
    
    // Simple order confirmation function (from working version)
    function confirmOrder(string memory vcCID) public onlySeller nonReentrant whenNotStopped {
        confirmOrderWithCommitment(vcCID, bytes32(0));
    }

    /// @notice Confirm order with optional purchase TX hash commitment for transaction verification
    /// @dev This allows the seller to include purchase TX hash commitment when confirming order
    /// @param vcCID The VC CID to store on-chain
    /// @param purchaseTxHashCommitment Optional purchase TX hash commitment for transaction verification (bytes32(0) if not provided)
    function confirmOrderWithCommitment(string memory vcCID, bytes32 purchaseTxHashCommitment) public onlySeller nonReentrant whenNotStopped {
        if (phase != Phase.Purchased) revert WrongPhase();
        if (!purchased) revert NotPurchased();
        
        orderConfirmedTimestamp = uint64(block.timestamp);
        phase = Phase.OrderConfirmed;
        
        vcCid = vcCID;
        emit VcUpdated(id, vcCID, owner, block.timestamp);
        emit OrderConfirmed(buyer, owner, id, priceCommitment, vcCID, block.timestamp);
        
        // Emit commitment event for purchase transaction verification (Feature 1)
        if (purchaseTxHashCommitment != bytes32(0)) {
            emit PurchaseConfirmedWithCommitment(id, purchaseTxHashCommitment, buyer, vcCID, block.timestamp);
        }
    }

    function updateVcCid(string memory cid) public nonReentrant {
        _updateVcCid(cid);
    }

    function _updateVcCid(string memory cid) internal onlySeller {
        vcCid = cid;
        emit VcUpdated(id, cid, owner, block.timestamp);
    }

    /// @notice Allow buyer to update VC CID after delivery confirmation (for TX hash commitment)
    /// @dev This allows the buyer to update the CID after revealAndConfirmDelivery to include TX hash commitment
    /// @param cid The new VC CID to store on-chain
    /// @param txHashCommitment Optional TX hash commitment for transaction verification (bytes32(0) if not provided)
    function updateVcCidAfterDelivery(string memory cid, bytes32 txHashCommitment) public nonReentrant {
        if (msg.sender != buyer) revert NotBuyer();
        if (!delivered) revert NotDelivered(); // Must be delivered first
        if (phase != Phase.Delivered) revert WrongPhase(); // Extra safety check
        vcCid = cid;
        emit VcUpdated(id, cid, buyer, block.timestamp);
        
        // Emit commitment event for transaction verification (Feature 1)
        if (txHashCommitment != bytes32(0)) {
            emit DeliveryConfirmedWithCommitment(id, txHashCommitment, buyer, cid, block.timestamp);
        }
    }

    function depositPurchasePrivate(bytes32 _commitment, bytes32 _valueCommitment, bytes calldata _valueRangeProof) public payable nonReentrant {
        _depositPurchase(_commitment, _valueCommitment, _valueRangeProof);
    }

    // Simple public purchase function for non-private transactions (from working version)
    function depositPurchase() public payable nonReentrant {
        if (purchased) revert AlreadyPurchased();
        if (msg.sender == owner) revert OwnerCannotPurchase();
        if (msg.value != productPrice) revert IncorrectFee(); // Ô£à Exact price match
        
        purchased = true;
        buyer = payable(msg.sender);
        purchaseTimestamp = uint64(block.timestamp);
        // productPrice stays the same (don't overwrite the original price)
        
        Phase oldPhase = phase;
        phase = Phase.Purchased;
        
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        // Ô£à Remove OrderConfirmed - that's for seller confirmation, not purchase
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
    }

    // Public purchase entrypoint (add)
    function purchasePublic() external payable nonReentrant whenNotStopped {
        if (msg.sender == owner) revert OwnerCannotPurchase();
        if (purchased) revert AlreadyPurchased();
        if (phase != Phase.Listed) revert WrongPhase();
        if (!publicEnabled) revert PublicDisabled();
        if (publicPriceWei == 0) revert PublicPriceNotSet();
        if (msg.value != publicPriceWei) revert IncorrectFee();

        buyer = payable(msg.sender);
        purchaseMode = PurchaseMode.Public;
        purchased = true;
        purchaseTimestamp = uint64(block.timestamp);
        productPrice = msg.value; // Ô£à Escrow the actual ETH received

        Phase oldPhase = phase;
        phase = Phase.Purchased;

        emit PurchasedPublic(buyer);
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        // Ô£à Remove OrderConfirmed - that's for seller confirmation, not purchase
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
    }

    function _depositPurchase(bytes32 _commitment, bytes32 _valueCommitment, bytes calldata _valueRangeProof) internal {
        if (purchased) revert AlreadyPurchased();
        if (msg.sender == owner) revert OwnerCannotPurchase();
        if (msg.value != productPrice) revert IncorrectFee(); // Ô£à Check exact price match
        
        purchased = true;
        buyer = payable(msg.sender);
        purchaseTimestamp = uint64(block.timestamp);
        // productPrice stays the same (don't overwrite the original price)
        // Set purchaseMode based on whether ETH was sent
        purchaseMode = (msg.value > 0) ? PurchaseMode.Public : PurchaseMode.Private;
        Phase oldPhase = phase;
        phase = Phase.Purchased;
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, _commitment);
        priceCommitment = _commitment;
        valueCommitment = _valueCommitment;
        valueRangeProof = _valueRangeProof;
        emit ValueCommitted(_valueCommitment, _valueRangeProof);
        // Ô£à Remove OrderConfirmed - that's for seller confirmation, not purchase
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
    }

    function setTransporter(address payable _transporter) external payable onlySeller nonReentrant {
        if (phase != Phase.OrderConfirmed) revert WrongPhase();
        if (block.timestamp > orderConfirmedTimestamp + BID_WINDOW) revert BiddingWindowNotExpired();
        if (!isTransporter[_transporter]) revert NotATransporter();
        
        // Verify the delivery fee matches what was bid
        if (msg.value != transporters[_transporter]) revert IncorrectDeliveryFee();
        
        deliveryFee = msg.value; // Use the actual ETH sent
        transporter = _transporter;
        
        Phase oldPhase = phase;
        phase = Phase.Bound;
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        emit TransporterSelected(id, _transporter, block.timestamp);
    }

    function createTransporter(uint _feeInWei) public nonReentrant {
        _createTransporter(_feeInWei);
    }

    function _createTransporter(uint _feeInWei) internal {
        if (transporterCount >= MAX_BIDS) revert BidCapReached();
        if (transporters[msg.sender] != 0) revert AlreadyExists();
        transporters[msg.sender] = _feeInWei;
        isTransporter[msg.sender] = true;
        transporterAddresses.push(msg.sender);
        
        // Use unchecked for safe increment
        unchecked {
            transporterCount++;
        }
        
        emit TransporterCreated(msg.sender, id, block.timestamp);
        // No phase change here
    }

    function securityDeposit() public payable nonReentrant {
        _securityDeposit();
    }

    function _securityDeposit() internal {
        if (!isTransporter[msg.sender]) revert NotRegistered();
        securityDeposits[msg.sender] += msg.value;
        emit TransporterSecurityDeposit(msg.sender, id, block.timestamp);
        // No phase change here
    }

    // View function to return all transporter addresses and their fees
    // Optimized to avoid unbounded loops in write operations
    function getAllTransporters() public view returns (address[] memory, uint[] memory) {
        uint len = transporterAddresses.length;
        address[] memory addresses = new address[](len);
        uint[] memory fees = new uint[](len);
        
        // Use unchecked for safe loop operations
        unchecked {
            for (uint i = 0; i < len; i++) {
                addresses[i] = transporterAddresses[i];
                fees[i] = transporters[transporterAddresses[i]];
            }
        }
        
        return (addresses, fees);
    }

    function verifyRevealedValue(uint revealedValue, bytes32 blinding) public nonReentrant returns (bool) {
        return _verifyRevealedValue(revealedValue, blinding);
    }

    function _verifyRevealedValue(uint revealedValue, bytes32 blinding) internal returns (bool) {
        bytes32 computed = keccak256(abi.encodePacked(revealedValue, blinding));
        bool valid = (computed == priceCommitment);
        emit ValueRevealed(id, priceCommitment, valid, block.timestamp);
        return valid;
        // No phase change here
    }

    function revealAndConfirmDelivery(uint revealedValue, bytes32 blinding, string memory vcCID) public nonReentrant {
        _revealAndConfirmDelivery(revealedValue, blinding, vcCID);
    }

    function _revealAndConfirmDelivery(uint revealedValue, bytes32 blinding, string memory vcCID) internal {
        if (msg.sender != buyer) revert NotBuyer();
        if (transporter == address(0)) revert TransporterNotSet();
        
        // Ô£à Verify the revealed value matches the commitment
        bytes32 computed = computeCommitment(revealedValue, blinding);
        bool valid;
        
        // Ô£à For public purchases with publicPriceCommitment set
        if (publicPriceCommitment != bytes32(0)) {
            // Verify the revealed value matches the public price
            if (revealedValue != publicPriceWei) revert RevealInvalid();
            
            // Check if priceCommitment was updated (new products) or needs to be computed (old products)
            bytes32 expectedBlinding = keccak256(abi.encodePacked(address(this), owner));
            if (blinding == expectedBlinding) {
                // For new products: priceCommitment was updated in setPublicPriceWithCommitment
                valid = (computed == priceCommitment);
            } else {
                // For old products: compute the expected commitment on-the-fly
                bytes32 expectedCommitment = keccak256(abi.encodePacked(revealedValue, expectedBlinding));
                valid = (computed == expectedCommitment);
            }
        } else {
            // Legacy/private purchases: check against priceCommitment
            valid = (computed == priceCommitment);
        }
        
        if (!valid) revert RevealInvalid();
        _confirmDelivery(vcCID);
    }

    function _confirmDelivery(string memory vcCID) internal {
        if (delivered) revert AlreadyDelivered();
        if (block.timestamp > orderConfirmedTimestamp + DELIVERY_WINDOW) revert DeliveryTimeout();
        delivered = true;
        Phase oldPhase = phase;
        phase = Phase.Delivered;

        // cache for events
        bytes32 memoHash = productMemoHashes[id];
        bytes32 railgunTx = productRailgunTxRefs[id];

        if (purchaseMode == PurchaseMode.Private) {
            // No ETH moves ÔÇö settlement was private.
            // If you didn't emit this in recordPrivatePayment(), you can emit it here:
            if (memoHash != bytes32(0)) {
                emit PaidPrivately(id, memoHash, railgunTx, block.timestamp);
            }
            // value=0, ref=memo (optional convention)
            emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, memoHash);

        } else if (purchaseMode == PurchaseMode.Public) {
            uint256 sellerAmount = productPrice; // Ô£à Use escrowed amount, not posted price
            if (sellerAmount == 0) revert PriceZero();

            // compute transporter payout
            uint256 transporterAmount = deliveryFee + securityDeposits[transporter];

            // --- Effects first ---
            productPrice = 0; // Ô£à Zero escrowed funds before transfers
            securityDeposits[transporter] = 0;
            deliveryFee = 0;

            // --- Interactions ---
            (bool sentSeller, ) = owner.call{value: sellerAmount}("");
            if (!sentSeller) revert TransferFailed(owner, sellerAmount);

            if (transporter != address(0) && transporterAmount > 0) {
                (bool sentTransporter, ) = transporter.call{value: transporterAmount}("");
                if (!sentTransporter) revert TransferFailed(transporter, transporterAmount);
            }

            emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));

        } else {
            revert InvalidPurchaseMode(); // add a small custom error
        }

        // update VC anchor with latest CID
        vcCid = vcCID;
        emit VcUpdated(id, vcCID, owner, block.timestamp);
        emit DeliveryConfirmed(buyer, transporter, owner, id, priceCommitment, vcCID, block.timestamp);
    }

    function timeout() public nonReentrant whenNotStopped {
        _timeout();
    }

    function _timeout() internal {
        if (delivered) revert AlreadyDelivered();
        if (block.timestamp <= orderConfirmedTimestamp + DELIVERY_WINDOW) revert NotYetTimeout();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        
        if (purchaseMode == PurchaseMode.Public) {
            // Use unchecked for safe arithmetic operations
            unchecked {
                uint lateDays = (block.timestamp - (orderConfirmedTimestamp + DELIVERY_WINDOW)) / 1 days + 1;
                if (lateDays > 10) lateDays = 10;
                uint penalty = (securityDeposits[transporter] * 10 * lateDays) / 100;
                if (penalty > securityDeposits[transporter]) penalty = securityDeposits[transporter];
                
                uint refundToBuyer = productPrice + penalty; // Ô£à Use escrowed amount
                productPrice = 0; // Ô£à Zero before transfer
                (bool sentBuyer, ) = buyer.call{value: refundToBuyer}("");
                if (!sentBuyer) revert BuyerRefundFailed();
                emit FundsTransferred(buyer, id, block.timestamp);
                
                if (penalty > 0) {
                    (bool sentPenalty, ) = buyer.call{value: penalty}("");
                    if (!sentPenalty) revert TransferFailed(buyer, penalty);
                    emit PenaltyApplied(transporter, id, "Late delivery", block.timestamp);
                }
            }
        }
        // Private mode: no ETH to refund
        
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        emit DeliveryTimeoutEvent(msg.sender, id, block.timestamp, block.timestamp);
    }

    function sellerTimeout() public nonReentrant whenNotStopped {
        _sellerTimeout();
    }

    function _sellerTimeout() internal {
        if (delivered) revert AlreadyDelivered();
        if (phase != Phase.Purchased) revert WrongPhase();
        if (block.timestamp <= purchaseTimestamp + SELLER_WINDOW) revert SellerWindowNotExpired();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        
        if (purchaseMode == PurchaseMode.Public) {
            uint256 refundAmount = productPrice; // Ô£à Use escrowed amount
            if (refundAmount > 0) {
                productPrice = 0; // Ô£à Zero before transfer
                (bool sentBuyer, ) = buyer.call{value: refundAmount}("");
                if (!sentBuyer) revert BuyerRefundFailed();
                emit FundsTransferred(buyer, id, block.timestamp);
            }
        }
        // Private mode: no ETH to refund
        
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        emit SellerTimeout(msg.sender, id, block.timestamp, block.timestamp);
    }

    function bidTimeout() public nonReentrant whenNotStopped {
        _bidTimeout();
    }

    function _bidTimeout() internal {
        if (phase != Phase.OrderConfirmed) revert WrongPhase();
        if (block.timestamp <= orderConfirmedTimestamp + BID_WINDOW) revert BiddingWindowNotExpired();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        
        if (purchaseMode == PurchaseMode.Public) {
            uint256 refundAmount = productPrice; // Ô£à Use escrowed amount
            if (refundAmount > 0) {
                productPrice = 0; // Ô£à Zero before transfer
                (bool sentBuyer, ) = buyer.call{value: refundAmount}("");
                if (!sentBuyer) revert BuyerRefundFailed();
                emit FundsTransferred(buyer, id, block.timestamp);
            }
        }
        // Private mode: no ETH to refund
        
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
    }

    function withdrawBid() public nonReentrant {
        _withdrawBid();
    }

    function _withdrawBid() internal {
        if (phase != Phase.OrderConfirmed) revert WrongPhase();
        if (transporter == msg.sender) revert AlreadySelected();
        uint fee = transporters[msg.sender];
        uint deposit = securityDeposits[msg.sender];
        if (fee == 0 && deposit == 0) revert NotRegistered();
        
        transporters[msg.sender] = 0;
        securityDeposits[msg.sender] = 0;
        isTransporter[msg.sender] = false;
        
        // Use unchecked for safe decrement
        unchecked {
            transporterCount--;
        }
        
        uint refundAmount = deposit;
        if (refundAmount > 0) {
            (bool sent, ) = payable(msg.sender).call{value: refundAmount}("");
            if (!sent) revert RefundFailed();
            emit FundsTransferred(msg.sender, id, block.timestamp);
        }
        emit BidWithdrawn(msg.sender, id, block.timestamp);
        // No phase change here
    }
    
    function recordPrivatePayment(uint256 _productId, bytes32 _memoHash, bytes32 _railgunTxRef) external nonReentrant whenNotStopped {
        _recordPrivatePayment(_productId, _memoHash, _railgunTxRef);
    }
    
    function _recordPrivatePayment(uint256 _productId, bytes32 _memoHash, bytes32 _railgunTxRef) internal {
        if (_productId != id) revert WrongProductId();
        if (_memoHash == bytes32(0)) revert ZeroMemoHash();
        if (_railgunTxRef == bytes32(0)) revert ZeroTxRef();
        
        if (phase != Phase.Listed) revert AlreadyPurchased();
        if (!privateEnabled) revert PrivateDisabled();
        
        if (productMemoHashes[id] != bytes32(0)) revert AlreadyPaid();
        if (usedMemoHash[_memoHash]) revert MemoAlreadyUsed();
        if (privatePayments[_memoHash]) revert PaymentAlreadyRecorded();
        
        // If buyer already set, only that buyer or owner can record
        // If buyer not set (address(0)), allow anyone to become buyer via private payment
        if (buyer != address(0) && msg.sender != buyer && msg.sender != owner) revert NotParticipant();
        
        buyer = payable(msg.sender);
        purchaseMode = PurchaseMode.Private;
        purchased = true;
        purchaseTimestamp = uint64(block.timestamp);
        
        privatePayments[_memoHash] = true;
        usedMemoHash[_memoHash] = true;
        productMemoHashes[id] = _memoHash;
        productRailgunTxRefs[id] = _railgunTxRef;
        productPaidBy[id] = msg.sender;
        
        Phase oldPhase = phase;
        phase = Phase.Purchased;
        
        emit PurchasedPrivate(buyer, _memoHash, _railgunTxRef);
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, _memoHash);
        // Ô£à Remove OrderConfirmed - that's for seller confirmation, not purchase
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
        
        emit PrivatePaymentRecorded(id, _memoHash, _railgunTxRef, msg.sender, block.timestamp);
    }
    

    // Explicitly reject unexpected ETH
    receive() external payable {
        revert("ProductEscrow does not accept unexpected ETH");
    }

    fallback() external payable {
        revert("ProductEscrow does not accept unexpected ETH");
    }
}

// File: contracts\ProductFactory.sol

// Interface for calling ProductEscrow functions without casting issues
interface IProductEscrowOwner {
    function owner() external view returns (address payable);
}

// Standardized custom errors for gas efficiency and consistency
error InvalidImplementationAddress();
error FactoryIsPaused();

contract ProductFactory is Ownable {
    using Clones for address;

    event ProductCreated(address indexed product, address indexed seller, uint256 indexed productId, bytes32 priceCommitment, uint256 price);
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    event FactoryPaused(address indexed by);
    event FactoryUnpaused(address indexed by);

    // Packed storage for gas optimization
    address public implementation;
    uint256 public productCount;
    bool public isPaused; // Lightweight pause mechanism (factory-level only)
    
    // Paged getter for dev convenience (optional, not main indexing)
    address[] public products;

    constructor(address _impl) Ownable(msg.sender) {
        if (_impl == address(0)) revert InvalidImplementationAddress();
        implementation = _impl;
        emit ImplementationUpdated(address(0), _impl);
    }

    modifier whenNotPaused() {
        if (isPaused) revert FactoryIsPaused();
        _;
    }

    // Alias for the suggested function name
    function setImplementation(address _impl) external onlyOwner {
        if (_impl == address(0)) revert InvalidImplementationAddress();
        address oldImpl = implementation;
        implementation = _impl;
        emit ImplementationUpdated(oldImpl, _impl);
    }

    function pause() external onlyOwner {
        isPaused = true;
        emit FactoryPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        isPaused = false;
        emit FactoryUnpaused(msg.sender);
    }

    function createProduct(string memory name, bytes32 priceCommitment, uint256 price) 
        external 
        whenNotPaused 
        returns (address product) 
    {
        product = implementation.clone();
        
        // Use unchecked for safe increment
        unchecked {
            productCount++;
        }
        
        // Initialize the clone
        ProductEscrow_Initializer(payable(product)).initialize(
            productCount, 
            name, 
            priceCommitment, 
            msg.sender,
            price, // Ô£à Pass the actual price instead of 0
            address(this) // Ô£à Pass factory address for security
        );

        // Store for optional paged access (dev convenience)
        products.push(product);
        
        emit ProductCreated(product, msg.sender, productCount, priceCommitment, price);
    }

    function createProductDeterministic(
        string memory name, 
        bytes32 priceCommitment, 
        uint256 price,
        bytes32 salt
    ) 
        external 
        whenNotPaused 
        returns (address product) 
    {
        product = implementation.cloneDeterministic(salt);
        
        // Use unchecked for safe increment
        unchecked {
            productCount++;
        }
        
        // Initialize the clone
        ProductEscrow_Initializer(payable(product)).initialize(
            productCount, 
            name, 
            priceCommitment, 
            msg.sender,
            price, // Ô£à Pass the actual price instead of 0
            address(this) // Ô£à Pass factory address for security
        );

        // Store for optional paged access (dev convenience)
        products.push(product);
        
        emit ProductCreated(product, msg.sender, productCount, priceCommitment, price);
    }

    function predictProductAddress(bytes32 salt) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    // Optional paged getter for dev convenience (not main indexing)
    // Optimized to avoid unbounded loops in write operations
    function getProductsRange(uint256 start, uint256 count) public view returns (address[] memory) {
        require(start < products.length, "Start index out of bounds");
        uint256 end = start + count;
        if (end > products.length) {
            end = products.length;
        }
        
        uint256 resultLength = end - start;
        address[] memory result = new address[](resultLength);
        
        // Use unchecked for safe loop operations
        unchecked {
            for (uint256 i = start; i < end; i++) {
                result[i - start] = products[i];
            }
        }
        
        return result;
    }

    // Gas-efficient getter for total products (alternative to array.length)
    function getProductCount() public view returns (uint256) {
        return productCount;
    }

    // Gas-efficient getter for all products (alternative to array access)
    function getProducts() public view returns (address[] memory) {
        return products;
    }

    // Get products by seller (fixed implementation)
    function getProductsBySeller(address _seller) public view returns (address[] memory) {
        uint256 count = 0;
        
        // First pass: count products by this seller
        for (uint256 i = 0; i < products.length; i++) {
            try IProductEscrowOwner(products[i]).owner() returns (address payable owner) {
                if (owner == _seller) {
                    count++;
                }
            } catch {
                // Skip if product is not properly initialized
                continue;
            }
        }
        
        // Second pass: collect product addresses
        address[] memory sellerProducts = new address[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < products.length; i++) {
            try IProductEscrowOwner(products[i]).owner() returns (address payable owner) {
                if (owner == _seller && index < count) {
                    sellerProducts[index] = products[i]; // Fixed: store product address, not seller address
                    index++;
                }
            } catch {
                // Skip if product is not properly initialized
                continue;
            }
        }
        
        return sellerProducts;
    }



    // Explicitly reject unexpected ETH
    receive() external payable {
        revert("Factory does not accept ETH");
    }

    fallback() external payable {
        revert("Factory does not accept ETH");
    }
}

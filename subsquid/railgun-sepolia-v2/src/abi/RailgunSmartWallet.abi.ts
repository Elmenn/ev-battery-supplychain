export const ABI_JSON = [
    {
        "type": "event",
        "anonymous": false,
        "name": "AddToBlocklist",
        "inputs": [
            {
                "type": "address",
                "name": "token",
                "indexed": true
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "FeeChange",
        "inputs": [
            {
                "type": "uint256",
                "name": "shieldFee",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "unshieldFee",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "nftFee",
                "indexed": false
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "Initialized",
        "inputs": [
            {
                "type": "uint8",
                "name": "version",
                "indexed": false
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "Nullified",
        "inputs": [
            {
                "type": "uint16",
                "name": "treeNumber",
                "indexed": false
            },
            {
                "type": "bytes32[]",
                "name": "nullifier"
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "OwnershipTransferred",
        "inputs": [
            {
                "type": "address",
                "name": "previousOwner",
                "indexed": true
            },
            {
                "type": "address",
                "name": "newOwner",
                "indexed": true
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "RemoveFromBlocklist",
        "inputs": [
            {
                "type": "address",
                "name": "token",
                "indexed": true
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "Shield",
        "inputs": [
            {
                "type": "uint256",
                "name": "treeNumber",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "startPosition",
                "indexed": false
            },
            {
                "type": "tuple[]",
                "name": "commitments",
                "components": [
                    {
                        "type": "bytes32",
                        "name": "npk"
                    },
                    {
                        "type": "tuple",
                        "name": "token",
                        "components": [
                            {
                                "type": "uint8",
                                "name": "tokenType"
                            },
                            {
                                "type": "address",
                                "name": "tokenAddress"
                            },
                            {
                                "type": "uint256",
                                "name": "tokenSubID"
                            }
                        ]
                    },
                    {
                        "type": "uint120",
                        "name": "value"
                    }
                ]
            },
            {
                "type": "tuple[]",
                "name": "shieldCiphertext",
                "components": [
                    {
                        "type": "bytes32[3]",
                        "name": "encryptedBundle"
                    },
                    {
                        "type": "bytes32",
                        "name": "shieldKey"
                    }
                ]
            },
            {
                "type": "uint256[]",
                "name": "fees"
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "Transact",
        "inputs": [
            {
                "type": "uint256",
                "name": "treeNumber",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "startPosition",
                "indexed": false
            },
            {
                "type": "bytes32[]",
                "name": "hash"
            },
            {
                "type": "tuple[]",
                "name": "ciphertext",
                "components": [
                    {
                        "type": "bytes32[4]",
                        "name": "ciphertext"
                    },
                    {
                        "type": "bytes32",
                        "name": "blindedSenderViewingKey"
                    },
                    {
                        "type": "bytes32",
                        "name": "blindedReceiverViewingKey"
                    },
                    {
                        "type": "bytes",
                        "name": "annotationData"
                    },
                    {
                        "type": "bytes",
                        "name": "memo"
                    }
                ]
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "TreasuryChange",
        "inputs": [
            {
                "type": "address",
                "name": "treasury",
                "indexed": false
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "Unshield",
        "inputs": [
            {
                "type": "address",
                "name": "to",
                "indexed": false
            },
            {
                "type": "tuple",
                "name": "token",
                "indexed": false,
                "components": [
                    {
                        "type": "uint8",
                        "name": "tokenType"
                    },
                    {
                        "type": "address",
                        "name": "tokenAddress"
                    },
                    {
                        "type": "uint256",
                        "name": "tokenSubID"
                    }
                ]
            },
            {
                "type": "uint256",
                "name": "amount",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "fee",
                "indexed": false
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "VerifyingKeySet",
        "inputs": [
            {
                "type": "uint256",
                "name": "nullifiers",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "commitments",
                "indexed": false
            },
            {
                "type": "tuple",
                "name": "verifyingKey",
                "indexed": false,
                "components": [
                    {
                        "type": "string",
                        "name": "artifactsIPFSHash"
                    },
                    {
                        "type": "tuple",
                        "name": "alpha1",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "beta2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "gamma2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "delta2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple[]",
                        "name": "ic",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    }
                ]
            }
        ]
    },
    {
        "type": "function",
        "name": "ZERO_VALUE",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "bytes32",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "addToBlocklist",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "address[]",
                "name": "_tokens"
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "addVector",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": "vector"
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "changeFee",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "uint120",
                "name": "_shieldFee"
            },
            {
                "type": "uint120",
                "name": "_unshieldFee"
            },
            {
                "type": "uint256",
                "name": "_nftFee"
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "changeTreasury",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "address",
                "name": "_treasury"
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "checkSafetyVectors",
        "constant": false,
        "payable": false,
        "inputs": [],
        "outputs": []
    },
    {
        "type": "function",
        "name": "getFee",
        "constant": true,
        "stateMutability": "pure",
        "payable": false,
        "inputs": [
            {
                "type": "uint136",
                "name": "_amount"
            },
            {
                "type": "bool",
                "name": "_isInclusive"
            },
            {
                "type": "uint120",
                "name": "_feeBP"
            }
        ],
        "outputs": [
            {
                "type": "uint120",
                "name": ""
            },
            {
                "type": "uint120",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "getInsertionTreeNumberAndStartingIndex",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": "_newCommitments"
            }
        ],
        "outputs": [
            {
                "type": "uint256",
                "name": ""
            },
            {
                "type": "uint256",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "getTokenID",
        "constant": true,
        "stateMutability": "pure",
        "payable": false,
        "inputs": [
            {
                "type": "tuple",
                "name": "_tokenData",
                "components": [
                    {
                        "type": "uint8",
                        "name": "tokenType"
                    },
                    {
                        "type": "address",
                        "name": "tokenAddress"
                    },
                    {
                        "type": "uint256",
                        "name": "tokenSubID"
                    }
                ]
            }
        ],
        "outputs": [
            {
                "type": "bytes32",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "getVerificationKey",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": "_nullifiers"
            },
            {
                "type": "uint256",
                "name": "_commitments"
            }
        ],
        "outputs": [
            {
                "type": "tuple",
                "name": "",
                "components": [
                    {
                        "type": "string",
                        "name": "artifactsIPFSHash"
                    },
                    {
                        "type": "tuple",
                        "name": "alpha1",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "beta2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "gamma2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "delta2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple[]",
                        "name": "ic",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    }
                ]
            }
        ]
    },
    {
        "type": "function",
        "name": "hashBoundParams",
        "constant": true,
        "stateMutability": "pure",
        "payable": false,
        "inputs": [
            {
                "type": "tuple",
                "name": "_boundParams",
                "components": [
                    {
                        "type": "uint16",
                        "name": "treeNumber"
                    },
                    {
                        "type": "uint72",
                        "name": "minGasPrice"
                    },
                    {
                        "type": "uint8",
                        "name": "unshield"
                    },
                    {
                        "type": "uint64",
                        "name": "chainID"
                    },
                    {
                        "type": "address",
                        "name": "adaptContract"
                    },
                    {
                        "type": "bytes32",
                        "name": "adaptParams"
                    },
                    {
                        "type": "tuple[]",
                        "name": "commitmentCiphertext",
                        "components": [
                            {
                                "type": "bytes32[4]",
                                "name": "ciphertext"
                            },
                            {
                                "type": "bytes32",
                                "name": "blindedSenderViewingKey"
                            },
                            {
                                "type": "bytes32",
                                "name": "blindedReceiverViewingKey"
                            },
                            {
                                "type": "bytes",
                                "name": "annotationData"
                            },
                            {
                                "type": "bytes",
                                "name": "memo"
                            }
                        ]
                    }
                ]
            }
        ],
        "outputs": [
            {
                "type": "uint256",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "hashCommitment",
        "constant": true,
        "stateMutability": "pure",
        "payable": false,
        "inputs": [
            {
                "type": "tuple",
                "name": "_commitmentPreimage",
                "components": [
                    {
                        "type": "bytes32",
                        "name": "npk"
                    },
                    {
                        "type": "tuple",
                        "name": "token",
                        "components": [
                            {
                                "type": "uint8",
                                "name": "tokenType"
                            },
                            {
                                "type": "address",
                                "name": "tokenAddress"
                            },
                            {
                                "type": "uint256",
                                "name": "tokenSubID"
                            }
                        ]
                    },
                    {
                        "type": "uint120",
                        "name": "value"
                    }
                ]
            }
        ],
        "outputs": [
            {
                "type": "bytes32",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "hashLeftRight",
        "constant": true,
        "stateMutability": "pure",
        "payable": false,
        "inputs": [
            {
                "type": "bytes32",
                "name": "_left"
            },
            {
                "type": "bytes32",
                "name": "_right"
            }
        ],
        "outputs": [
            {
                "type": "bytes32",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "initializeRailgunLogic",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "address",
                "name": "_treasury"
            },
            {
                "type": "uint120",
                "name": "_shieldFee"
            },
            {
                "type": "uint120",
                "name": "_unshieldFee"
            },
            {
                "type": "uint256",
                "name": "_nftFee"
            },
            {
                "type": "address",
                "name": "_owner"
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "lastEventBlock",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "uint256",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "merkleRoot",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "bytes32",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "nextLeafIndex",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "uint256",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "nftFee",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "uint256",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "nullifiers",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": ""
            },
            {
                "type": "bytes32",
                "name": ""
            }
        ],
        "outputs": [
            {
                "type": "bool",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "owner",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "address",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "removeFromBlocklist",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "address[]",
                "name": "_tokens"
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "removeVector",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": "vector"
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "renounceOwnership",
        "constant": false,
        "payable": false,
        "inputs": [],
        "outputs": []
    },
    {
        "type": "function",
        "name": "rootHistory",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": ""
            },
            {
                "type": "bytes32",
                "name": ""
            }
        ],
        "outputs": [
            {
                "type": "bool",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "setVerificationKey",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": "_nullifiers"
            },
            {
                "type": "uint256",
                "name": "_commitments"
            },
            {
                "type": "tuple",
                "name": "_verifyingKey",
                "components": [
                    {
                        "type": "string",
                        "name": "artifactsIPFSHash"
                    },
                    {
                        "type": "tuple",
                        "name": "alpha1",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "beta2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "gamma2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "delta2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple[]",
                        "name": "ic",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    }
                ]
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "shield",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "tuple[]",
                "name": "_shieldRequests",
                "components": [
                    {
                        "type": "tuple",
                        "name": "preimage",
                        "components": [
                            {
                                "type": "bytes32",
                                "name": "npk"
                            },
                            {
                                "type": "tuple",
                                "name": "token",
                                "components": [
                                    {
                                        "type": "uint8",
                                        "name": "tokenType"
                                    },
                                    {
                                        "type": "address",
                                        "name": "tokenAddress"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "tokenSubID"
                                    }
                                ]
                            },
                            {
                                "type": "uint120",
                                "name": "value"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "ciphertext",
                        "components": [
                            {
                                "type": "bytes32[3]",
                                "name": "encryptedBundle"
                            },
                            {
                                "type": "bytes32",
                                "name": "shieldKey"
                            }
                        ]
                    }
                ]
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "shieldFee",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "uint120",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "snarkSafetyVector",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": ""
            }
        ],
        "outputs": [
            {
                "type": "bool",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "sumCommitments",
        "constant": true,
        "stateMutability": "pure",
        "payable": false,
        "inputs": [
            {
                "type": "tuple[]",
                "name": "_transactions",
                "components": [
                    {
                        "type": "tuple",
                        "name": "proof",
                        "components": [
                            {
                                "type": "tuple",
                                "name": "a",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "b",
                                "components": [
                                    {
                                        "type": "uint256[2]",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256[2]",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "c",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "bytes32",
                        "name": "merkleRoot"
                    },
                    {
                        "type": "bytes32[]",
                        "name": "nullifiers"
                    },
                    {
                        "type": "bytes32[]",
                        "name": "commitments"
                    },
                    {
                        "type": "tuple",
                        "name": "boundParams",
                        "components": [
                            {
                                "type": "uint16",
                                "name": "treeNumber"
                            },
                            {
                                "type": "uint72",
                                "name": "minGasPrice"
                            },
                            {
                                "type": "uint8",
                                "name": "unshield"
                            },
                            {
                                "type": "uint64",
                                "name": "chainID"
                            },
                            {
                                "type": "address",
                                "name": "adaptContract"
                            },
                            {
                                "type": "bytes32",
                                "name": "adaptParams"
                            },
                            {
                                "type": "tuple[]",
                                "name": "commitmentCiphertext",
                                "components": [
                                    {
                                        "type": "bytes32[4]",
                                        "name": "ciphertext"
                                    },
                                    {
                                        "type": "bytes32",
                                        "name": "blindedSenderViewingKey"
                                    },
                                    {
                                        "type": "bytes32",
                                        "name": "blindedReceiverViewingKey"
                                    },
                                    {
                                        "type": "bytes",
                                        "name": "annotationData"
                                    },
                                    {
                                        "type": "bytes",
                                        "name": "memo"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "unshieldPreimage",
                        "components": [
                            {
                                "type": "bytes32",
                                "name": "npk"
                            },
                            {
                                "type": "tuple",
                                "name": "token",
                                "components": [
                                    {
                                        "type": "uint8",
                                        "name": "tokenType"
                                    },
                                    {
                                        "type": "address",
                                        "name": "tokenAddress"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "tokenSubID"
                                    }
                                ]
                            },
                            {
                                "type": "uint120",
                                "name": "value"
                            }
                        ]
                    }
                ]
            }
        ],
        "outputs": [
            {
                "type": "uint256",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "tokenBlocklist",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "address",
                "name": ""
            }
        ],
        "outputs": [
            {
                "type": "bool",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "tokenIDMapping",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "bytes32",
                "name": ""
            }
        ],
        "outputs": [
            {
                "type": "uint8",
                "name": "tokenType"
            },
            {
                "type": "address",
                "name": "tokenAddress"
            },
            {
                "type": "uint256",
                "name": "tokenSubID"
            }
        ]
    },
    {
        "type": "function",
        "name": "transact",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "tuple[]",
                "name": "_transactions",
                "components": [
                    {
                        "type": "tuple",
                        "name": "proof",
                        "components": [
                            {
                                "type": "tuple",
                                "name": "a",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "b",
                                "components": [
                                    {
                                        "type": "uint256[2]",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256[2]",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "c",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "bytes32",
                        "name": "merkleRoot"
                    },
                    {
                        "type": "bytes32[]",
                        "name": "nullifiers"
                    },
                    {
                        "type": "bytes32[]",
                        "name": "commitments"
                    },
                    {
                        "type": "tuple",
                        "name": "boundParams",
                        "components": [
                            {
                                "type": "uint16",
                                "name": "treeNumber"
                            },
                            {
                                "type": "uint72",
                                "name": "minGasPrice"
                            },
                            {
                                "type": "uint8",
                                "name": "unshield"
                            },
                            {
                                "type": "uint64",
                                "name": "chainID"
                            },
                            {
                                "type": "address",
                                "name": "adaptContract"
                            },
                            {
                                "type": "bytes32",
                                "name": "adaptParams"
                            },
                            {
                                "type": "tuple[]",
                                "name": "commitmentCiphertext",
                                "components": [
                                    {
                                        "type": "bytes32[4]",
                                        "name": "ciphertext"
                                    },
                                    {
                                        "type": "bytes32",
                                        "name": "blindedSenderViewingKey"
                                    },
                                    {
                                        "type": "bytes32",
                                        "name": "blindedReceiverViewingKey"
                                    },
                                    {
                                        "type": "bytes",
                                        "name": "annotationData"
                                    },
                                    {
                                        "type": "bytes",
                                        "name": "memo"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "unshieldPreimage",
                        "components": [
                            {
                                "type": "bytes32",
                                "name": "npk"
                            },
                            {
                                "type": "tuple",
                                "name": "token",
                                "components": [
                                    {
                                        "type": "uint8",
                                        "name": "tokenType"
                                    },
                                    {
                                        "type": "address",
                                        "name": "tokenAddress"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "tokenSubID"
                                    }
                                ]
                            },
                            {
                                "type": "uint120",
                                "name": "value"
                            }
                        ]
                    }
                ]
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "transferOwnership",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "address",
                "name": "newOwner"
            }
        ],
        "outputs": []
    },
    {
        "type": "function",
        "name": "treasury",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "address",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "treeNumber",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "uint256",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "unshieldFee",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [],
        "outputs": [
            {
                "type": "uint120",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "validateCommitmentPreimage",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "tuple",
                "name": "_note",
                "components": [
                    {
                        "type": "bytes32",
                        "name": "npk"
                    },
                    {
                        "type": "tuple",
                        "name": "token",
                        "components": [
                            {
                                "type": "uint8",
                                "name": "tokenType"
                            },
                            {
                                "type": "address",
                                "name": "tokenAddress"
                            },
                            {
                                "type": "uint256",
                                "name": "tokenSubID"
                            }
                        ]
                    },
                    {
                        "type": "uint120",
                        "name": "value"
                    }
                ]
            }
        ],
        "outputs": [
            {
                "type": "bool",
                "name": ""
            },
            {
                "type": "string",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "validateTransaction",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "tuple",
                "name": "_transaction",
                "components": [
                    {
                        "type": "tuple",
                        "name": "proof",
                        "components": [
                            {
                                "type": "tuple",
                                "name": "a",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "b",
                                "components": [
                                    {
                                        "type": "uint256[2]",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256[2]",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "c",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "bytes32",
                        "name": "merkleRoot"
                    },
                    {
                        "type": "bytes32[]",
                        "name": "nullifiers"
                    },
                    {
                        "type": "bytes32[]",
                        "name": "commitments"
                    },
                    {
                        "type": "tuple",
                        "name": "boundParams",
                        "components": [
                            {
                                "type": "uint16",
                                "name": "treeNumber"
                            },
                            {
                                "type": "uint72",
                                "name": "minGasPrice"
                            },
                            {
                                "type": "uint8",
                                "name": "unshield"
                            },
                            {
                                "type": "uint64",
                                "name": "chainID"
                            },
                            {
                                "type": "address",
                                "name": "adaptContract"
                            },
                            {
                                "type": "bytes32",
                                "name": "adaptParams"
                            },
                            {
                                "type": "tuple[]",
                                "name": "commitmentCiphertext",
                                "components": [
                                    {
                                        "type": "bytes32[4]",
                                        "name": "ciphertext"
                                    },
                                    {
                                        "type": "bytes32",
                                        "name": "blindedSenderViewingKey"
                                    },
                                    {
                                        "type": "bytes32",
                                        "name": "blindedReceiverViewingKey"
                                    },
                                    {
                                        "type": "bytes",
                                        "name": "annotationData"
                                    },
                                    {
                                        "type": "bytes",
                                        "name": "memo"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "unshieldPreimage",
                        "components": [
                            {
                                "type": "bytes32",
                                "name": "npk"
                            },
                            {
                                "type": "tuple",
                                "name": "token",
                                "components": [
                                    {
                                        "type": "uint8",
                                        "name": "tokenType"
                                    },
                                    {
                                        "type": "address",
                                        "name": "tokenAddress"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "tokenSubID"
                                    }
                                ]
                            },
                            {
                                "type": "uint120",
                                "name": "value"
                            }
                        ]
                    }
                ]
            }
        ],
        "outputs": [
            {
                "type": "bool",
                "name": ""
            },
            {
                "type": "string",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "verify",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "tuple",
                "name": "_transaction",
                "components": [
                    {
                        "type": "tuple",
                        "name": "proof",
                        "components": [
                            {
                                "type": "tuple",
                                "name": "a",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "b",
                                "components": [
                                    {
                                        "type": "uint256[2]",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256[2]",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "c",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "bytes32",
                        "name": "merkleRoot"
                    },
                    {
                        "type": "bytes32[]",
                        "name": "nullifiers"
                    },
                    {
                        "type": "bytes32[]",
                        "name": "commitments"
                    },
                    {
                        "type": "tuple",
                        "name": "boundParams",
                        "components": [
                            {
                                "type": "uint16",
                                "name": "treeNumber"
                            },
                            {
                                "type": "uint72",
                                "name": "minGasPrice"
                            },
                            {
                                "type": "uint8",
                                "name": "unshield"
                            },
                            {
                                "type": "uint64",
                                "name": "chainID"
                            },
                            {
                                "type": "address",
                                "name": "adaptContract"
                            },
                            {
                                "type": "bytes32",
                                "name": "adaptParams"
                            },
                            {
                                "type": "tuple[]",
                                "name": "commitmentCiphertext",
                                "components": [
                                    {
                                        "type": "bytes32[4]",
                                        "name": "ciphertext"
                                    },
                                    {
                                        "type": "bytes32",
                                        "name": "blindedSenderViewingKey"
                                    },
                                    {
                                        "type": "bytes32",
                                        "name": "blindedReceiverViewingKey"
                                    },
                                    {
                                        "type": "bytes",
                                        "name": "annotationData"
                                    },
                                    {
                                        "type": "bytes",
                                        "name": "memo"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "unshieldPreimage",
                        "components": [
                            {
                                "type": "bytes32",
                                "name": "npk"
                            },
                            {
                                "type": "tuple",
                                "name": "token",
                                "components": [
                                    {
                                        "type": "uint8",
                                        "name": "tokenType"
                                    },
                                    {
                                        "type": "address",
                                        "name": "tokenAddress"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "tokenSubID"
                                    }
                                ]
                            },
                            {
                                "type": "uint120",
                                "name": "value"
                            }
                        ]
                    }
                ]
            }
        ],
        "outputs": [
            {
                "type": "bool",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "verifyProof",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "tuple",
                "name": "_verifyingKey",
                "components": [
                    {
                        "type": "string",
                        "name": "artifactsIPFSHash"
                    },
                    {
                        "type": "tuple",
                        "name": "alpha1",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "beta2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "gamma2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "delta2",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple[]",
                        "name": "ic",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    }
                ]
            },
            {
                "type": "tuple",
                "name": "_proof",
                "components": [
                    {
                        "type": "tuple",
                        "name": "a",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "b",
                        "components": [
                            {
                                "type": "uint256[2]",
                                "name": "x"
                            },
                            {
                                "type": "uint256[2]",
                                "name": "y"
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "c",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "x"
                            },
                            {
                                "type": "uint256",
                                "name": "y"
                            }
                        ]
                    }
                ]
            },
            {
                "type": "uint256[]",
                "name": "_inputs"
            }
        ],
        "outputs": [
            {
                "type": "bool",
                "name": ""
            }
        ]
    },
    {
        "type": "function",
        "name": "zeros",
        "constant": true,
        "stateMutability": "view",
        "payable": false,
        "inputs": [
            {
                "type": "uint256",
                "name": ""
            }
        ],
        "outputs": [
            {
                "type": "bytes32",
                "name": ""
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "CommitmentBatch",
        "inputs": [
            {
                "type": "uint256",
                "name": "treeNumber",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "startPosition",
                "indexed": false
            },
            {
                "type": "uint256[]",
                "name": "hash"
            },
            {
                "type": "tuple[]",
                "name": "ciphertext",
                "components": [
                    {
                        "type": "uint256[4]",
                        "name": "ciphertext"
                    },
                    {
                        "type": "uint256[2]",
                        "name": "ephemeralKeys"
                    },
                    {
                        "type": "uint256[]",
                        "name": "memo"
                    }
                ]
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "GeneratedCommitmentBatch",
        "inputs": [
            {
                "type": "uint256",
                "name": "treeNumber",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "startPosition",
                "indexed": false
            },
            {
                "type": "tuple[]",
                "name": "commitments",
                "components": [
                    {
                        "type": "uint256",
                        "name": "npk"
                    },
                    {
                        "type": "tuple",
                        "name": "token",
                        "components": [
                            {
                                "type": "uint8",
                                "name": "tokenType"
                            },
                            {
                                "type": "address",
                                "name": "tokenAddress"
                            },
                            {
                                "type": "uint256",
                                "name": "tokenSubID"
                            }
                        ]
                    },
                    {
                        "type": "uint120",
                        "name": "value"
                    }
                ]
            },
            {
                "type": "uint256[2][]",
                "name": "encryptedRandom"
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "Nullifiers",
        "inputs": [
            {
                "type": "uint256",
                "name": "treeNumber",
                "indexed": false
            },
            {
                "type": "uint256[]",
                "name": "nullifier"
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "Shield",
        "inputs": [
            {
                "type": "uint256",
                "name": "treeNumber",
                "indexed": false
            },
            {
                "type": "uint256",
                "name": "startPosition",
                "indexed": false
            },
            {
                "type": "tuple[]",
                "name": "commitments",
                "components": [
                    {
                        "type": "bytes32",
                        "name": "npk"
                    },
                    {
                        "type": "tuple",
                        "name": "token",
                        "components": [
                            {
                                "type": "uint8",
                                "name": "tokenType"
                            },
                            {
                                "type": "address",
                                "name": "tokenAddress"
                            },
                            {
                                "type": "uint256",
                                "name": "tokenSubID"
                            }
                        ]
                    },
                    {
                        "type": "uint120",
                        "name": "value"
                    }
                ]
            },
            {
                "type": "tuple[]",
                "name": "shieldCiphertext",
                "components": [
                    {
                        "type": "bytes32[3]",
                        "name": "encryptedBundle"
                    },
                    {
                        "type": "bytes32",
                        "name": "shieldKey"
                    }
                ]
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "ProxyOwnershipTransfer",
        "inputs": [
            {
                "type": "address",
                "name": "previousOwner",
                "indexed": false
            },
            {
                "type": "address",
                "name": "newOwner",
                "indexed": false
            }
        ]
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "ProxyPause",
        "inputs": []
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "ProxyUnpause",
        "inputs": []
    },
    {
        "type": "event",
        "anonymous": false,
        "name": "ProxyUpgrade",
        "inputs": [
            {
                "type": "address",
                "name": "previousImplementation",
                "indexed": false
            },
            {
                "type": "address",
                "name": "newImplementation",
                "indexed": false
            }
        ]
    },
    {
        "type": "function",
        "name": "transact",
        "constant": false,
        "payable": false,
        "inputs": [
            {
                "type": "tuple[]",
                "name": "_transactions",
                "components": [
                    {
                        "type": "tuple",
                        "name": "proof",
                        "components": [
                            {
                                "type": "tuple",
                                "name": "a",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "b",
                                "components": [
                                    {
                                        "type": "uint256[2]",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256[2]",
                                        "name": "y"
                                    }
                                ]
                            },
                            {
                                "type": "tuple",
                                "name": "c",
                                "components": [
                                    {
                                        "type": "uint256",
                                        "name": "x"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "y"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "uint256",
                        "name": "merkleRoot"
                    },
                    {
                        "type": "uint256[]",
                        "name": "nullifiers"
                    },
                    {
                        "type": "uint256[]",
                        "name": "commitments"
                    },
                    {
                        "type": "tuple",
                        "name": "boundParams",
                        "components": [
                            {
                                "type": "uint16",
                                "name": "treeNumber"
                            },
                            {
                                "type": "uint8",
                                "name": "withdraw"
                            },
                            {
                                "type": "address",
                                "name": "adaptContract"
                            },
                            {
                                "type": "bytes32",
                                "name": "adaptParams"
                            },
                            {
                                "type": "tuple[]",
                                "name": "commitmentCiphertext",
                                "components": [
                                    {
                                        "type": "uint256[4]",
                                        "name": "ciphertext"
                                    },
                                    {
                                        "type": "uint256[2]",
                                        "name": "ephemeralKeys"
                                    },
                                    {
                                        "type": "uint256[]",
                                        "name": "memo"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "tuple",
                        "name": "withdrawPreimage",
                        "components": [
                            {
                                "type": "uint256",
                                "name": "npk"
                            },
                            {
                                "type": "tuple",
                                "name": "token",
                                "components": [
                                    {
                                        "type": "uint8",
                                        "name": "tokenType"
                                    },
                                    {
                                        "type": "address",
                                        "name": "tokenAddress"
                                    },
                                    {
                                        "type": "uint256",
                                        "name": "tokenSubID"
                                    }
                                ]
                            },
                            {
                                "type": "uint120",
                                "name": "value"
                            }
                        ]
                    },
                    {
                        "type": "address",
                        "name": "overrideOutput"
                    }
                ]
            }
        ],
        "outputs": []
    }
]

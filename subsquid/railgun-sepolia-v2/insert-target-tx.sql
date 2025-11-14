-- Manually insert target transaction with populated arrays
-- Based on check-events output:
-- Nullifier: 0x05770a58f9a13f114598037826aafaf3c64e1e16f7689846624ebf5a74c68b4a
-- Commitment: 0xfba45c7910ea10d2504bed7e397a8c12255d344392e7a745f1448a13210bca0c

-- GraphQL ID format
-- Block 9536064 = 0x918240 (hex) -> padded to 64 chars
-- Position 9 = 0x9 (hex) -> padded to 64 chars
INSERT INTO transaction (
    id,
    transaction_hash,
    nullifiers,
    commitments,
    bound_params_hash,
    block_number,
    block_timestamp,
    utxo_tree_in,
    utxo_tree_out,
    utxo_batch_start_position_out,
    has_unshield,
    unshield_to_address,
    unshield_value,
    verification_hash
) VALUES (
    '0x000000000000000000000000000000000000000000000000000000000091824000000000000000000000000000000000000000000000000000000000000000090000000000000000000000000000000000000000000000000000000000000000',
    '\x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a',
    ARRAY['\x05770a58f9a13f114598037826aafaf3c64e1e16f7689846624ebf5a74c68b4a']::bytea[],
    ARRAY['\xfba45c7910ea10d2504bed7e397a8c12255d344392e7a745f1448a13210bca0c']::bytea[],
    '\x0000000000000000000000000000000000000000000000000000000000000000',
    9536064,
    1716309480,
    0,
    0,
    0,
    false,
    NULL,
    NULL,
    '\x0000000000000000000000000000000000000000000000000000000000000000'
)
ON CONFLICT (id) DO UPDATE SET
    nullifiers = EXCLUDED.nullifiers,
    commitments = EXCLUDED.commitments;

-- Insert nullifier entity
INSERT INTO nullifier (
    id,
    transaction_hash,
    nullifier,
    block_number,
    block_timestamp,
    tree_number
) VALUES (
    '0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a-nullifier-0-0',
    '\x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a',
    '\x05770a58f9a13f114598037826aafaf3c64e1e16f7689846624ebf5a74c68b4a',
    9536064,
    1716309480,
    0
)
ON CONFLICT (id) DO NOTHING;

-- Insert commitment entity
INSERT INTO commitment (
    id,
    transaction_hash,
    commitment_type,
    hash,
    tree_number,
    batch_start_tree_position,
    tree_position,
    block_number,
    block_timestamp
) VALUES (
    '0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a-commitment-0-0',
    '\x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a',
    'ShieldCommitment',
    '\xfba45c7910ea10d2504bed7e397a8c12255d344392e7a745f1448a13210bca0c',
    0,
    0,
    0,
    9536064,
    1716309480
)
ON CONFLICT (id) DO NOTHING;





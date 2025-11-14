-- Debug: Check how arrays are stored in the database
SELECT 
    id,
    encode(transaction_hash, 'hex') as tx_hash,
    nullifiers,
    commitments,
    array_length(nullifiers, 1) as null_count,
    array_length(commitments, 1) as commit_count,
    -- Try to extract first element
    CASE 
        WHEN array_length(nullifiers, 1) > 0 THEN encode(nullifiers[1], 'hex')
        ELSE 'NULL'
    END as first_nullifier_hex,
    CASE 
        WHEN array_length(commitments, 1) > 0 THEN encode(commitments[1], 'hex')
        ELSE 'NULL'
    END as first_commitment_hex
FROM transaction 
WHERE transaction_hash = '\x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';





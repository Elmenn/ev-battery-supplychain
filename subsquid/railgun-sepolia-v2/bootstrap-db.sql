-- Bootstrap database schema from schema.graphql
-- This creates all tables needed for the Railgun indexer

-- Create migrations table first (if not exists)
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    name VARCHAR NOT NULL
);

-- Create Token table
CREATE TABLE IF NOT EXISTS token (
    id VARCHAR PRIMARY KEY,
    token_type INTEGER NOT NULL,
    token_address BYTEA NOT NULL,
    token_sub_id BYTEA NOT NULL
);

-- Create Transaction table
CREATE TABLE IF NOT EXISTS transaction (
    id VARCHAR PRIMARY KEY,
    transaction_hash BYTEA NOT NULL,
    nullifiers BYTEA[] NOT NULL,
    commitments BYTEA[] NOT NULL,
    bound_params_hash BYTEA NOT NULL,
    block_number NUMERIC NOT NULL,
    block_timestamp NUMERIC NOT NULL,
    utxo_tree_in NUMERIC NOT NULL,
    utxo_tree_out NUMERIC NOT NULL,
    utxo_batch_start_position_out NUMERIC NOT NULL,
    has_unshield BOOLEAN NOT NULL,
    unshield_to_address BYTEA,
    unshield_value NUMERIC,
    verification_hash BYTEA NOT NULL,
    unshield_token_id VARCHAR,
    CONSTRAINT FK_transaction_unshield_token FOREIGN KEY (unshield_token_id) REFERENCES token(id)
);

CREATE INDEX IF NOT EXISTS IDX_transaction_unshield_token ON transaction(unshield_token_id);

-- Create CommitmentPreimage table
CREATE TABLE IF NOT EXISTS commitment_preimage (
    id VARCHAR PRIMARY KEY,
    npk BYTEA NOT NULL,
    value NUMERIC NOT NULL,
    token_id VARCHAR,
    CONSTRAINT FK_commitment_preimage_token FOREIGN KEY (token_id) REFERENCES token(id)
);

CREATE INDEX IF NOT EXISTS IDX_commitment_preimage_token ON commitment_preimage(token_id);

-- Create Ciphertext table
CREATE TABLE IF NOT EXISTS ciphertext (
    id VARCHAR PRIMARY KEY,
    iv BYTEA NOT NULL,
    tag BYTEA NOT NULL,
    data BYTEA[] NOT NULL
);

-- Create CommitmentCiphertext table
CREATE TABLE IF NOT EXISTS commitment_ciphertext (
    id VARCHAR PRIMARY KEY,
    blinded_receiver_viewing_key BYTEA NOT NULL,
    blinded_sender_viewing_key BYTEA NOT NULL,
    memo BYTEA[] NOT NULL,
    annotation_data BYTEA,
    ciphertext_id VARCHAR,
    CONSTRAINT FK_commitment_ciphertext_ciphertext FOREIGN KEY (ciphertext_id) REFERENCES ciphertext(id)
);

CREATE INDEX IF NOT EXISTS IDX_commitment_ciphertext_ciphertext ON commitment_ciphertext(ciphertext_id);

-- Create LegacyCommitmentCiphertext table
CREATE TABLE IF NOT EXISTS legacy_commitment_ciphertext (
    id VARCHAR PRIMARY KEY,
    ephemeral_keys BYTEA[] NOT NULL,
    memo BYTEA[] NOT NULL,
    ciphertext_id VARCHAR,
    CONSTRAINT FK_legacy_commitment_ciphertext_ciphertext FOREIGN KEY (ciphertext_id) REFERENCES ciphertext(id)
);

CREATE INDEX IF NOT EXISTS IDX_legacy_commitment_ciphertext_ciphertext ON legacy_commitment_ciphertext(ciphertext_id);

-- Create Commitment table
CREATE TABLE IF NOT EXISTS commitment (
    id VARCHAR PRIMARY KEY,
    transaction_hash BYTEA NOT NULL,
    commitment_type TEXT NOT NULL,
    hash BYTEA NOT NULL,
    tree_number INTEGER NOT NULL,
    batch_start_tree_position INTEGER NOT NULL,
    tree_position INTEGER NOT NULL,
    block_number NUMERIC NOT NULL,
    block_timestamp NUMERIC NOT NULL,
    shield_key BYTEA,
    fee NUMERIC,
    encrypted_bundle BYTEA[],
    encrypted_random BYTEA[],
    preimage_id VARCHAR,
    ciphertext_id VARCHAR,
    legacy_ciphertext_id VARCHAR,
    CONSTRAINT FK_commitment_preimage FOREIGN KEY (preimage_id) REFERENCES commitment_preimage(id),
    CONSTRAINT FK_commitment_ciphertext FOREIGN KEY (ciphertext_id) REFERENCES commitment_ciphertext(id),
    CONSTRAINT FK_commitment_legacy_ciphertext FOREIGN KEY (legacy_ciphertext_id) REFERENCES legacy_commitment_ciphertext(id)
);

CREATE INDEX IF NOT EXISTS IDX_commitment_preimage ON commitment(preimage_id);
CREATE INDEX IF NOT EXISTS IDX_commitment_ciphertext ON commitment(ciphertext_id);
CREATE INDEX IF NOT EXISTS IDX_commitment_legacy_ciphertext ON commitment(legacy_ciphertext_id);

-- Create Nullifier table
CREATE TABLE IF NOT EXISTS nullifier (
    id VARCHAR PRIMARY KEY,
    transaction_hash BYTEA NOT NULL,
    nullifier BYTEA NOT NULL,
    block_number NUMERIC NOT NULL,
    block_timestamp NUMERIC NOT NULL,
    tree_number INTEGER NOT NULL
);

-- Create Unshield table
CREATE TABLE IF NOT EXISTS unshield (
    id VARCHAR PRIMARY KEY,
    transaction_hash BYTEA NOT NULL,
    "to" BYTEA NOT NULL,
    amount NUMERIC NOT NULL,
    fee NUMERIC NOT NULL,
    block_number NUMERIC NOT NULL,
    block_timestamp NUMERIC NOT NULL,
    event_log_index INTEGER NOT NULL,
    token_id VARCHAR,
    CONSTRAINT FK_unshield_token FOREIGN KEY (token_id) REFERENCES token(id)
);

CREATE INDEX IF NOT EXISTS IDX_unshield_token ON unshield(token_id);





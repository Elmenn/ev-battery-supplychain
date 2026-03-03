# DID Signing and Verification Standards Mapping

This document explains the DID signing and verification model currently implemented in this repository, and maps each behavior to primary standards/specifications.

## Scope and Precision
- This repo signs VC-like payloads using Ethereum EIP-712 typed-data signatures (https://eips.ethereum.org/EIPS/eip-712).
- This repo resolves `did:ethr` identifiers via Ethereum DID Registry semantics (ERC-1056) through `ethr-did-resolver` (https://eips.ethereum.org/EIPS/eip-1056, https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md).
- This repo validates `verificationMethod` and `proofPurpose` authorization against resolved DID Documents using DID Core / Controlled Identifiers relationship semantics (https://www.w3.org/TR/did-core/, https://www.w3.org/TR/controller-document/).
- This repo does not claim full VC proof-suite interoperability defined by VC Data Integrity 1.0 (https://www.w3.org/TR/vc-data-integrity/).

## Implemented Flow in This Repository

### 1) Signing (Frontend)
- File: `frontend/src/utils/signVcWithMetamask.js`
- The signer uses EIP-712 domain separation (`name`, `version`, `chainId`, optional `verifyingContract`) and signs typed `Credential` data (https://eips.ethereum.org/EIPS/eip-712).
- The proof object written into `vc.proof[]` currently includes:
  - `verificationMethod: did:ethr:<chainId>:<address>#controller`
  - `proofPurpose: assertionMethod`
  - `jws` (raw EIP-712 signature)
  - `payloadHash` (typed-data hash)
  - `role` (project-specific: `seller` or `holder`)

### 2) Verification (Backend)
- File: `backend/api/verifyVC.js`
- The verifier:
  1. Rebuilds canonical payload fields used by local EIP-712 verification.
  2. Resolves the DID (`resolver.resolve(did)`) to obtain a DID Document.
  3. Requires `proof.verificationMethod` to be present in the DID Document.
  4. Requires that method to be authorized for `proof.proofPurpose` (default `assertionMethod`).
  5. Extracts expected Ethereum address from resolved method material.
  6. Recovers signer using EIP-712 verification and compares to expected DID-linked address.

## DID Resolution Procedure in This Verifier
This is the concrete backend procedure used for DID resolution and authorization checks.

1. Derive effective chain context from `proof.verificationMethod`, issuer/holder DID, or configured default.
2. Build resolver network configuration for that chain (`rpcUrl`, chain aliases, optional registry override).
3. Resolve the target DID with `resolver.resolve(did)`.
4. Fail if DID resolution metadata reports an error or DID Document is missing.
5. Locate the exact `proof.verificationMethod` in DID Document `verificationMethod` entries.
6. Check that the resolved method identifier is authorized under the selected verification relationship (`proof.proofPurpose`, default `assertionMethod`).
7. Extract expected signer address from DID method material (`blockchainAccountId`, `ethereumAddress`, or method id fallback).
8. Verify EIP-712 signature and require recovered signer to match that DID-authorized address.

Standards rationale:
- Steps 3-6 implement DID Core + Controlled Identifiers verification relationship semantics (https://www.w3.org/TR/did-core/, https://www.w3.org/TR/controller-document/).
- Method-specific document derivation behavior follows did:ethr method rules over ERC-1056 registry data (https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md, https://eips.ethereum.org/EIPS/eip-1056).
- Step 8 uses EIP-712 cryptographic recovery and domain separation (https://eips.ethereum.org/EIPS/eip-712).

## Standards Basis (Claim-by-Claim)

### DID Resolution and DID Documents
- DID Core defines DID syntax, DID Documents, `verificationMethod`, and verification relationships including `assertionMethod` (https://www.w3.org/TR/did-core/).
- Controlled Identifiers specifies relationship semantics and authorization usage for verification methods (https://www.w3.org/TR/controller-document/).
- DID Core is method-agnostic; each DID method defines concrete resolution mechanics (https://www.w3.org/TR/did-core/).
- For this repo, `did:ethr` method resolution is defined by the did:ethr method specification and implemented by `ethr-did-resolver` (https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md).
- `did:ethr` derives DID Documents from Ethereum DID Registry state defined in ERC-1056 (https://eips.ethereum.org/EIPS/eip-1056).

### VC Structure
- VC Data Model 2.0 defines core VC concepts and data model terms (`issuer`, `holder`, `credentialSubject`, `proof`) used by this project (https://www.w3.org/TR/vc-data-model-2.0/).
- The project uses VC-shaped JSON documents with those fields, then applies Ethereum EIP-712 signatures for cryptographic verification.

### Signature Cryptography
- EIP-712 defines typed structured data hashing/signing and domain separation (`chainId`, optional verifying contract), which this repo uses for both signing and verification (https://eips.ethereum.org/EIPS/eip-712).

### Interoperability Boundary
- VC Data Integrity 1.0 defines interoperable Data Integrity proofs and cryptosuite processing model (`proof` processing rules, canonicalization inputs, cryptosuite semantics) (https://www.w3.org/TR/vc-data-integrity/).
- This repository does not implement full VC Data Integrity processing. It uses an Ethereum-specific EIP-712 verification path with project-defined proof fields, so interoperability with arbitrary VC Data Integrity proof suites is out of scope.

## Compliance Statement
| Capability | Status | Implementation in this repo | Standards reference |
| --- | --- | --- | --- |
| DID method resolution (`did:ethr`) | Implemented | Resolves DID to DID Document using `did-resolver` + `ethr-did-resolver`, chain RPC config, and registry-aware network config. | DID Core: https://www.w3.org/TR/did-core/ ; did:ethr method spec: https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md ; ERC-1056: https://eips.ethereum.org/EIPS/eip-1056 |
| `verificationMethod` + `proofPurpose` authorization checks | Implemented | Rejects proofs unless method exists in DID Document and is authorized under selected verification relationship (`assertionMethod` default). | DID Core: https://www.w3.org/TR/did-core/ ; Controlled Identifiers: https://www.w3.org/TR/controller-document/ |
| EIP-712 cryptographic verification | Implemented | Recomputes typed-data hash and uses signature recovery; succeeds only when recovered signer matches DID-derived address. | EIP-712: https://eips.ethereum.org/EIPS/eip-712 |
| Full VC Data Integrity / JOSE proof-suite interoperability | Not fully implemented | Uses EIP-712 + project-specific proof fields (`jws`, `payloadHash`, `role`) instead of full VC Data Integrity cryptosuite processing. | VC Data Integrity 1.0: https://www.w3.org/TR/vc-data-integrity/ ; VC Data Model 2.0: https://www.w3.org/TR/vc-data-model-2.0/ |

## Project-Specific Behavior (Non-Standard by Design)
- `proof.jws` stores a raw EIP-712 signature hex string; this is a project field name and should not be interpreted as full JOSE/JWS envelope interoperability.
- `proof.payloadHash` and `proof.role` are repository-specific helper fields.
- Payload normalization rules in `preparePayloadForSigning` and `preparePayloadForVerification` are implementation logic for deterministic EIP-712 verification in this codebase.

## Practical Review Notes
- What is standards-aligned:
  - DID method resolution model and DID Document authorization checks (https://www.w3.org/TR/did-core/, https://www.w3.org/TR/controller-document/, https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md, https://eips.ethereum.org/EIPS/eip-1056).
  - Ethereum typed-data cryptographic verification model (https://eips.ethereum.org/EIPS/eip-712).
  - Use of VC core structural terms (https://www.w3.org/TR/vc-data-model-2.0/).
- What is intentionally constrained:
  - The proof representation is Ethereum/EIP-712-focused and not a general VC proof-suite engine (https://eips.ethereum.org/EIPS/eip-712, https://www.w3.org/TR/vc-data-integrity/).
  - Backward-compatibility toggles (`legacy` resolution mode and bare-method allowance) are migration controls, not normative DID best practice under DID Core relationship-based authorization expectations (https://www.w3.org/TR/did-core/, https://www.w3.org/TR/controller-document/).

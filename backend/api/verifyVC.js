const { verifyTypedData, TypedDataEncoder, isAddress, getAddress } = require('ethers');

const DEFAULT_CHAIN_ID = (() => {
  const env = process.env.VC_CHAIN_ID || process.env.CHAIN_ID;
  const parsed = Number(env);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 11155111;
})();

const BASE_DOMAIN = {
  name: 'VC',
  version: '1.0',
};

const DID_RESOLUTION_MODE = (process.env.VC_DID_RESOLUTION_MODE || 'registry').toLowerCase();
const DID_ALLOW_BARE_VERIFICATION_METHOD =
  String(process.env.VC_DID_ALLOW_BARE_METHOD || 'false').toLowerCase() === 'true';

const CHAIN_NAME_TO_ID = Object.freeze({
  mainnet: 1,
  sepolia: 11155111,
  goerli: 5,
});

const DEFAULT_RPC_BY_CHAIN = Object.freeze({
  1: 'https://ethereum.publicnode.com',
  11155111: 'https://ethereum-sepolia.publicnode.com',
});

const DEFAULT_ETHR_REGISTRY_BY_CHAIN = Object.freeze({
  // Official Ethr DID registry deployment differs by network.
  // Sepolia does not use the legacy mainnet/goerli 0xdca7... address.
  11155111: '0x03d5003bf0e79c5f5223588f347eba39afbc3818',
});

const CHAIN_ID_TO_ALIASES = Object.freeze({
  1: ['mainnet'],
  5: ['goerli'],
  11155111: ['sepolia'],
});

const EIP712_TYPES = {
  Credential: [
    { name: 'id', type: 'string' },
    { name: '@context', type: 'string[]' },
    { name: 'type', type: 'string[]' },
    { name: 'schemaVersion', type: 'string' },
    { name: 'issuer', type: 'Party' },
    { name: 'holder', type: 'Party' },
    { name: 'issuanceDate', type: 'string' },
    { name: 'credentialSubject', type: 'CredentialSubject' },
  ],
  Party: [
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' },
  ],
  CredentialSubject: [
    { name: 'id', type: 'string' },
    { name: 'productName', type: 'string' },
    { name: 'batch', type: 'string' },
    { name: 'quantity', type: 'uint256' },
    { name: 'previousCredential', type: 'string' },
    { name: 'componentCredentials', type: 'string[]' },
    { name: 'certificateCredential', type: 'Certificate' },
    { name: 'sellerRailgunAddress', type: 'string' },
    { name: 'price', type: 'string' },
  ],
  Certificate: [
    { name: 'name', type: 'string' },
    { name: 'cid', type: 'string' },
  ],
};

const didLibState = {
  loadPromise: null,
  resolverByChain: new Map(),
  didDocumentByKey: new Map(),
};

function normalizeId(value) {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function stripFragment(value) {
  return typeof value === 'string' ? value.replace(/#.*$/, '') : value;
}

function parseChainReference(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;

  if (/^0x[0-9a-f]+$/i.test(normalized)) {
    const fromHex = Number.parseInt(normalized, 16);
    return Number.isFinite(fromHex) && fromHex > 0 ? fromHex : null;
  }

  const parsed = Number(normalized);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  return CHAIN_NAME_TO_ID[normalized] || null;
}

function extractChainId(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const parts = identifier.toLowerCase().split(':');
  if (parts.length < 4) return null;
  return parseChainReference(parts[2]);
}

function normalizeAddress(address) {
  if (!address || typeof address !== 'string') return null;
  if (!isAddress(address)) return null;
  return getAddress(address).toLowerCase();
}

function extractAddressFromDidIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const bare = stripFragment(identifier.trim());
  const parts = bare.split(':');
  if (parts.length < 3) return null;
  if (parts[0].toLowerCase() !== 'did' || parts[1].toLowerCase() !== 'ethr') return null;
  return normalizeAddress(parts[parts.length - 1]);
}

function extractAddressFromBlockchainAccountId(blockchainAccountId) {
  if (!blockchainAccountId || typeof blockchainAccountId !== 'string') return null;
  // Expected: eip155:<chain-id>:0xabc...
  const match = blockchainAccountId.match(/eip155:(?:0x[0-9a-f]+|[0-9]+):(0x[0-9a-f]{40})$/i);
  if (!match) return null;
  return normalizeAddress(match[1]);
}

function extractAddressFromVerificationMethodEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  if (typeof entry.blockchainAccountId === 'string') {
    const parsed = extractAddressFromBlockchainAccountId(entry.blockchainAccountId);
    if (parsed) return parsed;
  }

  if (typeof entry.ethereumAddress === 'string') {
    const parsed = normalizeAddress(entry.ethereumAddress);
    if (parsed) return parsed;
  }

  if (typeof entry.id === 'string') {
    const parsed = extractAddressFromDidIdentifier(entry.id);
    if (parsed) return parsed;
  }

  return null;
}

function getRpcUrlForChain(chainId) {
  const candidates = [
    process.env[`VC_DID_RPC_URL_${chainId}`],
    process.env[`VC_RPC_URL_${chainId}`],
    process.env.VC_DID_RPC_URL,
    process.env.VC_RPC_URL,
    process.env.RPC_URL,
    DEFAULT_RPC_BY_CHAIN[chainId],
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) || null;
}

function getRegistryAddressForChain(chainId) {
  const candidates = [
    process.env[`VC_ETHR_REGISTRY_${chainId}`],
    process.env.VC_ETHR_REGISTRY_ADDRESS,
    DEFAULT_ETHR_REGISTRY_BY_CHAIN[chainId],
  ];
  const selected = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return selected && isAddress(selected) ? getAddress(selected) : null;
}

function getChainNamesForResolver(chainId) {
  const names = new Set([String(chainId), `0x${Number(chainId).toString(16)}`]);
  const aliases = CHAIN_ID_TO_ALIASES[chainId] || [];
  aliases.forEach((alias) => names.add(alias));
  return Array.from(names);
}

async function loadDidResolverLibraries() {
  if (!didLibState.loadPromise) {
    didLibState.loadPromise = Promise.all([
      import('did-resolver'),
      import('ethr-did-resolver'),
    ]).then(([didResolverMod, ethrResolverMod]) => {
      const ResolverCtor =
        didResolverMod.Resolver ||
        didResolverMod.default?.Resolver;
      const getEthrDidResolver =
        ethrResolverMod.getResolver ||
        ethrResolverMod.default?.getResolver;

      if (!ResolverCtor || !getEthrDidResolver) {
        throw new Error(
          'Failed to load did-resolver / ethr-did-resolver modules. ' +
          'Install backend/api dependencies.'
        );
      }

      return { ResolverCtor, getEthrDidResolver };
    });
  }

  return didLibState.loadPromise;
}

async function getResolverForChain(chainId) {
  if (didLibState.resolverByChain.has(chainId)) {
    return didLibState.resolverByChain.get(chainId);
  }

  const rpcUrl = getRpcUrlForChain(chainId);
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL configured for DID resolution on chain ${chainId}. ` +
      `Set VC_DID_RPC_URL_${chainId}, VC_RPC_URL_${chainId}, VC_DID_RPC_URL, VC_RPC_URL, or RPC_URL.`
    );
  }

  const registry = getRegistryAddressForChain(chainId);
  const chainNames = getChainNamesForResolver(chainId);

  const networks = chainNames.map((name) => ({
    name,
    chainId,
    rpcUrl,
    ...(registry ? { registry } : {}),
  }));

  const { ResolverCtor, getEthrDidResolver } = await loadDidResolverLibraries();
  const resolver = new ResolverCtor(
    getEthrDidResolver({ networks })
  );

  didLibState.resolverByChain.set(chainId, resolver);
  return resolver;
}

function getDidDocumentCacheKey(did, chainId) {
  return `${chainId}:${stripFragment(String(did || '')).toLowerCase()}`;
}

async function resolveDidDocument(did, chainId) {
  const cacheKey = getDidDocumentCacheKey(did, chainId);
  if (didLibState.didDocumentByKey.has(cacheKey)) {
    return didLibState.didDocumentByKey.get(cacheKey);
  }

  const resolver = await getResolverForChain(chainId);
  const didToResolve = stripFragment(String(did || '').trim());
  const resolution = await resolver.resolve(didToResolve);

  if (resolution?.didResolutionMetadata?.error) {
    const reason = resolution.didResolutionMetadata.message || resolution.didResolutionMetadata.error;
    throw new Error(`DID resolution failed for ${didToResolve}: ${reason}`);
  }

  const didDocument = resolution?.didDocument;
  if (!didDocument) {
    throw new Error(`No DID document returned for ${didToResolve}`);
  }

  didLibState.didDocumentByKey.set(cacheKey, didDocument);
  return didDocument;
}

function getVerificationMethodEntries(didDocument) {
  return Array.isArray(didDocument?.verificationMethod) ? didDocument.verificationMethod : [];
}

function resolveVerificationMethodFromDidDocument({ didDocument, proofVerificationMethod }) {
  const normalizedVm = String(proofVerificationMethod || '').toLowerCase();
  const methods = getVerificationMethodEntries(didDocument);

  const byExactId = methods.find((entry) => String(entry?.id || '').toLowerCase() === normalizedVm);
  if (byExactId) return byExactId;

  // Transitional compatibility for existing proofs that use bare did:ethr:<chain>:<address>
  if (!normalizedVm.includes('#') && DID_ALLOW_BARE_VERIFICATION_METHOD) {
    const vmAddress = extractAddressFromDidIdentifier(normalizedVm);
    if (vmAddress) {
      const byAddress = methods.find((entry) => {
        const addr = extractAddressFromVerificationMethodEntry(entry);
        return addr && addr === vmAddress;
      });
      if (byAddress) return byAddress;
    }
  }

  return null;
}

function collectAllowedMethodIdsForPurpose(didDocument, proofPurpose) {
  const purpose = typeof proofPurpose === 'string' && proofPurpose.trim().length > 0
    ? proofPurpose
    : 'assertionMethod';
  const entries = Array.isArray(didDocument?.[purpose]) ? didDocument[purpose] : [];
  const ids = new Set();

  entries.forEach((entry) => {
    if (typeof entry === 'string') {
      ids.add(entry.toLowerCase());
    } else if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
      ids.add(entry.id.toLowerCase());
    }
  });

  return ids;
}

function preparePayloadForVerification(vc) {
  const clone = JSON.parse(JSON.stringify(vc || {}));

  delete clone.proof;
  delete clone.proofs;

  if (!clone.credentialSubject || typeof clone.credentialSubject !== 'object') {
    clone.credentialSubject = {};
  }

  // Exclude mutable post-signing fields from payload verification.
  delete clone.credentialSubject.vcHash;
  delete clone.credentialSubject.transactionId;

  if (clone.credentialSubject.payment !== undefined) {
    delete clone.credentialSubject.payment;
  }
  if (clone.credentialSubject.delivery !== undefined) {
    delete clone.credentialSubject.delivery;
  }
  if (clone.previousVersion !== undefined) {
    delete clone.previousVersion;
  }

  if (clone.credentialSubject.priceCommitment && typeof clone.credentialSubject.priceCommitment === 'object') {
    try {
      clone.credentialSubject.price = JSON.stringify(clone.credentialSubject.priceCommitment);
    } catch {
      clone.credentialSubject.price = String(clone.credentialSubject.priceCommitment);
    }
    delete clone.credentialSubject.priceCommitment;
  }

  if (clone.credentialSubject.price !== undefined && typeof clone.credentialSubject.price !== 'string') {
    try {
      clone.credentialSubject.price = JSON.stringify(clone.credentialSubject.price);
    } catch {
      clone.credentialSubject.price = String(clone.credentialSubject.price);
    }
  }

  if (clone.credentialSubject.listing && typeof clone.credentialSubject.listing === 'object') {
    clone.credentialSubject.certificateCredential =
      clone.credentialSubject.listing.certificateCredential || { name: '', cid: '' };
    clone.credentialSubject.componentCredentials = clone.credentialSubject.listing.componentCredentials || [];
    clone.credentialSubject.sellerRailgunAddress = clone.credentialSubject.listing.sellerRailgunAddress || '';
    delete clone.credentialSubject.listing;
  }

  if (!clone.credentialSubject.certificateCredential) {
    clone.credentialSubject.certificateCredential = { name: '', cid: '' };
  }
  clone.credentialSubject.certificateCredential.name = String(clone.credentialSubject.certificateCredential.name || '');
  clone.credentialSubject.certificateCredential.cid = String(clone.credentialSubject.certificateCredential.cid || '');

  if (clone.credentialSubject.id == null) clone.credentialSubject.id = String(clone.issuer?.id || '');
  if (clone.credentialSubject.productName == null) clone.credentialSubject.productName = '';
  if (clone.credentialSubject.batch == null) clone.credentialSubject.batch = '';
  if (clone.credentialSubject.quantity == null) clone.credentialSubject.quantity = 0;
  if (clone.credentialSubject.previousCredential == null) clone.credentialSubject.previousCredential = '';
  if (!Array.isArray(clone.credentialSubject.componentCredentials)) clone.credentialSubject.componentCredentials = [];

  clone.credentialSubject.componentCredentials = clone.credentialSubject.componentCredentials
    .filter((item) => item != null)
    .map((item) => String(item));

  if (clone.credentialSubject.price == null) clone.credentialSubject.price = '';
  if (typeof clone.credentialSubject.sellerRailgunAddress !== 'string') clone.credentialSubject.sellerRailgunAddress = '';
  if (!clone.schemaVersion) clone.schemaVersion = '1.0';

  if (clone.issuer?.id) clone.issuer.id = normalizeId(clone.issuer.id);
  if (clone.holder?.id) clone.holder.id = normalizeId(clone.holder.id);
  if (clone.credentialSubject?.id) clone.credentialSubject.id = normalizeId(clone.credentialSubject.id);

  return clone;
}

function buildProofArray(vc) {
  if (Array.isArray(vc?.proof)) return vc.proof;
  if (vc?.proofs && typeof vc.proofs === 'object') return Object.values(vc.proofs);
  return [];
}

async function verifyProof({ proof, dataToVerify, role, expectedDid, chainId, contractAddress }) {
  const result = {
    matching_vc: false,
    matching_signer: false,
    signature_verified: false,
    recovered_address: null,
    expected_address: null,
    skipped: false,
    error: null,
  };

  if (!proof) {
    result.error = `No ${role} proof provided`;
    return result;
  }

  const verificationMethod = proof.verificationMethod;
  if (!verificationMethod || !verificationMethod.toLowerCase().startsWith('did:ethr:')) {
    result.error = `Invalid verificationMethod in ${role} proof`;
    return result;
  }

  const effectiveChainId = chainId || DEFAULT_CHAIN_ID;
  let expectedAddress = null;

  if (DID_RESOLUTION_MODE === 'legacy') {
    expectedAddress = verificationMethod.split(':').pop().toLowerCase().replace(/#.*$/, '');
    result.expected_address = expectedAddress;

    if (!expectedDid || !expectedDid.toLowerCase().includes(expectedAddress)) {
      result.error = `DID mismatch for ${role}`;
      return result;
    }
    result.matching_vc = true;
  } else {
    try {
      const didDocument = await resolveDidDocument(expectedDid, effectiveChainId);
      const resolvedMethod = resolveVerificationMethodFromDidDocument({
        didDocument,
        proofVerificationMethod: verificationMethod,
      });

      if (!resolvedMethod) {
        result.error =
          `verificationMethod is not present in resolved DID document for ${role}. ` +
          `If your proofs use bare DIDs, set VC_DID_ALLOW_BARE_METHOD=true temporarily.`;
        return result;
      }

      const allowedMethodIds = collectAllowedMethodIdsForPurpose(
        didDocument,
        proof.proofPurpose || 'assertionMethod'
      );

      const resolvedMethodId = String(resolvedMethod.id || '').toLowerCase();
      if (!resolvedMethodId || !allowedMethodIds.has(resolvedMethodId)) {
        result.error =
          `verificationMethod is not authorized for proofPurpose in DID document for ${role}`;
        return result;
      }

      expectedAddress = extractAddressFromVerificationMethodEntry(resolvedMethod);
      result.expected_address = expectedAddress;
      if (!expectedAddress) {
        result.error = `Unable to extract Ethereum address from resolved verificationMethod for ${role}`;
        return result;
      }

      result.matching_vc = true;
    } catch (err) {
      result.error = `DID resolution failed for ${role}: ${err.message || String(err)}`;
      return result;
    }
  }

  const domains = [{ ...BASE_DOMAIN, chainId: effectiveChainId }];

  if (contractAddress) {
    domains.push({
      ...BASE_DOMAIN,
      chainId: effectiveChainId,
      verifyingContract: contractAddress,
    });
  }

  let lastError = null;
  for (const domain of domains) {
    try {
      const payloadHash = TypedDataEncoder.hash(domain, EIP712_TYPES, dataToVerify);
      if (proof.payloadHash && proof.payloadHash !== payloadHash) {
        lastError = `Payload hash mismatch for ${role}`;
        continue;
      }

      const recovered = verifyTypedData(domain, EIP712_TYPES, dataToVerify, proof.jws);
      result.recovered_address = recovered;
      result.matching_signer = recovered.toLowerCase() === expectedAddress;
      result.signature_verified = result.matching_signer;
      if (result.signature_verified) return result;

      lastError = `Recovered signer mismatch for ${role}`;
    } catch (err) {
      lastError = err.message || String(err);
    }
  }

  result.error = lastError || `Signature verification failed for ${role}`;
  return result;
}

async function verifyVC(vcJsonData, contractAddress = null) {
  const proofArr = buildProofArray(vcJsonData);
  if (!proofArr.length) throw new Error('No proofs found in VC');

  const dataToVerify = preparePayloadForVerification(vcJsonData);
  const issuerDid = dataToVerify.issuer?.id?.toLowerCase();
  const holderDid = dataToVerify.holder?.id?.toLowerCase();

  const issuerProof =
    proofArr.find((p) => p?.role === 'seller') ||
    proofArr.find((p) => p?.verificationMethod?.toLowerCase().includes(issuerDid));

  const holderProof =
    proofArr.find((p) => p?.role === 'holder' || p?.role === 'buyer') ||
    proofArr.find((p) => p?.verificationMethod?.toLowerCase().includes(holderDid));

  const issuerChainId =
    extractChainId(issuerProof?.verificationMethod) ||
    extractChainId(dataToVerify.issuer?.id) ||
    DEFAULT_CHAIN_ID;

  const holderChainId =
    extractChainId(holderProof?.verificationMethod) ||
    extractChainId(dataToVerify.holder?.id) ||
    issuerChainId;

  const issuerResult = await verifyProof({
    proof: issuerProof,
    dataToVerify,
    role: 'issuer',
    expectedDid: dataToVerify.issuer?.id,
    chainId: issuerChainId,
    contractAddress,
  });

  let holderResult;
  if (!holderProof) {
    holderResult = {
      matching_vc: true,
      matching_signer: true,
      signature_verified: true,
      recovered_address: null,
      expected_address: null,
      skipped: true,
      error: null,
    };
  } else {
    holderResult = await verifyProof({
      proof: holderProof,
      dataToVerify,
      role: 'holder',
      expectedDid: dataToVerify.holder?.id,
      chainId: holderChainId,
      contractAddress,
    });
  }

  return { issuer: issuerResult, holder: holderResult };
}

module.exports = { verifyVC };

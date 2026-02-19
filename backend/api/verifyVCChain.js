function normalize(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim();
}

function normalizeAddress(value) {
  const v = normalize(value);
  return v ? v.toLowerCase() : null;
}

function didToAddress(value) {
  const v = normalize(value);
  if (!v) return null;
  const lower = v.toLowerCase();
  const marker = ':0x';
  const markerIndex = lower.lastIndexOf(marker);
  if (markerIndex === -1) return lower;
  return lower.slice(markerIndex + 1);
}

function getComponentCredentials(vc) {
  const listingComponents = vc?.credentialSubject?.listing?.componentCredentials;
  if (Array.isArray(listingComponents)) return listingComponents;

  const subjectComponents = vc?.credentialSubject?.componentCredentials;
  if (Array.isArray(subjectComponents)) return subjectComponents;

  return [];
}

async function verifyVCChain(startCid, fetchVC, options = {}) {
  const maxDepth = Number(options.maxDepth || 50);
  if (!startCid || typeof startCid !== 'string') {
    throw new Error('startCid is required');
  }

  const visited = new Set();
  const nodes = [];
  const edges = [];
  const byCid = new Map();
  const stack = [startCid];

  const continuity = {
    verified: true,
    reason: null,
    cycleDetected: false,
    missingLink: false,
    truncated: false,
    invalidReferences: false,
  };

  while (stack.length > 0) {
    const currentCid = stack.pop();
    if (!currentCid) continue;

    if (visited.has(currentCid)) continue;
    if (visited.size >= maxDepth) {
      continuity.verified = false;
      continuity.truncated = true;
      continuity.reason = `Max node limit ${maxDepth} reached while traversing provenance graph`;
      break;
    }

    visited.add(currentCid);

    let vc;
    try {
      vc = await fetchVC(currentCid);
    } catch (err) {
      continuity.verified = false;
      continuity.missingLink = true;
      continuity.reason = `Failed to fetch CID ${currentCid}: ${err.message || String(err)}`;
      continue;
    }

    const subject = vc?.credentialSubject || {};
    const componentCredentials = getComponentCredentials(vc)
      .map((c) => normalize(c))
      .filter(Boolean);

    const node = {
      cid: currentCid,
      productId: normalize(subject.productId),
      productContract: normalizeAddress(subject.productContract),
      subjectId: normalizeAddress(subject.id),
      chainId: normalize(subject.chainId),
      issuerDid: normalize(vc?.issuer?.id),
      issuerAddress: didToAddress(vc?.issuer?.id),
      holderDid: normalize(vc?.holder?.id),
      holderAddress: didToAddress(vc?.holder?.id),
      componentCredentials,
    };

    nodes.push(node);
    byCid.set(currentCid, node);

    for (const childCid of componentCredentials) {
      edges.push({ from: currentCid, to: childCid });
      if (childCid === currentCid) {
        continuity.verified = false;
        continuity.cycleDetected = true;
        continuity.reason = `Self-cycle detected at CID ${currentCid}`;
      }
      if (!visited.has(childCid)) {
        stack.push(childCid);
      }
    }
  }

  if (!continuity.reason) {
    continuity.reason = continuity.verified
      ? 'Unbroken component-linked provenance path'
      : 'Provenance continuity check failed';
  }

  const identity = {
    verified: true,
    reason: null,
    baseline: null,
    mismatches: [],
  };

  if (nodes.length > 0) {
    const baseline = {
      productId: nodes[0].productId,
      productContract: nodes[0].productContract,
      subjectId: nodes[0].subjectId,
      chainId: nodes[0].chainId,
    };
    identity.baseline = baseline;

    for (const node of nodes.slice(1)) {
      for (const field of Object.keys(baseline)) {
        const expected = baseline[field];
        const actual = node[field];
        if (expected && actual && expected !== actual) {
          identity.mismatches.push({
            cid: node.cid,
            field,
            expected,
            actual,
          });
        }
      }
    }
  }

  identity.verified = identity.mismatches.length === 0;
  identity.reason = identity.verified
    ? 'Asset identity is consistent across provenance graph'
    : 'Identity mismatch detected across provenance graph';

  const governance = {
    verified: true,
    reason: null,
    violations: [],
  };

  for (const edge of edges) {
    const parent = byCid.get(edge.from);
    const child = byCid.get(edge.to);
    if (!parent || !child) {
      governance.verified = false;
      governance.violations.push({
        from: edge.from,
        to: edge.to,
        reason: 'Referenced component VC could not be loaded',
      });
      continue;
    }

    const parentIssuer = parent.issuerAddress;
    const childHolder = child.holderAddress;
    if (!parentIssuer || !childHolder || parentIssuer !== childHolder) {
      governance.verified = false;
      governance.violations.push({
        from: edge.from,
        to: edge.to,
        expectedIssuer: childHolder,
        actualIssuer: parentIssuer,
        reason: 'Governance mismatch: parent issuer must equal component holder',
      });
    }
  }

  governance.reason = governance.verified
    ? 'Issuer-holder governance is consistent across component links'
    : 'Governance mismatch detected across component links';

  return {
    success: continuity.verified && identity.verified && governance.verified,
    continuity,
    identity,
    governance,
    chainLength: nodes.length,
    nodes,
    edges,
  };
}

module.exports = { verifyVCChain };

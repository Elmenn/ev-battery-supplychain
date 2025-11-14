import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

// Copyable component (same as in VCViewer)
function truncate(text, length = 12) {
  if (!text || text.length <= length) return text;
  const start = text.slice(0, 6);
  const end = text.slice(-4);
  return `${start}…${end}`;
}

function Copyable({ value }) {
  return (
    <span
      className="copyable"
      title={value}
      onClick={() => navigator.clipboard.writeText(value)}
    >
      {truncate(value)}
    </span>
  );
}

/**
 * ProvenanceChainViewer - Displays the full supply chain provenance tree
 * Recursively fetches and displays component VCs and their components
 * @param {Object} vc - The VC to display
 * @param {string} cid - The IPFS CID of the VC
 * @param {Object} currentProductState - Optional: Current product state (for root product only) to show accurate status
 */
const ProvenanceChainViewer = ({ vc, cid, currentProductState = null }) => {
  const [chainData, setChainData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Fetch a VC from IPFS
  const fetchVC = async (cid) => {
    try {
      const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch VC: ${response.status}`);
      }
      const vcData = await response.json();
      return { cid, vc: vcData, error: null };
    } catch (err) {
      return { cid, vc: null, error: err.message };
    }
  };

  // Determine the current status from VC structure and proofs (matching ProductCard statuses)
  // If isRoot is true and currentProductState is provided, use it for accurate status
  const getVCStatus = (vc, isRoot = false) => {
    if (!vc) return null;
    
    // If this is the root product and we have current product state, use it for accurate status
    if (isRoot && currentProductState) {
      const { buyer, transporter, purchased, phase, owner } = currentProductState;
      const ZERO = "0x0000000000000000000000000000000000000000";
      
      // Normalize addresses for comparison
      const normalizeAddr = (addr) => addr ? addr.toLowerCase() : null;
      const ownerAddr = normalizeAddr(owner);
      const buyerAddr = normalizeAddr(buyer);
      
      // Check if product is delivered: phase >= 4 OR owner === buyer (same as ProductCard logic)
      const isDelivered = (typeof phase === 'number' && phase >= 4) || 
                         (ownerAddr && buyerAddr && ownerAddr === buyerAddr);
      const hasTransporter = transporter && transporter !== ZERO;
      const hasBuyer = buyer && buyer !== ZERO;
      
      // Match ProductCard status logic using current product state:
      if (isDelivered) {
        return { status: "Delivered", label: "Delivered", color: "#28a745", bgColor: "#d4edda" };
      } else if (hasTransporter) {
        return { status: "In Delivery", label: "In Delivery", color: "#004085", bgColor: "#cce5ff" };
      } else if (purchased) {
        return { status: "Awaiting Transporter", label: "Awaiting Transporter", color: "#856404", bgColor: "#fff3cd" };
      } else if (hasBuyer) {
        return { status: "Awaiting Confirm", label: "Awaiting Confirm", color: "#856404", bgColor: "#ffeaa7" };
      } else {
        return { status: "Available", label: "Available", color: "#6c757d", bgColor: "#e9ecef" };
      }
    }
    
    // For component products, determine status from VC data only
    const proofs = vc.proof || [];
    const hasIssuerProof = proofs.some((p) => p.role === "seller" || p.role === "issuer");
    const hasHolderProof = proofs.some((p) => p.role === "holder" || p.role === "buyer");
    
    // Check VC data for status indicators
    const subjectDetails = vc.credentialSubject?.subjectDetails || {};
    const transporter = subjectDetails.transporter;
    const deliveryStatus = vc.credentialSubject?.deliveryStatus;
    const holder = vc.holder?.id;
    const issuer = vc.issuer?.id;
    
    // Extract addresses from DID format (did:ethr:chain:address)
    const extractAddress = (did) => {
      if (!did) return null;
      const parts = did.split(':');
      return parts.length > 3 ? parts[3] : null;
    };
    
    const holderAddress = extractAddress(holder);
    const issuerAddress = extractAddress(issuer);
    const ownerIsBuyer = holderAddress && issuerAddress && holderAddress.toLowerCase() === issuerAddress.toLowerCase();
    const hasTransporter = transporter && transporter !== "0x0000000000000000000000000000000000000000";
    const hasBuyer = holderAddress && holderAddress !== "0x0000000000000000000000000000000000000000";
    
    // Match ProductCard status logic:
    // 1. "Delivered" - ownerIsBuyer OR (both proofs exist) (green) - PRIORITY: Check delivered first!
    // 2. "In Delivery" - hasTransporter (blue)
    // 3. "Awaiting Transporter" - purchased (has buyer proof) (yellow)
    // 4. "Awaiting Confirm" - hasBuyer (orange)
    // 5. "Available" - default (gray)
    
    // ✅ PRIORITY: If both proofs exist (seller + buyer), it's Delivered regardless of transporter
    if (ownerIsBuyer || (hasHolderProof && hasIssuerProof)) {
      return { status: "Delivered", label: "Delivered", color: "#28a745", bgColor: "#d4edda" };
    } else if (hasTransporter) {
      return { status: "In Delivery", label: "In Delivery", color: "#004085", bgColor: "#cce5ff" };
    } else if (hasBuyer || hasHolderProof) {
      return { status: "Awaiting Confirm", label: "Awaiting Confirm", color: "#856404", bgColor: "#ffeaa7" };
    } else if (hasIssuerProof) {
      return { status: "Available", label: "Available", color: "#6c757d", bgColor: "#e9ecef" };
    } else {
      return { status: "Unknown", label: "Unknown", color: "#6c757d", bgColor: "#e9ecef" };
    }
  };

  // Verify a VC (basic checks)
  const verifyVC = (vc, isRoot = false) => {
    if (!vc) return { verified: false, error: "VC not found" };
    
    // Check structure
    if (!vc["@context"] || !vc.type || !vc.credentialSubject) {
      return { verified: false, error: "Invalid VC structure" };
    }

    // Check proofs
    const proofs = vc.proof || [];
    const hasIssuerProof = proofs.some((p) => p.role === "seller" || p.role === "issuer");
    const hasHolderProof = proofs.some((p) => p.role === "holder" || p.role === "buyer");
    const isDelivered = hasIssuerProof && hasHolderProof;
    const statusInfo = getVCStatus(vc, isRoot);

    return {
      verified: true,
      isDelivered,
      hasIssuerProof,
      hasHolderProof,
      statusInfo, // Add status information (matching ProductCard)
      productName: vc.credentialSubject?.productName || "Unknown",
      componentCount: Array.isArray(vc.credentialSubject?.componentCredentials) 
        ? vc.credentialSubject.componentCredentials.length 
        : 0,
    };
  };

  // Recursively build the SUPPLY CHAIN provenance chain
  // NOTE: This does NOT walk transaction lifecycle chains
  // It only follows componentCredentials to show which component products were used
  // Each CID in componentCredentials should be the final delivered VC of that component
  const buildChain = async (vc, cid, depth = 0, isRoot = false) => {
    if (depth > 10) {
      // Prevent infinite recursion
      return { cid, vc, verification: { verified: false, error: "Max depth reached" }, components: [] };
    }

    const verification = verifyVC(vc, isRoot);
    
    // Get component VCs from componentCredentials (supply chain, NOT transaction lifecycle)
    const componentCids = Array.isArray(vc?.credentialSubject?.componentCredentials)
      ? vc.credentialSubject.componentCredentials
      : [];

    // Fetch all component VCs (these should be final delivered VCs)
    const componentPromises = componentCids.map((compCid) => fetchVC(compCid));
    const componentResults = await Promise.all(componentPromises);

    // Recursively build chains for each component (following their componentCredentials)
    const componentChains = await Promise.all(
      componentResults.map((result) => {
        if (result.vc) {
          // Recursively follow componentCredentials (supply chain), NOT previousCredential (transaction lifecycle)
          // Components are not root, so isRoot = false
          return buildChain(result.vc, result.cid, depth + 1, false);
        }
        return {
          cid: result.cid,
          vc: null,
          verification: { verified: false, error: result.error },
          components: [],
        };
      })
    );

    return {
      cid,
      vc,
      verification,
      components: componentChains,
    };
  };

  // Load the provenance chain
  // NOTE: This shows SUPPLY CHAIN provenance (component products), NOT transaction lifecycle
  // Each CID in componentCredentials should be the final delivered VC of that component product
  useEffect(() => {
    const loadChain = async () => {
      if (!vc || !cid) {
        setError("No VC or CID provided");
        setLoading(false);
        return;
      }

      // Verify this is a delivered VC (has both seller and buyer signatures)
      const proofs = vc.proof || [];
      const hasIssuerProof = proofs.some((p) => p.role === "seller" || p.role === "issuer");
      const hasHolderProof = proofs.some((p) => p.role === "holder" || p.role === "buyer");
      const isDelivered = hasIssuerProof && hasHolderProof;

      // Check if there are component credentials
      const componentCids = Array.isArray(vc?.credentialSubject?.componentCredentials)
        ? vc.credentialSubject.componentCredentials
        : [];

      // For supply chain provenance, we can show the tree even if not delivered
      // The tree shows component products, which is useful for buyers before purchase
      if (!isDelivered && componentCids.length === 0) {
        // No components and not delivered - show informational message
        setError(null);
        setChainData({
          cid,
          vc,
          verification: { verified: true, isDelivered: false, productName: vc.credentialSubject?.productName || "Unknown" },
          components: [],
        });
        setLoading(false);
        return;
      }

      // If there are components, show the tree even if not delivered
      // This allows buyers to see the supply chain before purchasing

      try {
        setLoading(true);
        setError(null);
        // Root product gets isRoot = true so it can use currentProductState for accurate status
        const chain = await buildChain(vc, cid, 0, true);
        setChainData(chain);
        // Auto-expand the root node
        setExpandedNodes(new Set([cid]));
      } catch (err) {
        console.error("Error loading provenance chain:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadChain();
  }, [vc, cid, currentProductState]);

  // Toggle node expansion
  const toggleNode = (nodeCid) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeCid)) {
        next.delete(nodeCid);
      } else {
        next.add(nodeCid);
      }
      return next;
    });
  };

  // Render a single node in the tree
  const renderNode = (node, level = 0) => {
    const isExpanded = expandedNodes.has(node.cid);
    const hasComponents = node.components && node.components.length > 0;
    const indent = level * 24;

    return (
      <div key={node.cid} style={{ marginLeft: `${indent}px` }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0.5rem",
            marginBottom: "0.25rem",
            backgroundColor: level === 0 ? "#e3f2fd" : "#f5f5f5",
            border: `1px solid ${level === 0 ? "#2196f3" : "#ddd"}`,
            borderRadius: "4px",
            cursor: hasComponents ? "pointer" : "default",
          }}
          onClick={() => hasComponents && toggleNode(node.cid)}
        >
          {/* Expand/Collapse Icon */}
          {hasComponents ? (
            isExpanded ? (
              <ChevronDown size={16} style={{ marginRight: "0.5rem" }} />
            ) : (
              <ChevronRight size={16} style={{ marginRight: "0.5rem" }} />
            )
          ) : (
            <div style={{ width: "16px", marginRight: "0.5rem" }} />
          )}

          {/* Verification Status */}
          {node.verification.verified ? (
            node.verification.statusInfo?.status === "Delivered" ? (
              <CheckCircle2 size={16} color="#28a745" style={{ marginRight: "0.5rem" }} />
            ) : node.verification.statusInfo?.status === "In Delivery" ? (
              <CheckCircle2 size={16} color="#004085" style={{ marginRight: "0.5rem" }} />
            ) : node.verification.statusInfo?.status === "Awaiting Transporter" ? (
              <AlertTriangle size={16} color="#856404" style={{ marginRight: "0.5rem" }} />
            ) : node.verification.statusInfo?.status === "Awaiting Confirm" ? (
              <AlertTriangle size={16} color="#856404" style={{ marginRight: "0.5rem" }} />
            ) : (
              <CheckCircle2 size={16} color="#6c757d" style={{ marginRight: "0.5rem" }} />
            )
          ) : (
            <XCircle size={16} color="#dc3545" style={{ marginRight: "0.5rem" }} />
          )}

          {/* Product Name */}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "bold" }}>
              {node.verification.productName || "Unknown Product"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#666", fontFamily: "monospace" }}>
              <Copyable value={node.cid} />
            </div>
          </div>

          {/* Status Badge */}
          <div style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>
            {node.verification.verified ? (
              node.verification.statusInfo ? (
                <span 
                  style={{ 
                    color: node.verification.statusInfo.color,
                    backgroundColor: node.verification.statusInfo.bgColor,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontWeight: "500"
                  }}
                >
                  {node.verification.statusInfo.label}
                </span>
              ) : (
                node.verification.isDelivered ? (
                  <span style={{ color: "#28a745" }}>✅ Delivered</span>
                ) : (
                  <span style={{ color: "#ffc107" }}>⚠️ Not Delivered</span>
                )
              )
            ) : (
              <span style={{ color: "#dc3545" }}>❌ Invalid</span>
            )}
            {hasComponents && (
              <span style={{ marginLeft: "0.5rem", color: "#666" }}>
                ({node.components.length} component{node.components.length !== 1 ? "s" : ""})
              </span>
            )}
          </div>
        </div>

        {/* Component Children */}
        {hasComponents && isExpanded && (
          <div style={{ marginTop: "0.25rem" }}>
            {node.components.map((component) => renderNode(component, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <Loader2 className="animate-spin" size={24} style={{ margin: "0 auto" }} />
        <div style={{ marginTop: "1rem" }}>Loading provenance chain...</div>
      </div>
    );
  }

  if (error) {
    // Check if it's an informational message (not an error)
    if (error.includes("will be available")) {
      return (
        <div style={{ padding: "2rem", textAlign: "center", color: "#856404", backgroundColor: "#fff3cd", borderRadius: "8px", border: "1px solid #ffc107" }}>
          <AlertTriangle size={24} style={{ margin: "0 auto", color: "#856404" }} />
          <div style={{ marginTop: "1rem", fontWeight: "500" }}>{error}</div>
        </div>
      );
    }
    // Actual error
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#dc3545" }}>
        <XCircle size={24} style={{ margin: "0 auto" }} />
        <div style={{ marginTop: "1rem" }}>Error loading provenance chain: {error}</div>
      </div>
    );
  }

  if (!chainData) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
        No provenance data available
      </div>
    );
  }

  const hasComponents = chainData.components && chainData.components.length > 0;

  return (
    <div style={{ padding: "1rem" }}>
      <h4 style={{ marginBottom: "1rem", fontWeight: "bold" }}>
        🔗 Supply Chain Provenance Chain
      </h4>
      
      {!hasComponents ? (
        <div style={{ padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px", color: "#666" }}>
          {chainData.verification.isDelivered ? (
            <p>This product has no component products. It is a raw material or base component.</p>
          ) : (
            <p>
              <strong>No component products</strong> — This product has no component products linked. 
              {chainData.verification.isDelivered 
                ? "" 
                : " Supply chain provenance will be available once the product is delivered."}
            </p>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "1rem", fontSize: "0.875rem", color: "#666" }}>
            Click on nodes to expand/collapse. The tree shows all component products and their components recursively.
          </div>
          {renderNode(chainData)}
        </>
      )}

      {/* Summary */}
      <div style={{ marginTop: "1.5rem", padding: "1rem", backgroundColor: "#f0f9ff", borderRadius: "4px" }}>
        <div style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>Chain Summary:</div>
        <div style={{ fontSize: "0.875rem" }}>
          • Total components: {countTotalComponents(chainData)}
          <br />
          • Verified components: {countVerifiedComponents(chainData)}
          <br />
          • Delivered components: {countDeliveredComponents(chainData)}
        </div>
      </div>
    </div>
  );
};

// Helper functions to count components
const countTotalComponents = (node) => {
  if (!node.components || node.components.length === 0) return 0;
  return (
    node.components.length +
    node.components.reduce((sum, comp) => sum + countTotalComponents(comp), 0)
  );
};

const countVerifiedComponents = (node) => {
  if (!node.components || node.components.length === 0) return 0;
  let count = node.components.filter((comp) => comp.verification.verified).length;
  node.components.forEach((comp) => {
    count += countVerifiedComponents(comp);
  });
  return count;
};

const countDeliveredComponents = (node) => {
  if (!node.components || node.components.length === 0) return 0;
  let count = node.components.filter(
    (comp) => comp.verification.verified && comp.verification.isDelivered
  ).length;
  node.components.forEach((comp) => {
    count += countDeliveredComponents(comp);
  });
  return count;
};

export default ProvenanceChainViewer;


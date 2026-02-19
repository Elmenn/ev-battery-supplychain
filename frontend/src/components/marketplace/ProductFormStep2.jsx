import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const extractAddressFromDid = (did) => {
  if (!did || typeof did !== "string") return null;
  const parts = did.split(":");
  const last = parts[parts.length - 1];
  return last || null;
};

const ProductFormStep2 = ({ onNext, currentUser }) => {
  const [formData, setFormData] = useState({
    batch: "",
    quantity: 1,
    certificateName: "",
    certificateCid: "",
    usesComponents: false,
    componentCredentials: [],
  });

  const [componentVCs, setComponentVCs] = useState([]);
  const [componentCidInput, setComponentCidInput] = useState("");
  const [verifyingComponent, setVerifyingComponent] = useState(false);

  const normalizedCurrentUser = useMemo(
    () => (currentUser ? currentUser.toLowerCase() : null),
    [currentUser]
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const isValidCID = (cid) => {
    if (!cid || typeof cid !== "string") return false;
    const cidV0Pattern = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const cidV1Pattern = /^[bBzZ][a-zA-Z0-9]{58,}$/;
    return cidV0Pattern.test(cid) || cidV1Pattern.test(cid);
  };

  const fetchAndVerifyComponentVC = async (cid) => {
    try {
      setVerifyingComponent(true);

      if (!isValidCID(cid)) {
        throw new Error("Invalid IPFS CID format. Please check the CID and try again.");
      }

      const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch VC from IPFS: ${response.status}`);
      }
      const vc = await response.json();

      if (!vc["@context"] || !vc.type || !vc.credentialSubject) {
        throw new Error("Invalid VC structure");
      }

      const productName = vc.credentialSubject?.productName || "Unknown Product";

      // Governance check: previous VC holder must equal connected seller wallet.
      const holderDid = vc?.holder?.id || null;
      const holderAddress = extractAddressFromDid(holderDid);
      const normalizedHolder = holderAddress ? holderAddress.toLowerCase() : null;

      let governanceVerified = true;
      let governanceError = null;

      if (!normalizedCurrentUser) {
        governanceVerified = false;
        governanceError = "Connected wallet not detected. Reconnect wallet before linking components.";
      } else if (!normalizedHolder || normalizedHolder === ZERO_ADDRESS) {
        governanceVerified = false;
        governanceError = "Component VC holder is not assigned yet (T.B.D./zero address).";
      } else if (normalizedHolder !== normalizedCurrentUser) {
        governanceVerified = false;
        governanceError = `Component holder ${holderAddress} does not match your wallet ${currentUser}.`;
      }

      return {
        cid,
        vc,
        productName,
        verified: true,
        governanceVerified,
        governanceError,
        error: null,
      };
    } catch (error) {
      console.error("Error fetching/verifying component VC:", error);
      return {
        cid,
        vc: null,
        productName: "Unknown",
        verified: false,
        governanceVerified: false,
        governanceError: null,
        error: error.message,
      };
    } finally {
      setVerifyingComponent(false);
    }
  };

  const handleAddComponent = async () => {
    if (!componentCidInput.trim()) {
      toast.error("Please enter a component VC CID");
      return;
    }

    if (!isValidCID(componentCidInput.trim())) {
      toast.error("Invalid IPFS CID format. Please check the CID and try again.");
      return;
    }

    const cid = componentCidInput.trim();

    if (formData.componentCredentials.includes(cid)) {
      toast.error("This component VC is already added");
      return;
    }

    toast.loading(`Fetching and verifying component VC: ${cid.slice(0, 12)}...`);
    const result = await fetchAndVerifyComponentVC(cid);

    if (result.verified) {
      setFormData((prev) => ({
        ...prev,
        componentCredentials: [...prev.componentCredentials, cid],
      }));

      setComponentVCs((prev) => [...prev, result]);

      toast.dismiss();
      if (!result.governanceVerified) {
        toast.error(`Governance check failed for "${result.productName}": ${result.governanceError}`);
      } else {
        toast.success(`Component "${result.productName}" verified`);
      }
    } else {
      toast.dismiss();
      toast.error(`Failed to verify component VC: ${result.error}`);
      setFormData((prev) => ({
        ...prev,
        componentCredentials: [...prev.componentCredentials, cid],
      }));
      setComponentVCs((prev) => [
        ...prev,
        {
          cid,
          productName: "Unknown",
          verified: false,
          governanceVerified: false,
          governanceError: null,
          error: result.error,
        },
      ]);
    }

    setComponentCidInput("");
  };

  const handleRemoveComponent = (index) => {
    setFormData((prev) => ({
      ...prev,
      componentCredentials: prev.componentCredentials.filter((_, i) => i !== index),
    }));
    setComponentVCs((prev) => prev.filter((_, i) => i !== index));
    toast.success("Component removed");
  };

  const handleNext = () => {
    const governanceMismatch = componentVCs.find(
      (comp) => comp.verified && comp.governanceVerified === false
    );
    if (governanceMismatch) {
      toast.error(`Cannot continue: governance mismatch for component "${governanceMismatch.productName}".`);
      return;
    }

    onNext(formData);
  };

  return (
    <div className="form-step">
      <h3>Step 2: Product Details</h3>

      <div className="form-group">
        <label>Batch ID (optional)</label>
        <input
          type="text"
          name="batch"
          value={formData.batch}
          onChange={handleChange}
          placeholder="e.g. BX-001"
        />
      </div>

      <div className="form-group">
        <label>Quantity</label>
        <input
          type="number"
          name="quantity"
          value={formData.quantity}
          onChange={handleChange}
          min="1"
        />
      </div>

      <div className="form-group">
        <label>Certification Name (optional)</label>
        <input
          type="text"
          name="certificateName"
          value={formData.certificateName}
          onChange={handleChange}
          placeholder="e.g. Recycled Material Verified"
        />
      </div>

      <div className="form-group">
        <label>Certification IPFS CID (optional)</label>
        <input
          type="text"
          name="certificateCid"
          value={formData.certificateCid}
          onChange={handleChange}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && !isValidCID(value)) {
              toast.error("Invalid IPFS CID format for certificate");
            }
          }}
          placeholder="Qm..."
        />
      </div>

      <div className="form-group" style={{ marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid #ddd" }}>
        <label style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>
          Component Products (Optional)
        </label>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              name="usesComponents"
              checked={formData.usesComponents}
              onChange={handleChange}
            />
            <span>This product is assembled from other products</span>
          </label>
          <div style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
            Add IPFS CIDs of component VCs to establish supply chain provenance.
          </div>
        </div>

        {formData.usesComponents && (
          <div>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input
                type="text"
                value={componentCidInput}
                onChange={(e) => setComponentCidInput(e.target.value)}
                placeholder="Qm... (Component VC IPFS CID)"
                style={{ flex: 1 }}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddComponent();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddComponent}
                disabled={verifyingComponent || !componentCidInput.trim()}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: verifyingComponent ? "not-allowed" : "pointer",
                }}
              >
                {verifyingComponent ? "Verifying..." : "Add"}
              </button>
            </div>

            {componentVCs.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                {componentVCs.map((comp, index) => {
                  const isGreen = comp.verified && comp.governanceVerified !== false;
                  return (
                    <div
                      key={index}
                      style={{
                        padding: "0.75rem",
                        marginBottom: "0.5rem",
                        backgroundColor: isGreen ? "#f0f9ff" : "#fff3cd",
                        border: `1px solid ${isGreen ? "#b3d9ff" : "#ffc107"}`,
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "bold" }}>{comp.productName || "Unknown Product"}</div>
                        <div style={{ fontSize: "0.875rem", color: "#666", fontFamily: "monospace" }}>
                          {comp.cid.slice(0, 20)}...
                        </div>
                        <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
                          {comp.verified && comp.governanceVerified !== false ? (
                            <span style={{ color: "#28a745" }}>
                              Verified
                            </span>
                          ) : comp.verified && comp.governanceVerified === false ? (
                            <span style={{ color: "#dc3545" }}>
                              Governance mismatch: {comp.governanceError}
                            </span>
                          ) : (
                            <span style={{ color: "#dc3545" }}>
                              Verification failed: {comp.error}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveComponent(index)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#dc3545",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {componentVCs.length === 0 && (
              <div style={{ fontSize: "0.875rem", color: "#666", fontStyle: "italic" }}>
                No component VCs added yet. Add component VC CIDs above.
              </div>
            )}
          </div>
        )}
      </div>

      <button className="button" onClick={handleNext}>
        Next
      </button>
    </div>
  );
};

export default ProductFormStep2;

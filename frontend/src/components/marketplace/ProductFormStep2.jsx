import React, { useState } from "react";
import toast from "react-hot-toast";

const ProductFormStep2 = ({ onNext }) => {
  const [formData, setFormData] = useState({
    batch: "",
    quantity: 1,
    certificateName: "",
    certificateCid: "",
    usesComponents: false,
    componentCredentials: [],
  });

  const [componentVCs, setComponentVCs] = useState([]); // Store full VC objects for display
  const [componentCidInput, setComponentCidInput] = useState("");
  const [verifyingComponent, setVerifyingComponent] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Fetch and verify a component VC from IPFS
  const fetchAndVerifyComponentVC = async (cid) => {
    try {
      setVerifyingComponent(true);
      const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch VC from IPFS: ${response.status}`);
      }
      const vc = await response.json();

      // Basic validation
      if (!vc["@context"] || !vc.type || !vc.credentialSubject) {
        throw new Error("Invalid VC structure");
      }

      // Extract product name
      const productName = vc.credentialSubject?.productName || "Unknown Product";

      // Check if it's a delivered VC (has both issuer and holder proofs)
      const proofs = vc.proof || [];
      const hasIssuerProof = proofs.some((p) => p.role === "seller" || p.role === "issuer");
      const hasHolderProof = proofs.some((p) => p.role === "holder" || p.role === "buyer");
      const isDelivered = hasIssuerProof && hasHolderProof;

      return {
        cid,
        vc,
        productName,
        verified: true,
        isDelivered,
        error: null,
      };
    } catch (error) {
      console.error("Error fetching/verifying component VC:", error);
        return {
          cid,
          vc: null,
          productName: "Unknown",
          verified: false,
          isDelivered: false,
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

    const cid = componentCidInput.trim();

    // Check if already added
    if (formData.componentCredentials.includes(cid)) {
      toast.error("This component VC is already added");
      return;
    }

    toast.loading(`Fetching and verifying component VC: ${cid.slice(0, 12)}...`);
    const result = await fetchAndVerifyComponentVC(cid);

    if (result.verified) {
      // Add to component credentials
      setFormData((prev) => ({
        ...prev,
        componentCredentials: [...prev.componentCredentials, cid],
      }));

      // Store full VC for display
      setComponentVCs((prev) => [...prev, result]);

      toast.dismiss();
      if (result.isDelivered) {
        toast.success(`✅ Component "${result.productName}" verified (Delivered)`);
      } else {
        toast.success(`⚠️ Component "${result.productName}" fetched (Not delivered)`);
      }
    } else {
      toast.dismiss();
      toast.error(`Failed to verify component VC: ${result.error}`);
      // Still allow adding with warning
      setFormData((prev) => ({
        ...prev,
        componentCredentials: [...prev.componentCredentials, cid],
      }));
      setComponentVCs((prev) => [
        ...prev,
        { cid, productName: "Unknown", verified: false, error: result.error },
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
          placeholder="Qm..."
        />
      </div>

      {/* Component Products Section */}
      <div className="form-group" style={{ marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid #ddd" }}>
        <label style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>
          🔗 Component Products (Optional)
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
            {/* Component Input */}
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

            {/* Component List */}
            {componentVCs.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                {componentVCs.map((comp, index) => (
                  <div
                    key={index}
                    style={{
                      padding: "0.75rem",
                      marginBottom: "0.5rem",
                      backgroundColor: comp.verified ? "#f0f9ff" : "#fff3cd",
                      border: `1px solid ${comp.verified ? "#b3d9ff" : "#ffc107"}`,
                      borderRadius: "4px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold" }}>
                        {comp.productName || "Unknown Product"}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#666", fontFamily: "monospace" }}>
                        {comp.cid.slice(0, 20)}...
                      </div>
                      <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
                        {comp.verified ? (
                          <span style={{ color: "#28a745" }}>
                            ✅ Verified {comp.isDelivered ? "(Delivered)" : "(Not delivered)"}
                          </span>
                        ) : (
                          <span style={{ color: "#dc3545" }}>
                            ⚠️ Verification failed: {comp.error}
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
                ))}
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

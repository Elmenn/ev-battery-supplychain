import React, { useState } from "react";
import ProductFormStep1 from "./ProductFormStep1";
import ProductFormStep2 from "./ProductFormStep2";
import ProductFormStep3 from "./ProductFormStep3";
import ProductFormStep4 from "./ProductFormStep4";

const ProductFormWizard = ({ provider, backendUrl }) => {
  const [step, setStep] = useState(1);
  const [step1Data, setStep1Data] = useState(null);
  const [step2Data, setStep2Data] = useState(null);
  const [step3Data, setStep3Data] = useState(null);

  const goToNext = (data) => {
    if (step === 1) setStep1Data(data);
    if (step === 2) setStep2Data(data);
    if (step === 3) setStep3Data(data);
    setStep((prev) => prev + 1);
  };

  const currentStepComponent = () => {
    switch (step) {
      case 1:
        return <ProductFormStep1 onNext={goToNext} />;
      case 2:
        return <ProductFormStep2 onNext={goToNext} />;
      case 3:
        return (
          <ProductFormStep3
            onNext={goToNext}
            productData={{ ...step1Data, ...step2Data }}
            provider={provider}
            backendUrl={backendUrl}
          />
        );
      case 4:
        return <ProductFormStep4 resultData={step3Data} />;
      default:
        return <div>Unknown step</div>;
    }
  };

  return (
    <div className="product-form-wizard">
      <h2>Create Product & Credential</h2>
      {currentStepComponent()}
    </div>
  );
};

export default ProductFormWizard;

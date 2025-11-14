import React, { useState } from "react";
import ProductFormStep1 from "./ProductFormStep1";
import ProductFormStep2 from "./ProductFormStep2";
import ProductFormStep2_5_Railgun from "./ProductFormStep2_5_Railgun";
import ProductFormStep3 from "./ProductFormStep3";
import ProductFormStep4 from "./ProductFormStep4";

const ProductFormWizard = ({ provider, backendUrl, currentUser }) => {
  const [step, setStep] = useState(1);
  const [step1Data, setStep1Data] = useState(null);
  const [step2Data, setStep2Data] = useState(null);
  const [step2_5Data, setStep2_5Data] = useState(null);
  const [step3Data, setStep3Data] = useState(null);

  const goToNext = (data) => {
    console.log('🔍 ProductFormWizard goToNext called:', {
      currentStep: step,
      dataReceived: data
    });
    
    if (step === 1) setStep1Data(data);
    if (step === 2) setStep2Data(data);
    if (step === 2.5) setStep2_5Data(data);
    if (step === 3) setStep3Data(data);
    
    // Handle step progression with 2.5 step
    if (step === 2) {
      console.log('🔄 Moving from step 2 to step 2.5');
      setStep(2.5); // Go to Railgun step after step 2
    } else if (step === 2.5) {
      console.log('🔄 Moving from step 2.5 to step 3');
      setStep(3); // Go to step 3 after Railgun step
    } else {
      console.log('🔄 Moving from step', step, 'to step', step + 1);
      setStep((prev) => prev + 1);
    }
  };

  const currentStepComponent = () => {
    switch (step) {
      case 1:
        return <ProductFormStep1 onNext={goToNext} />;
      case 2:
        return <ProductFormStep2 onNext={goToNext} />;
      case 2.5:
        return (
          <ProductFormStep2_5_Railgun
            onNext={goToNext}
            productData={{ ...step1Data, ...step2Data }}
            currentUser={currentUser}
            backendUrl={backendUrl}
          />
        );
      case 3:
        return (
          <ProductFormStep3
            onNext={goToNext}
            productData={{ ...step1Data, ...step2Data, ...step2_5Data }}
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

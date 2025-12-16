// CRITICAL: Import order matters!
// 1. Bootstrap: Patch NETWORK_CONFIG BEFORE any Railgun code runs
//    This ensures SDK functions using networkName can find Sepolia config
import './lib/railgun-bootstrap.js';

// 2. New Railgun structure (TypeScript files - will be converted to JS)
//    Note: For now, we'll load these on-demand or convert to JS
// import './lib/railgun'; // TODO: Convert TS to JS first

// 4. React and app code
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

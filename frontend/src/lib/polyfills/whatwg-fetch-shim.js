/**
 * Shim for @whatwg-node/fetch that uses window.fetch
 * This ensures GraphQL Mesh uses window.fetch (which has our override) 
 * instead of @whatwg-node/fetch's native implementation
 */

// Use window.fetch if available, otherwise fall back to global fetch
const fetchImpl = typeof window !== 'undefined' && window.fetch 
  ? window.fetch.bind(window)
  : (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof global !== 'undefined' && global.fetch);

// Export fetch function that uses window.fetch (which has our override)
export const fetch = function(...args) {
  // Log all fetch calls for debugging
  if (typeof window !== 'undefined' && window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__) {
    const url = args[0]?.toString() || '';
    if (url.includes('rail-squid.squids.live/squid-railgun-eth-sepolia-v2')) {
      console.log('[whatwg-fetch-shim] 🚨 Intercepting fetch call:', url);
      console.log('[whatwg-fetch-shim] 🚨 Using window.fetch which should have override');
    }
  }
  return fetchImpl(...args);
};

// Re-export all other fetch-related exports from global scope
// This matches what @whatwg-node/fetch exports
const global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});

export const Request = global.Request;
export const Response = global.Response;
export const Headers = global.Headers;
export const FormData = global.FormData;
export const AbortSignal = global.AbortSignal;
export const AbortController = global.AbortController;
export const ReadableStream = global.ReadableStream;
export const WritableStream = global.WritableStream;
export const TransformStream = global.TransformStream;
export const Blob = global.Blob;
export const File = global.File;
export const crypto = global.crypto;
export const btoa = global.btoa;
export const TextDecoder = global.TextDecoder;
export const TextEncoder = global.TextEncoder;
export const URL = global.URL;
export const URLSearchParams = global.URLSearchParams;

// Default export
export default fetch;

console.log('[whatwg-fetch-shim] ✅ Loaded - will use window.fetch for all requests');



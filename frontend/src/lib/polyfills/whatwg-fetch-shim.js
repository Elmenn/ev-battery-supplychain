// Minimal WHATWG fetch shim for Railgun GraphQL Mesh runtime in browser builds.
// Some dependency code resolves this absolute path through webpack aliases.

if (typeof window !== 'undefined' && typeof globalThis !== 'undefined') {
  if (!globalThis.fetch && window.fetch) {
    globalThis.fetch = window.fetch.bind(window);
  }
  if (!globalThis.Headers && window.Headers) {
    globalThis.Headers = window.Headers;
  }
  if (!globalThis.Request && window.Request) {
    globalThis.Request = window.Request;
  }
  if (!globalThis.Response && window.Response) {
    globalThis.Response = window.Response;
  }
}

export default globalThis.fetch;

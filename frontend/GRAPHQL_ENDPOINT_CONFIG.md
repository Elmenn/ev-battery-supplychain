# GraphQL Endpoint Configuration - File Reference

This document lists all files responsible for directing the frontend to the correct GraphQL endpoint.

## 📋 Files Overview

### 1. **`public/index.html`** (Entry Point)
**Purpose**: Sets the override URL before any JavaScript loads
- **Line 40**: Sets `window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__ = 'http://localhost:4000/graphql'`
- **Why**: Ensures the override is available immediately when the app starts

### 2. **`src/lib/railgunV2SepoliaClient.js`** (Primary Override Logic)
**Purpose**: Implements the `window.fetch` interception mechanism
- **Lines 20-57**: Sets up `window.fetch` override to redirect GraphQL requests
  - Checks for `REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL` env var
  - Checks for `window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__`
  - Monkey-patches `window.fetch` to intercept requests to the default endpoint
- **Lines 62-90**: `window.RGV2.setSubgraphOverride(url)` function
  - Allows runtime override of the endpoint
  - Clears mesh cache when called
- **Lines 93-110**: `window.RGV2.clearMeshCache(networkName)` function
  - Clears GraphQL Mesh cache to force recreation
- **Lines 5994-6009**: Pre-sync cache clearing
  - Clears mesh cache before `syncRailgunTransactionsV2` runs
  - Verifies `window.fetch` override is active

### 3. **`src/lib/quick-sync/V2/graphql/.graphclientrc.yaml`** (GraphQL Mesh Config)
**Purpose**: Configuration file for GraphQL Mesh codegen
- **Line 22**: `endpoint: http://localhost:4000/graphql` (for sepolia)
- **Note**: This is used during build time to generate TypeScript types

### 4. **`src/lib/quick-sync/V2/graphql/index.ts`** (Generated GraphQL Mesh)
**Purpose**: Generated GraphQL Mesh client code
- **Lines 3161-3165**: Checks for override in `getMeshOptions()`
  - Logs if override is detected
- **Line 3231**: Hardcoded default endpoint in `sepoliaHandler` config
  - Default: `"https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql"`
- **⚠️ Warning**: This file is **generated** - changes may be overwritten

### 5. **`src/lib/quick-sync/V2/quick-sync-events-graph-v2.ts`** (Mesh Cache Management)
**Purpose**: Manages GraphQL Mesh instance and cache
- **Lines 165-208**: `getBuiltGraphClient()` function
  - **Lines 173-174**: Checks for override URL
  - **Lines 182-191**: Clears cached mesh if override is detected
  - **Lines 206**: Calls `getMeshOptions()` to create new mesh
- **Lines 210-220**: `getBuiltGraphSDK()` function
  - Creates SDK client using `getBuiltGraphClient()`

## 🔄 Flow Diagram

```
1. index.html
   └─> Sets window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__ = 'http://localhost:4000/graphql'

2. railgunV2SepoliaClient.js (module load)
   └─> Sets up window.fetch override
   └─> Intercepts requests to default endpoint
   └─> Redirects to override URL

3. syncRailgunTransactionsV2() called
   └─> railgunV2SepoliaClient.js (lines 5994-6009)
       └─> Clears GraphQL Mesh cache
       └─> Verifies window.fetch override

4. SDK calls quickSyncRailgunTransactionsV2()
   └─> quick-sync-events-graph-v2.ts
       └─> getBuiltGraphClient() called
           └─> Checks for override (lines 173-174)
           └─> Clears mesh cache if override found (lines 182-191)
           └─> Calls getMeshOptions() to create new mesh

5. graphql/index.ts
   └─> getMeshOptions() called
       └─> Checks for override (lines 3161-3165)
       └─> Creates sepoliaHandler with default endpoint
           └─> window.fetch override intercepts requests

6. GraphQL Request
   └─> window.fetch intercepts (railgunV2SepoliaClient.js line 41-48)
       └─> Redirects to http://localhost:4000/graphql
```

## 🎯 Priority Order

1. **`window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__`** (set in `index.html`)
2. **`REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL`** (environment variable)
3. **Default**: `https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql`

## 🔧 Troubleshooting

### If requests still go to default endpoint:

1. **Check `index.html`**: Ensure override is set before app loads
2. **Check `window.fetch` override**: Run `window.fetch.toString()` in console - should contain "Intercepting GraphQL request"
3. **Clear mesh cache**: Run `window.RGV2.clearMeshCache('Sepolia')`
4. **Clear IndexedDB**: GraphQL Mesh may cache schema in IndexedDB
5. **Check Network tab**: Verify requests actually go to `localhost:4000`

## 📝 Notes

- The `window.fetch` override is the **primary mechanism** for redirecting requests
- GraphQL Mesh cache clearing ensures a fresh mesh instance
- The `.graphclientrc.yaml` file is used during build, but runtime override takes precedence
- The generated `graphql/index.ts` file should not be manually edited (it's regenerated)





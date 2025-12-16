# Subsquid/GraphQL Server Removal Summary

## 🎯 Goal
Remove all local Subsquid/GraphQL server code and references, always use the public Railgun endpoint.

## ✅ Completed Actions

### 1. Deleted `subsquid/` Directory
- **Deleted**: Entire `subsquid/` directory (~17,937 files)
  - `subsquid/railgun-sepolia-v2/` - Local Subsquid indexer
  - `subsquid/subsquid-integration/` - Integration code
- **Reason**: No longer maintaining a local GraphQL/Subsquid server

### 2. Removed localhost:4000 References

**Files Updated:**
- ✅ `frontend/public/index.html` - Removed comments about local Subsquid
- ✅ `frontend/src/lib/railgun-bootstrap.js` - Removed localhost:4000 interception logic
- ✅ `frontend/src/lib/railgunV2SepoliaClient.js` - Replaced all localhost:4000 fallbacks with public endpoint
- ✅ `frontend/src/lib/quick-sync/V2/graphql/index.ts` - Removed local Subsquid comment

### 3. Updated Endpoint References

**Changes:**
- All fallback endpoints changed from `http://localhost:4000/graphql` to `https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql`
- All debug messages and comments updated to reference "public Railgun endpoint" instead of "local Subsquid indexer"
- Code now always defaults to the public endpoint maintained by Railgun

## 📝 Endpoint Configuration

### Public Endpoint (Now Default)
- **URL**: `https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql`
- **Maintained by**: Railgun community
- **Status**: Always used unless `window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__` is set

### Override Mechanism (Still Supported)
The code still supports overrides via:
- `window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__` - Browser console override
- `REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL` - Environment variable (optional)

**Note**: Since we're always using the public endpoint, these overrides are rarely needed but kept for flexibility.

## 🔧 Files Modified

1. **frontend/public/index.html**
   - Removed comments about local Subsquid
   - Simplified comment to mention public Railgun endpoint

2. **frontend/src/lib/railgun-bootstrap.js**
   - Removed localhost:4000 interception logic
   - Simplified to only intercept public endpoint for override support

3. **frontend/src/lib/railgunV2SepoliaClient.js**
   - Replaced 11+ references to `localhost:4000/graphql`
   - Updated all fallback endpoints to use `DEFAULT_SEPOLIA_V2`
   - Updated debug messages and console logs

4. **frontend/src/lib/quick-sync/V2/graphql/index.ts**
   - Removed comment about local Subsquid
   - Updated to mention public Railgun endpoint

## 📊 Before vs After

### Before
- Local Subsquid server required (`http://localhost:4000/graphql`)
- Complex fallback logic for local vs public endpoints
- Comments referencing local development setup
- ~17,937 files in `subsquid/` directory

### After
- ✅ Always uses public Railgun endpoint
- ✅ Simplified endpoint configuration
- ✅ No local server setup required
- ✅ Cleaner codebase with no Subsquid dependencies

## 🎯 Benefits

1. **Simplified Setup**: No need to run local Subsquid server
2. **Always Up-to-Date**: Public endpoint is maintained by Railgun community
3. **Less Maintenance**: No need to sync/update local indexer
4. **Reduced Complexity**: Fewer code paths and configuration options
5. **Smaller Codebase**: Removed ~17,937 files from `subsquid/` directory

## ⚠️ Notes

- The override mechanism (`window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__` and `REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL`) is still supported but now defaults to the public endpoint
- All GraphQL queries now go to the public Railgun endpoint by default
- No breaking changes to the API - the application behavior remains the same, just using a different endpoint

## ✅ Verification

All localhost:4000 references have been removed from the frontend codebase. The application now exclusively uses the public Railgun GraphQL endpoint.


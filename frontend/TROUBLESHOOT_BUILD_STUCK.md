# Troubleshooting: Build Stuck at "Starting the development server..."

If webpack gets stuck after "Starting the development server..." for >10 minutes, try these steps:

## Step 1: Stop and Check for Errors

1. Stop the process (Ctrl+C)
2. Look for any error messages that appeared before it got stuck
3. Check the last few lines of output for clues

## Step 2: Clear Cache and Retry

```bash
# Clear webpack cache
rm -rf node_modules/.cache
rm -rf .cache

# Windows PowerShell:
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .cache -ErrorAction SilentlyContinue

# Then retry
npm start
```

## Step 3: Check for Memory Issues

Webpack might be running out of memory. Check Node.js memory:

```bash
# Increase Node memory limit
set NODE_OPTIONS=--max-old-space-size=4096
npm start
```

## Step 4: Verify npm overrides Didn't Break Anything

Check if `overrides` caused a dependency conflict:

```bash
npm ls @railgun-community/shared-models
```

Should show a single instance (deduped).

## Step 5: Temporarily Disable Source Maps

If still stuck, edit `config-overrides.js` line 68:
```javascript
config.devtool = false;  // Disable source maps (much faster)
```

Then restart.

## Step 6: Check for Circular Dependencies

Sometimes webpack gets stuck analyzing circular dependencies. Check console for warnings.

## Step 7: Last Resort - Simplified Build

Temporarily comment out the splitChunks configuration in `config-overrides.js`:

```javascript
// Temporarily disable to test
// config.optimization.splitChunks.cacheGroups['railgun-shared'] = { ... };
```

Then restart to see if that's causing the hang.








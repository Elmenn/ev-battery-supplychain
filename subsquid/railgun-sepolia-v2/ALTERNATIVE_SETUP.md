# Alternative Setup Using Subsquid CLI

If `npm install` fails with version errors, use the official Subsquid CLI:

## Step 1: Scaffold Fresh Project

```bash
# Install Subsquid CLI (if not already installed)
npm install -g @subsquid/cli

# Create new project from EVM template
cd ..
sqd init railgun-sepolia-v2-fresh --template evm
cd railgun-sepolia-v2-fresh
```

## Step 2: Copy Our Files

Copy these files from `railgun-sepolia-v2` to `railgun-sepolia-v2-fresh`:
- `schema.graphql` (our custom schema)
- `src/processor.ts` (our processor)
- `src/processor-config.ts` (our config)
- `.env` (environment variables)

## Step 3: Update Package Scripts

The scaffolded project will have correct versions. Just update the scripts in `package.json` if needed.

## Why This Works

The Subsquid CLI scaffolds projects with:
- ✅ Correct package versions
- ✅ Proper project structure
- ✅ All dependencies configured
- ✅ Working examples

Then we just replace the schema and processor with our custom ones.


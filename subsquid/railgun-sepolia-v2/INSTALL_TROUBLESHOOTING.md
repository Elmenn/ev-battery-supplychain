# Installation Troubleshooting

## If npm install fails with version errors:

1. **Try without version constraints** (let npm find latest):
   ```bash
   npm install @subsquid/evm-processor @subsquid/graphql-server @subsquid/typeorm-store --save
   ```

2. **Or use Subsquid CLI to scaffold** (recommended):
   ```bash
   npx sqd init railgun-sepolia-v2 --template evm
   ```
   This will create a project with correct versions.

3. **Check available versions**:
   ```bash
   npm view @subsquid/evm-processor versions --json
   ```

## Alternative: Use Subsquid CLI

If package versions continue to be an issue, use the official Subsquid CLI:

```bash
# Install Subsquid CLI globally
npm install -g @subsquid/cli

# Create new project from template
sqd init railgun-sepolia-v2 --template evm

# Then copy our schema.graphql and processor.ts
```


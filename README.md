# Filfox Verifier

A TypeScript CLI tool and Hardhat plugin for verifying smart contracts on Filfox, supporting both Foundry and Hardhat v2+ projects with backward compatibility. Filfox is the block explorer for Filecoin networks.

## Features

✅ **Multi-Framework Support**: Works with both Foundry and Hardhat v2+ projects  
✅ **Filecoin Networks**: Supports Filecoin mainnet (314) and Calibration testnet (314159)

#### Foundry

✅ **CLI Tool**: Command-line interface for Foundry projects  
✅ **Automatic Compilation**: Uses `forge build` for Foundry or Hardhat compilation artifacts

#### Hardhat

✅ **Hardhat Plugin**: Easy integration with Hardhat projects\
✅ **Backward Compatible**: Supports all Hardhat deployment methods and versions v2+  
✅ **Smart Detection**: Multi-fallback contract discovery (deployments → ignition → artifacts)

## Installation

### As a Global CLI Tool

```bash
npm install -g @fil-b/filfox-verifier
```

### In Your Project

```bash
npm install @fil-b/filfox-verifier
```

## Usage

### CLI Tool (Foundry Projects)

```bash
filfox-verifier forge <address> <contract-path> --chain <chainId>
```

**Example:**

```bash
# Verify contract on Filecoin mainnet
filfox-verifier forge 0xA148538a450f8517563135A5f7c4ee0a9F54f811 src/MyContract.sol:MyContract --chain 314

# Verify contract on Calibration testnet
filfox-verifier forge 0xA148538a450f8517563135A5f7c4ee0a9F54f811 src/MyContract.sol:MyContract --chain 314159
```

**Options:**

- `--chain <chainId>`: Chain ID (314 for Filecoin mainnet, 314159 for Calibration testnet)
- `--root <path>`: Project root directory (default: current directory)

### Hardhat Plugin

First, import the plugin in your `hardhat.config.js` or `hardhat.config.ts`:

```javascript
// hardhat.config.js
require("@fil-b/filfox-verifier/hardhat");

// or in hardhat.config.ts
import "@fil-b/filfox-verifier/hardhat";
```

Then run the verification task:

```bash
# Verify a deployed contract
npx hardhat verifyfilfox --address 0xYourContractAddress --network filecoin

# For Calibration testnet
npx hardhat verifyfilfox --address 0xYourContractAddress --network calibration
```

**Requirements for Hardhat:**

- The tool supports multiple deployment methods:
  - `hardhat-deploy` with artifacts in `./deployments/[network]/`
  - Ignition deployments with artifacts in `./ignition/deployments/`
  - Standard Hardhat compilation artifacts in `./artifacts/contracts/`
    - The tool automatically finds contracts by matching deployment addresses or bytecode

## Supported Networks

| Network             | Chain ID | Explorer                        |
| ------------------- | -------- | ------------------------------- |
| Filecoin Mainnet    | 314      | https://filfox.info             |
| Calibration Testnet | 314159   | https://calibration.filfox.info |

## How It Works

### For Foundry Projects

1. **Project Detection**: Detects Foundry projects by looking for `foundry.toml`
2. **Compilation**: Uses `forge build` to compile the target contract
3. **Metadata Extraction**: Extracts Solidity metadata from compilation artifacts
4. **Source Collection**: Gathers all source files including dependencies
5. **Verification**: Submits to Filfox API with proper formatting

### For Hardhat Projects

1. **Multi-Source Detection**: Automatically detects contracts through a robust fallback chain:
   - **Primary**: Hardhat deployments in `./deployments/[network]/`
   - **Secondary**: Ignition deployments in `./ignition/deployments/`
   - **Tertiary**: Artifacts directory with bytecode matching in `./artifacts/contracts/`
2. **Artifact Processing**: Extracts solc input and metadata from deployment artifacts or build info
3. **Source Preparation**: Organizes source files for verification
4. **Verification**: Submits to Filfox API with complete compilation data

This approach ensures compatibility across Hardhat v2+ and different deployment methods.

## Requirements

### For Foundry Projects

- Node.js 20+
- Foundry project with `foundry.toml`
- Forge installed and accessible in PATH

### For Hardhat Projects

- Node.js 20+
- Hardhat v2+ project (backward compatible)
- Contract deployed with one of the supported methods:
  - `hardhat-deploy` plugin
  - Ignition deployment modules
  - Standard Hardhat compilation

## API Response Handling

The tool handles all Filfox API response codes:

- **0**: ✅ Verification successful
- **1**: ⚠️ No source file provided
- **2**: ⚠️ Contract initCode not found
- **3**: ⚠️ Compiler version format incorrect
- **4**: ⚠️ Verification failed - bytecode mismatch
- **5**: ⚠️ Unsupported language (Solidity only)
- **6**: ℹ️ Contract already verified
- **7**: ⚠️ Compilation error in source files

## Example Output

```bash
$ filfox-verifier forge 0xA148538a450f8517563135A5f7c4ee0a9F54f811 src/DealClient.sol:DealClient --chain 314159

✔ Loading Foundry project...
✔ Compiling contract and extracting metadata...
✔ Preparing verification request...
✔ Verifying contract on Filfox...

✅ Contract "MyContract" verified successfully!
🔗 View at: https://calibration.filfox.info/en/address/0x9706B8591122eA8b22EF4cD2f796852BA540B7d2
```

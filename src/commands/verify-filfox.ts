import { Command } from "commander";
import chalk from "chalk";
import ora, { Ora } from "ora";
import { FoundryProject } from "../services/FoundryProject";
import { FilfoxVerifier } from "../services/filfox-verifier";

export const verifyFilfoxCommand = new Command()
  .name("forge")
  .description("Verify a smart contract on Filfox using Foundry")
  .argument("<address>", "Contract address to verify")
  .argument(
    "<contract>",
    "Contract path in format src/Contract.sol:ContractName"
  )
  .option(
    "--chain <chainId>",
    "Chain ID (314: Filecoin Mainnet, 314159: Filecoin Calibration Testnet)"
  )
  .option(
    "--root <path>",
    "Foundry project root directory that contains the contract to verify no need to specify if you are already in the project root directory",
    process.cwd()
  )
  .action(async (address: string, contract: string, options) => {
    // Validate chainId
    const validChainIds = ["314", "314159"];
    if (!validChainIds.includes(options.chain)) {
      console.error(chalk.red(`Invalid chain ID: ${options.chain}`));
      console.error(chalk.yellow("Valid options:"));
      console.error(chalk.yellow("  314    - Filecoin Mainnet"));
      console.error(chalk.yellow("  314159 - Filecoin Calibration Testnet"));
      process.exit(1);
    }
    const spinner = ora("Starting verification process...").start();

    try {
      const [contractPath, contractName] = contract.split(":");
      if (!contractPath || !contractName) {
        throw new Error(
          "Contract must be in format src/Contract.sol:ContractName"
        );
      }

      spinner.text = "Loading Foundry project...\n\n";
      const project = new FoundryProject(options.root);
      await project.initialize();

      spinner.text = "Compiling contract and extracting metadata...\n\n";
      const compilationResult = await project.compile(
        contractPath,
        contractName
      );

      spinner.text = "Preparing verification request...\n\n";
      const verifier = new FilfoxVerifier(options.chain);

      spinner.text = "Verifying contract on Filfox...\n\n";
      const result = await verifier.verify({
        address,
        language: "Solidity",
        compiler: compilationResult.metadata.compiler.version,
        optimize: compilationResult.metadata.settings.optimizer.enabled,
        optimizeRuns: compilationResult.metadata.settings.optimizer.runs,
        sourceFiles: Object.fromEntries(
          Object.entries(compilationResult.sourceFiles).map(
            ([filePath, content]) => [filePath, { content }]
          )
        ),
        license: "",
        evmVersion: compilationResult.metadata.settings.evmVersion,
        viaIR: compilationResult.metadata.settings.viaIR,
        libraries: "",
        metadata: compilationResult.metadata,
        optimizerDetails: "{}",
      });

      console.log(chalk.cyanBright("Verification Result:\n\n"));

      handleVerificationResult(result, options.chain, address, spinner);
    } catch (error: any) {
      spinner.fail(chalk.red("Verification failed with error:\n"));
      console.error(error);
      process.exit(1);
    }
  });

/**
 * Handles and displays verification results
 */
const handleVerificationResult = (
  result: any,
  chainId: number,
  address: string,
  spinner: Ora
): void => {
  const explorerUrls = {
    314159: "https://calibration.filfox.info/en/address/",
    314: "https://filfox.info/en/address/",
  };

  const explorerUrl = explorerUrls[chainId as keyof typeof explorerUrls];

  switch (result.errorCode) {
    case 0:
      spinner.succeed(
        `✅ Contract "${result.contractName}" verified successfully!`
      );
      spinner.succeed(`🔗 View at: ${explorerUrl}${address}`);
      break;
    case 1:
      spinner.fail("⚠️  Error: No source file provided.");
      break;
    case 2:
      spinner.fail("⚠️  Error: Contract initCode not found.");
      break;
    case 3:
      spinner.fail("⚠️  Error: Compiler version format incorrect.");
      spinner.fail("💡 Use long format (e.g., v0.7.6+commit.7338295f)");
      break;
    case 4:
      spinner.fail("⚠️  Error: Verification failed - bytecode mismatch.");
      spinner.fail("💡 Check source files and compiler settings.");
      break;
    case 5:
      spinner.fail("⚠️  Error: Unsupported language (Solidity only).");
      break;
    case 6:
      spinner.succeed(
        `ℹ️  Contract already verified at: ${explorerUrl}${address}`
      );
      break;
    case 7:
      spinner.fail("⚠️  Compilation error in source files.");
      spinner.fail(`📝 Details: ${result.errorMsg}`);
      break;
    default:
      spinner.fail("⚠️  Unknown verification error occurred.");
      break;
  }
};

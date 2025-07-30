import fs from "fs";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface SourceFile {
  content: string;
}

interface SolcInputData {
  language: string;
  sources: Record<string, SourceFile>;
  settings: {
    optimizer: {
      enabled: boolean;
      runs: number;
    };
    evmVersion: string;
    outputSelection: Record<string, Record<string, string[]>>;
    metadata: {
      useLiteralContent: boolean;
    };
    remappings: string[];
  };
}

interface DeploymentData {
  address: string;
  solcInputHash: string;
  metadata: string;
}

interface VerifyContractParams {
  address: string;
  chainId: number;
  network: string;
  deploymentsPath?: string;
}

export class FilfoxVerifier {
  private static readonly FILFOX_NETWORKS = {
    314: "https://filfox.info/api/v1/tools/verifyContract",
    314159: "https://calibration.filfox.info/api/v1/tools/verifyContract",
  };

  static async verifyContract(
    params: VerifyContractParams,
    hre?: HardhatRuntimeEnvironment
  ): Promise<void> {
    const {
      address,
      chainId,
      network,
      deploymentsPath = "./deployments",
    } = params;

    if (!this.FILFOX_NETWORKS[chainId as keyof typeof this.FILFOX_NETWORKS]) {
      throw new Error(
        "Use regular hardhat verification for networks other than calibration and filecoin"
      );
    }

    const verificationData = this.extractVerificationData(
      network,
      address,
      deploymentsPath,
      hre
    );

    const url =
      this.FILFOX_NETWORKS[chainId as keyof typeof this.FILFOX_NETWORKS];
    const headers = {
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(verificationData),
      });

      const result = await response.json();

      this.handleVerificationResult({
        result,
        network,
        address: verificationData.address,
      });
    } catch (error: any) {
      console.error("⚠️ Error verifying contract: ", error.cause);
      console.log(
        "Please contact us on [Telegram](https://t.me/Filfoxofficial) if you encounter this error."
      );
    }
  }

  private static extractVerificationData(
    network: string,
    address: string,
    deploymentsPath: string,
    hre?: HardhatRuntimeEnvironment
  ) {
    // Search for the contract name in the deployments/network directory for the address
    const deploymentFiles = fs
      .readdirSync(`${deploymentsPath}/${network}`)
      .filter((file) => file.endsWith(".json"));

    const contractFileName = deploymentFiles.find((fileName) => {
      try {
        const filePath = `${deploymentsPath}/${network}/${fileName}`;
        const deployment = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return deployment.address === address;
      } catch (error) {
        console.warn(
          `Warning: Could not read deployment file ${fileName}:`,
          error
        );
        return false;
      }
    });

    if (!contractFileName) {
      throw new Error(
        `No deployment file found for contract address ${address} in ${deploymentsPath}/${network}`
      );
    }

    // Extract contract name by removing .json extension
    const contractName = contractFileName.replace(".json", "");

    const deploymentPath = `${deploymentsPath}/${network}/${contractFileName}`;
    const deployments: DeploymentData = JSON.parse(
      fs.readFileSync(deploymentPath, "utf8")
    );

    const solcInputPath = `${deploymentsPath}/${network}/solcInputs/${deployments.solcInputHash}.json`;
    const solcInput: SolcInputData = JSON.parse(
      fs.readFileSync(solcInputPath, "utf8")
    );

    let sourceFiles = Object.keys(solcInput.sources).reduce(
      (acc: any, key: string) => {
        acc[key] = solcInput.sources[key];
        return acc;
      },
      {}
    );

    const contractToVerify = Object.keys(sourceFiles).find((key) =>
      key.includes(contractName + ".sol")
    );

    if (!contractToVerify) {
      throw new Error(
        `Contract ${contractName} not found in the sources provided.`
      );
    }

    const contractSource = sourceFiles[contractToVerify];
    delete sourceFiles[contractToVerify];
    sourceFiles = { [contractToVerify]: contractSource, ...sourceFiles };

    const { compiler, language } = JSON.parse(deployments.metadata) as {
      compiler: {
        version: string;
      };
      language: string;
      output: {
        abi: any[];
        devdoc: any;
        userdoc: any;
      };
    };

    const compilerVersion = "v" + compiler.version;
    const optimize = solcInput.settings.optimizer.enabled;
    const optimizeRuns = solcInput.settings.optimizer.runs;
    const license = "";
    const evmVersion = solcInput.settings.evmVersion ?? "default";
    const viaIR = hre
      ? !!(hre.userConfig.solidity as any)?.settings?.viaIR
      : false;
    const libraries = "";
    const metadata = solcInput.settings.metadata ?? "";
    return {
      address: deployments.address,
      language,
      compiler: compilerVersion,
      optimize,
      optimizeRuns,
      sourceFiles,
      license,
      evmVersion,
      viaIR,
      libraries,
      metadata,
      optimizerDetails: "",
    } as {
      address: string;
      language: string;
      compiler: string;
      optimize: boolean;
      optimizeRuns: number;
      sourceFiles: Record<string, SourceFile>;
      license: string;
      evmVersion: string;
      viaIR: boolean;
      libraries: string;
      metadata: any;
      optimizerDetails: string;
    };
  }

  private static handleVerificationResult({
    result,
    network,
    address,
  }: {
    result: any;
    network: string;
    address: string;
  }) {
    const explorerUrls = {
      calibration: "https://calibration.filfox.info/en/address/",
      filecoin: "https://filfox.info/en/address/",
    };

    const explorerUrl = explorerUrls[network as keyof typeof explorerUrls];

    switch (result.errorCode) {
      case 0:
        console.log(
          `✅ Your contract "${result.contractName}" is now verified.`
        );
        console.log("Check it out at: ");
        console.log(`${explorerUrl}${address}`);
        break;

      case 1:
        console.log("⚠️ Error: No source file was provided.");
        break;

      case 2:
        console.log("⚠️ Error: Contract initCode not found.");
        console.log(
          "Please contact us on [Telegram](https://t.me/Filfoxofficial) if you encounter this error."
        );
        break;

      case 3:
        console.log("⚠️ Error: Load remote compiler failed.");
        console.log("The compiler version string must be in the long format.");
        console.log(
          "For example, use v0.7.6+commit.7338295f instead of v0.7.6."
        );
        console.log(
          "Please try again later with the correct compiler version."
        );
        break;

      case 4:
        console.log(
          `⚠️ Error: Verify failed for contract "${result.contractName}".`
        );
        console.log("Compiled bytecode doesn't match the contract's initCode.");
        console.log(
          "Please make sure all source files and compiler configurations are correct."
        );
        break;

      case 5:
        console.log("⚠️ Error: Unsupported language.");
        console.log("Only Solidity is supported for now.");
        break;

      case 6:
        console.log("ℹ️ Your contract is already verified.");
        console.log("Check it out at:\n", `${explorerUrl}${address}`);
        break;

      case 7:
        console.log(
          "⚠️ Compilation error: Something is wrong with your source files."
        );
        console.log(`Error message: ${result.errorMsg}`);
        console.log("Please fix the issue and try again.");
        break;

      default:
        console.log("⚠️ Unknown error occurred during verification.");
        break;
    }
  }
}

interface VerifyFilfoxParams {
  address: string;
}

export const HardhatFilfoxVerifierTask = task(
  "verifyfilfox",
  "Verifies a contract on Filfox"
)
  .addParam("address", "The address of the contract to verify")
  .setAction(
    async (taskArgs: VerifyFilfoxParams, hre: HardhatRuntimeEnvironment) => {
      const networkName = hre.network.name;
      const chainId = hre.network.config.chainId;

      if (!chainId) {
        throw new Error("Chain ID not found");
      }

      const { address } = taskArgs;

      await FilfoxVerifier.verifyContract(
        {
          address,
          chainId,
          network: networkName,
        },
        hre
      );
    }
  );

export default FilfoxVerifier;

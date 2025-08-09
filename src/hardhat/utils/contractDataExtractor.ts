import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { DeploymentData, SolcInputData, VerificationRequest } from "../types";

export class ContractDataExtractor {
  public static async extractContractData(
    network: string,
    address: string,
    deploymentsPath: string,
    hre?: HardhatRuntimeEnvironment
  ) {
    try {
      return this.extractFromHardhatDeployments(
        network,
        address,
        deploymentsPath,
        hre
      );
    } catch (error) {
      // Hardhat deployments not found, trying using Ignition configuration fallback...
      try {
        return this.extractFromIgnitionDeployments(address, hre);
      } catch (ignitionError) {
        // Ignition deployments not found, trying using artifacts fallback...
        return await this.extractFromArtifacts(address, hre);
      }
    }
  }

  private static extractFromHardhatDeployments(
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
        return deployment.address?.toLowerCase() === address?.toLowerCase();
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
    } as VerificationRequest;
  }

  private static extractFromIgnitionDeployments(
    address: string,
    hre?: HardhatRuntimeEnvironment
  ) {
    const chainId = hre?.network.config.chainId;
    if (!chainId) {
      throw new Error("Chain ID not found for Ignition deployment extraction");
    }

    const ignitionPath = "./ignition/deployments";
    const chainFolderName = `chain-${chainId}`;
    const deployedAddressesPath = `${ignitionPath}/${chainFolderName}/deployed_addresses.json`;

    if (!fs.existsSync(deployedAddressesPath)) {
      throw new Error(
        `No Ignition deployments found at ${deployedAddressesPath}`
      );
    }

    const deployedAddresses = JSON.parse(
      fs.readFileSync(deployedAddressesPath, "utf8")
    );

    const deploymentKey = Object.keys(deployedAddresses).find(
      (key) => deployedAddresses[key].toLowerCase() === address.toLowerCase()
    );

    if (!deploymentKey) {
      throw new Error(
        `No deployment found for address ${address} in Ignition deployments`
      );
    }

    const contractName = deploymentKey.split("#")[1];
    if (!contractName) {
      throw new Error(
        `Invalid deployment key format: ${deploymentKey}. Expected format: Module#ContractName`
      );
    }

    const artifactsPath = `${ignitionPath}/${chainFolderName}/artifacts`;
    const dbgFileName = `${deploymentKey}.dbg.json`;
    const dbgFilePath = `${artifactsPath}/${dbgFileName}`;

    if (!fs.existsSync(dbgFilePath)) {
      throw new Error(`Debug file not found at ${dbgFilePath}`);
    }

    const dbgData = JSON.parse(fs.readFileSync(dbgFilePath, "utf8"));
    const buildInfoPath = `${artifactsPath}/${dbgData.buildInfo}`;

    if (!fs.existsSync(buildInfoPath)) {
      throw new Error(`Build info file not found at ${buildInfoPath}`);
    }

    const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));

    let sourceFiles = Object.keys(buildInfo.input.sources).reduce(
      (acc: any, key: string) => {
        acc[key] = buildInfo.input.sources[key];
        return acc;
      },
      {}
    );

    const contractToVerify = Object.keys(sourceFiles).find((key) =>
      key.includes(contractName + ".sol")
    );

    if (!contractToVerify) {
      throw new Error(
        `Contract ${contractName} not found in the build info sources.`
      );
    }

    const contractSource = sourceFiles[contractToVerify];
    delete sourceFiles[contractToVerify];
    sourceFiles = { [contractToVerify]: contractSource, ...sourceFiles };

    const compilerVersion = "v" + buildInfo.solcLongVersion;
    const optimize = buildInfo.input.settings.optimizer.enabled;
    const optimizeRuns = buildInfo.input.settings.optimizer.runs;
    const license = "";
    const evmVersion = buildInfo.input.settings.evmVersion ?? "default";
    const viaIR = buildInfo.input.settings.viaIR ?? false;
    const libraries = "";
    const metadata = buildInfo.input.settings.metadata ?? "";

    return {
      address: address,
      language: buildInfo.input.language,
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
    } as VerificationRequest;
  }

  private static async extractFromArtifacts(
    address: string,
    hre?: HardhatRuntimeEnvironment
  ) {
    if (!hre) {
      throw new Error(
        "HardhatRuntimeEnvironment is required for artifacts extraction"
      );
    }

    const bytecode = (await hre.network.provider.request({
      method: "eth_getCode",
      params: [address, "latest"],
    })) as string | undefined;

    if (!bytecode || bytecode === "0x") {
      throw new Error(`Bytecode not found for address ${address}`);
    }

    const artifactsPath = "./artifacts/contracts";

    if (!fs.existsSync(artifactsPath)) {
      throw new Error(`Artifacts directory not found at ${artifactsPath}`);
    }

    const matchingContract = this.findMatchingContractInArtifacts(
      artifactsPath,
      bytecode
    );

    if (!matchingContract) {
      throw new Error(
        `No matching contract found for address ${address} in artifacts`
      );
    }

    const dbgFile = matchingContract.artifactPath.replace(".json", ".dbg.json");
    if (!fs.existsSync(dbgFile)) {
      throw new Error(`Debug file not found at ${dbgFile}`);
    }

    const dbgData = JSON.parse(fs.readFileSync(dbgFile, "utf8"));
    const buildInfoPath = path.resolve(
      path.dirname(dbgFile),
      dbgData.buildInfo
    );

    if (!fs.existsSync(buildInfoPath)) {
      throw new Error(`Build info file not found at ${buildInfoPath}`);
    }

    const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));

    let sourceFiles = Object.keys(buildInfo.input.sources).reduce(
      (acc: any, key: string) => {
        acc[key] = buildInfo.input.sources[key];
        return acc;
      },
      {}
    );

    const contractToVerify = Object.keys(sourceFiles).find((key) =>
      key.includes(matchingContract.contractName + ".sol")
    );

    if (!contractToVerify) {
      throw new Error(
        `Contract ${matchingContract.contractName} not found in the build info sources.`
      );
    }

    const contractSource = sourceFiles[contractToVerify];
    delete sourceFiles[contractToVerify];
    sourceFiles = { [contractToVerify]: contractSource, ...sourceFiles };

    const compilerVersion = "v" + buildInfo.solcLongVersion;
    const optimize = buildInfo.input.settings.optimizer.enabled;
    const optimizeRuns = buildInfo.input.settings.optimizer.runs;
    const license = "";
    const evmVersion = buildInfo.input.settings.evmVersion ?? "default";
    const viaIR = buildInfo.input.settings.viaIR ?? false;
    const libraries = "";
    const metadata = buildInfo.input.settings.metadata ?? "";

    return {
      address: address,
      language: buildInfo.input.language,
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
    } as VerificationRequest;
  }

  private static findMatchingContractInArtifacts(
    artifactsPath: string,
    targetBytecode: string
  ): { contractName: string; artifactPath: string } | null {
    const searchDirectory = (
      dir: string
    ): { contractName: string; artifactPath: string } | null => {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          const result = searchDirectory(itemPath);
          if (result) return result;
        } else if (item.endsWith(".json") && !item.endsWith(".dbg.json")) {
          try {
            const artifact = JSON.parse(fs.readFileSync(itemPath, "utf8"));
            if (
              artifact.deployedBytecode &&
              artifact.deployedBytecode.toLowerCase() ===
                targetBytecode.toLowerCase()
            ) {
              const contractName = path.basename(item, ".json");
              return { contractName, artifactPath: itemPath };
            }
          } catch (error) {
            continue;
          }
        }
      }

      return null;
    };

    return searchDirectory(artifactsPath);
  }
}

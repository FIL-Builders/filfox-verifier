export interface SourceFile {
  content: string;
}

export interface SolcInputData {
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

export interface DeploymentData {
  address: string;
  solcInputHash: string;
  metadata: string;
}

export interface VerifyFilfoxParams {
  address: string;
}

export interface VerifyContractParams {
  address: string;
  chainId: number;
  network: string;
  deploymentsPath?: string;
}

export interface VerificationRequest {
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
}

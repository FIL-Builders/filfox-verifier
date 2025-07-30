import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { glob } from "glob";

export interface CompilationResult {
  metadata: any;
  sourceFiles: Record<string, string>;
}

export class FoundryProject {
  private rootPath: string;
  private foundryTomlPath: string;
  private srcPath: string;

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = path.resolve(rootPath);
    this.foundryTomlPath = path.join(this.rootPath, "foundry.toml");
    this.srcPath = path.join(this.rootPath, "src");
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.foundryTomlPath)) {
      throw new Error(`foundry.toml not found at ${this.foundryTomlPath}. Make sure you're in a Foundry project.`);
    }

    if (!fs.existsSync(this.srcPath)) {
      throw new Error(`src directory not found at ${this.srcPath}`);
    }
  }

  async compile(contractPath: string, contractName: string): Promise<CompilationResult> {
    const fullContractPath = path.resolve(this.rootPath, contractPath);
    
    if (!fs.existsSync(fullContractPath)) {
      throw new Error(`Contract file not found: ${fullContractPath}`);
    }

    const artifactPath = path.join(this.rootPath, "out", path.basename(contractPath), `${contractName}.json`);
    
    try {
      execSync("forge build", { 
        cwd: this.rootPath, 
        stdio: "pipe" 
      });
    } catch (error: any) {
      throw new Error(`Compilation failed: ${error.message}`);
    }

    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found after compilation: ${artifactPath}`);
    }

    const artifactContent = fs.readFileSync(artifactPath, "utf8");
    let artifact: any;
    try {
      artifact = JSON.parse(artifactContent);
    } catch (error: any) {
      throw new Error(`Failed to parse artifact JSON: ${error.message}`);
    }
    
    if (!artifact.metadata) {
      throw new Error(`No metadata found in artifact for ${contractName}`);
    }

    let metadata: any;
    if (typeof artifact.metadata === 'string') {
      try {
        metadata = JSON.parse(artifact.metadata);
      } catch (error: any) {
        throw new Error(`Failed to parse metadata JSON: ${error.message}`);
      }
    } else {
      metadata = artifact.metadata;
    }
    const sourceFiles = await this.collectSourceFiles(fullContractPath, metadata);

    return {
      metadata,
      sourceFiles
    };
  }

  private async collectSourceFiles(mainContractPath: string, metadata: any): Promise<Record<string, string>> {
    const sourceFiles: Record<string, string> = {};
    
    const sourceUnit = metadata.sources || {};
    
    for (const sourcePath of Object.keys(sourceUnit)) {
      let fullPath: string;
      
      if (path.isAbsolute(sourcePath)) {
        fullPath = sourcePath;
      } else {
        fullPath = path.resolve(this.rootPath, sourcePath);
      }

      if (!fs.existsSync(fullPath)) {
        const libPath = path.join(this.rootPath, "lib");
        if (fs.existsSync(libPath)) {
          const possiblePaths = await glob(`${libPath}/**/${sourcePath}`, { absolute: true });
          if (possiblePaths.length > 0) {
            fullPath = possiblePaths[0];
          }
        }
      }

      if (fs.existsSync(fullPath)) {
        const relativePath = path.relative(this.rootPath, fullPath);
        const content = fs.readFileSync(fullPath, "utf8");
        sourceFiles[relativePath] = content;
      } else {
        console.warn(`Warning: Source file not found: ${sourcePath}`);
      }
    }

    const mainContractRelative = path.relative(this.rootPath, mainContractPath);
    if (!sourceFiles[mainContractRelative]) {
      sourceFiles[mainContractRelative] = fs.readFileSync(mainContractPath, "utf8");
    }

    return sourceFiles;
  }
}
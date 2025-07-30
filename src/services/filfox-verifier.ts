import * as path from "path";

/**
 * Represents a Solidity source file with its content
 */
interface SourceFile {
  content: string;
}

/**
 * Configuration for import resolution
 */
interface ImportResolver {
  sourceFiles: Record<string, SourceFile>;
  remappedSourceFiles: Record<string, SourceFile>;
  remappings: Array<{ original: string; resolved: string }>;
}

/**
 * Request structure for Filfox contract verification
 */
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

/**
 * Simplified Filfox verifier with efficient import resolution
 *
 * This implementation recursively discovers only the necessary imports,
 * reducing payload size and preventing verification failures due to
 * redundant files.
 */
export class FilfoxVerifier {
  private static readonly FILFOX_NETWORKS = {
    314: "https://filfox.info/api/v1/tools/verifyContract",
    314159: "https://calibration.filfox.info/api/v1/tools/verifyContract",
  };

  private baseUrl: string;
  private chainId: number;

  constructor(chainId: number) {
    this.baseUrl = FilfoxVerifier.FILFOX_NETWORKS[chainId];
    this.chainId = chainId;

    if (!this.baseUrl) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }

  /**
   * Verifies a contract on Filfox with optimized source file resolution
   */
  async verify(request: VerificationRequest): Promise<any> {
    try {
      // Parse remappings from metadata
      const remappings = this.parseRemappings(
        request.metadata.settings.remappings
      );

      // Create remapped source files
      const remappedSourceFiles = this.createRemappedSourceFiles(
        request.sourceFiles,
        remappings
      );

      // Resolve only necessary imports recursively
      const necessaryFiles = await this.resolveNecessaryImports({
        sourceFiles: request.sourceFiles,
        remappedSourceFiles,
        remappings,
      });

      // Create request body with optimized source files
      const requestBody = {
        address: request.address,
        language: request.language,
        compiler: this.normalizeCompilerVersion(request.compiler),
        optimize: request.optimize,
        optimizeRuns: request.optimizeRuns,
        sourceFiles: necessaryFiles,
        license: request.license,
        evmVersion: request.evmVersion,
        viaIR: request.viaIR,
        libraries: request.libraries,
        metadata: "",
        optimizerDetails: request.optimizerDetails,
      };

      // Submit to Filfox API
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      return result;
    } catch (error: any) {
      console.error("Filfox verification failed:", error);
      return {
        errorCode: 8,
      };
    }
  }

  /**
   * Parses remapping strings into structured format
   */
  private parseRemappings(remappingsArray: string[]) {
    return remappingsArray.map((mapping: string) => {
      const [original, resolved] = mapping.split("=");
      return { original: original.trim(), resolved: resolved.trim() };
    });
  }

  /**
   * Creates remapped source files based on remapping rules
   */
  private createRemappedSourceFiles(
    sourceFiles: Record<string, SourceFile>,
    remappings: Array<{ original: string; resolved: string }>
  ): Record<string, SourceFile> {
    const remappedFiles: Record<string, SourceFile> = {};

    for (const [filePath, fileContent] of Object.entries(sourceFiles)) {
      // Find matching remapping for this file path
      const remapping = remappings.find((mapping) =>
        filePath.startsWith(mapping.resolved)
      );

      if (remapping) {
        const remappedPath = filePath.replace(
          remapping.resolved,
          remapping.original
        );
        remappedFiles[remappedPath] = fileContent;
      }
    }

    return remappedFiles;
  }

  /**
   * Recursively resolves only the necessary imports for compilation
   * This is the core optimization that reduces redundant files
   */
  private async resolveNecessaryImports(
    resolver: ImportResolver
  ): Promise<Record<string, SourceFile>> {
    const necessaryFiles: Record<string, SourceFile> = {};
    const processed = new Set<string>();
    const allAvailableFiles = {
      ...resolver.sourceFiles,
      ...resolver.remappedSourceFiles,
    };

    // Start with entry source files, prioritizing remapped versions
    const queue: string[] = [];

    // Add remapped versions first (they take precedence)
    for (const remappedPath of Object.keys(resolver.remappedSourceFiles)) {
      queue.push(remappedPath);
    }

    // Add non-remapped files that don't have remapped equivalents
    for (const originalPath of Object.keys(resolver.sourceFiles)) {
      const hasRemappedVersion = Object.keys(resolver.remappedSourceFiles).some(
        (remappedPath) => {
          // Check if this original file has a corresponding remapped version
          return resolver.remappings.some(
            (mapping) =>
              originalPath.startsWith(mapping.resolved) &&
              remappedPath ===
                originalPath.replace(mapping.resolved, mapping.original)
          );
        }
      );

      if (!hasRemappedVersion) {
        queue.push(originalPath);
      }
    }

    while (queue.length > 0) {
      const currentFile = queue.shift()!;

      if (processed.has(currentFile)) {
        continue;
      }

      processed.add(currentFile);

      // Add current file to necessary files if available
      if (allAvailableFiles[currentFile]) {
        necessaryFiles[currentFile] = allAvailableFiles[currentFile];

        // Extract imports from this file
        const imports = this.extractImports(
          allAvailableFiles[currentFile].content
        );

        // Resolve each import and add to queue
        for (const importPath of imports) {
          const resolvedImport = this.resolveImportPath(
            importPath,
            currentFile,
            resolver.remappings,
            allAvailableFiles
          );

          if (resolvedImport && !processed.has(resolvedImport.path)) {
            queue.push(resolvedImport.path);
          }
        }
      }
    }

    return necessaryFiles;
  }

  /**
   * Extracts import statements from Solidity source code
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegexes = [
      /import\s+["']([^"']+)["']/g, // import "path"
      /import\s*\{[^}]*\}\s*from\s+["']([^"']+)["']/g, // import {Symbol} from "path"
      /import\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']/g, // import * as Symbol from "path"
      /import\s+\w+\s+from\s+["']([^"']+)["']/g, // import Symbol from "path"
    ];

    for (const regex of importRegexes) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath && !imports.includes(importPath)) {
          imports.push(importPath);
        }
      }
    }

    return imports;
  }

  /**
   * Resolves an import path to the actual file path using compiler logic
   */
  private resolveImportPath(
    importPath: string,
    currentFile: string,
    remappings: Array<{ original: string; resolved: string }>,
    availableFiles: Record<string, SourceFile>
  ): { path: string; content: SourceFile } | null {
    // Strategy 1: Check if import path exists directly
    if (availableFiles[importPath]) {
      return { path: importPath, content: availableFiles[importPath] };
    }

    // Strategy 2: Handle relative imports (./  ../)
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      const resolvedPath = this.resolveRelativeImport(importPath, currentFile);
      if (availableFiles[resolvedPath]) {
        return { path: resolvedPath, content: availableFiles[resolvedPath] };
      }
    }

    // Strategy 3: Handle remapped imports
    const remappedPath = this.resolveRemappedImport(importPath, remappings);
    if (remappedPath && availableFiles[remappedPath]) {
      return { path: remappedPath, content: availableFiles[remappedPath] };
    }

    // Strategy 4: Search in available files by filename
    const fileName = path.basename(importPath);
    for (const [filePath, fileContent] of Object.entries(availableFiles)) {
      if (path.basename(filePath) === fileName) {
        // Additional check: ensure path context makes sense
        if (this.pathContextMatches(importPath, filePath)) {
          return { path: filePath, content: fileContent };
        }
      }
    }

    console.warn(
      `⚠️  Could not resolve import: ${importPath} from ${currentFile}`
    );
    return null;
  }

  /**
   * Resolves relative imports based on current file context
   */
  private resolveRelativeImport(
    importPath: string,
    currentFile: string
  ): string {
    const currentDir = path.dirname(currentFile);
    return path.normalize(path.join(currentDir, importPath));
  }

  /**
   * Resolves imports using remapping rules
   */
  private resolveRemappedImport(
    importPath: string,
    remappings: Array<{ original: string; resolved: string }>
  ): string | null {
    // Find best matching remapping (longest match first)
    const sortedRemappings = remappings
      .filter((mapping) => importPath.startsWith(mapping.original))
      .sort((a, b) => b.original.length - a.original.length);

    if (sortedRemappings.length > 0) {
      const mapping = sortedRemappings[0];
      return importPath.replace(mapping.original, mapping.resolved);
    }

    return null;
  }

  /**
   * Checks if import path context matches the available file path
   */
  private pathContextMatches(
    importPath: string,
    availablePath: string
  ): boolean {
    const importSegments = importPath
      .split("/")
      .filter((s) => s && s !== "." && s !== "..");
    const availableSegments = availablePath
      .split("/")
      .filter((s) => s && s !== "." && s !== "..");

    // Count matching segments
    let matches = 0;
    for (const segment of importSegments) {
      if (availableSegments.includes(segment)) {
        matches++;
      }
    }

    // If most segments match, consider it a valid match
    return matches >= Math.max(1, importSegments.length - 1);
  }

  /**
   * Ensures compiler version has 'v' prefix
   */
  private normalizeCompilerVersion(compiler: string): string {
    return compiler.includes("v") ? compiler : `v${compiler}`;
  }
}

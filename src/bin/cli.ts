#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import { verifyFilfoxCommand } from "../commands/verify-filfox";

const program = new Command();

// Get package.json path and read version
const packageJsonPath = join(__dirname, "../../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

program
  .name("filfox-verifier")
  .description("CLI tool for verifying smart contracts on Filfox")
  .version(packageJson.version);

program.addCommand(verifyFilfoxCommand);
if (require.main === module) {
  program.parse();
}

export default program;

#!/usr/bin/env node

import { Command } from "commander";
import { verifyFilfoxCommand } from "./commands/verify-filfox";

const program = new Command();

program
  .name("filfox-verifier")
  .description("CLI tool for verifying smart contracts on Filfox")
  .version("1.0.0");

program.addCommand(verifyFilfoxCommand);
if (require.main === module) {
  program.parse();
}

export default program;

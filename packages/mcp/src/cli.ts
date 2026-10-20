#!/usr/bin/env node
import { CONTRACT_VERSION } from "@reference-studio/core";
import { describeAdapter } from "./status.js";

console.error(describeAdapter(CONTRACT_VERSION));
process.exitCode = 1;

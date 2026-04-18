#!/usr/bin/env node
import { runStdio } from "./transport/stdio";

const args = process.argv.slice(2);
const isHttp = args.includes("--http");

if (isHttp) {
  console.error("caldav-mcp: --http transport not yet implemented");
  process.exit(2);
} else {
  await runStdio();
}

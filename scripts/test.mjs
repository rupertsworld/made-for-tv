#!/usr/bin/env node
/** Run checks in order, building the exact files loaded by browser tests. */
import { spawnSync } from "node:child_process";

for (const script of ["build", "typecheck", "test:unit", "test:e2e"]) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

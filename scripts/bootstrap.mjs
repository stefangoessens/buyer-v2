#!/usr/bin/env node

import { access, copyFile } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();

const bootstrapFiles = [
  { template: ".env.example", target: ".env.local" },
  { template: "python-workers/.env.example", target: "python-workers/.env" },
  {
    template: "services/extraction/.env.example",
    target: "services/extraction/.env",
  },
];

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

for (const file of bootstrapFiles) {
  const templatePath = path.join(workspaceRoot, file.template);
  const targetPath = path.join(workspaceRoot, file.target);

  if (!(await pathExists(templatePath)) || (await pathExists(targetPath))) {
    continue;
  }

  await copyFile(templatePath, targetPath);
  console.log(`created ${file.target} from ${file.template}`);
}

console.log("");
console.log("buyer-v2 bootstrap complete");
console.log("");
console.log("Web:       pnpm dev:web");
console.log("Convex:    pnpm dev:backend");
console.log("iOS:       pnpm ios:open  # or pnpm ios:test");
console.log("Workers:   pnpm workers:service:dev");
console.log("Tests:     pnpm workers:test");

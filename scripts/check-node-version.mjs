import { readFileSync } from "node:fs";

const { engines } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);
const minimum = Number(engines.node.slice(2));
const major = Number(process.versions.node.split(".")[0]);
if (major < minimum) {
  console.error(
    `HiCT requires Node.js ${minimum} or newer to build. You are using ${process.version}. Install Node.js ${minimum} LTS and retry.`
  );
  process.exitCode = 1;
}

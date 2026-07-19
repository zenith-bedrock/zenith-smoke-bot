/**
 * Run first-wave protocol smokes sequentially (join … two-client).
 * Skips skin-relay (extra) and persist auto-restart unless ZENITH_SMOKE_INCLUDE_PERSIST=1.
 */
import { $ } from "bun";

const steps = [
  "smoke:join",
  "smoke:place",
  "smoke:break",
  "smoke:inv-hotbar",
  "smoke:respawn",
  "smoke:chest-open",
  "smoke:double-chest",
  "smoke:dig-timing",
  "smoke:two-client",
];

if (process.env.ZENITH_SMOKE_INCLUDE_PERSIST === "1") {
  steps.push("smoke:persist");
}

console.log(`smoke:first10 → ${steps.length} steps`);

for (const step of steps) {
  console.log(`\n── ${step} ──`);
  const result = await $`bun run ${step}`.nothrow();
  if (result.exitCode !== 0) {
    console.error(`FAIL at ${step} (exit ${result.exitCode})`);
    process.exit(result.exitCode ?? 1);
  }
}

console.log("\nOK: first-wave smokes passed");

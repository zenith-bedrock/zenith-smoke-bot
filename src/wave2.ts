/**
 * Second-wave extremes: peer sync, dig idle, gamemode peer, floor pickup, join skin, sound.
 * Persist (S39) opt-in via ZENITH_SMOKE_INCLUDE_PERSIST=1 + ZENITH_PROJECT.
 */
import { $ } from "bun";

const steps = [
  "smoke:peer-ground",
  "smoke:dig-idle",
  "smoke:gamemode-peer",
  "smoke:floor-pickup",
  "smoke:join-skin",
  "smoke:sound",
  "smoke:gravity",
];

if (process.env.ZENITH_SMOKE_INCLUDE_PERSIST === "1") {
  steps.push("smoke:persist");
}

console.log(`smoke:wave2 → ${steps.length} steps`);

for (const step of steps) {
  console.log(`\n── ${step} ──`);
  const result = await $`bun run ${step}`.nothrow();
  if (result.exitCode !== 0) {
    console.error(`FAIL at ${step} (exit ${result.exitCode})`);
    process.exit(result.exitCode ?? 1);
  }
}

console.log("\nOK: wave-2 smokes passed");

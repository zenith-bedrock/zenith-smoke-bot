/**
 * Differential join/spawn smoke. It compares externally observable outcomes only; packet bytes,
 * runtime IDs, batching and timings are diagnostics, not compatibility requirements.
 */
import { connectUntilSpawn, closeQuiet, type SmokeTarget } from "./client.ts";
import type { ConnectCapture } from "./types.ts";

type Observation = {
  target: string;
  outcome: "spawned" | "failed";
  elapsedMs: number;
  gameMode?: number;
  inventorySlots?: number;
  error?: string;
};

function target(prefix: "ZENITH" | "REFERENCE", defaults: SmokeTarget): SmokeTarget {
  return {
    name: prefix === "ZENITH" ? "Zenith" : "Reference",
    host: process.env[`DIFF_${prefix}_HOST`] ?? defaults.host,
    port: Number(process.env[`DIFF_${prefix}_PORT`] ?? defaults.port),
    version: process.env[`DIFF_${prefix}_VERSION`] ?? defaults.version,
    protocolVersion: Number(process.env[`DIFF_${prefix}_PROTOCOL_VERSION`] ?? defaults.protocolVersion),
    timeoutMs: Number(process.env.DIFF_TIMEOUT_MS ?? defaults.timeoutMs),
  };
}

const defaults: SmokeTarget = {
  name: "Zenith",
  host: process.env.ZENITH_HOST ?? "127.0.0.1",
  port: Number(process.env.ZENITH_PORT ?? "19132"),
  version: process.env.ZENITH_BOT_VERSION ?? "1.26.40",
  protocolVersion: Number(process.env.ZENITH_BOT_PROTOCOL_VERSION ?? "2169"),
  timeoutMs: Number(process.env.ZENITH_SMOKE_TIMEOUT_MS ?? "30000"),
};

async function observe(side: SmokeTarget): Promise<Observation> {
  const started = performance.now();
  const capture: ConnectCapture = {
    pose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 },
    runtimeEntityId: 0,
    inventory: [],
  };
  try {
    const client = await connectUntilSpawn("DifferentialSmoke", capture, undefined, side);
    closeQuiet(client);
    return {
      target: side.name,
      outcome: "spawned",
      elapsedMs: performance.now() - started,
      gameMode: capture.gameMode,
      inventorySlots: capture.inventory.length,
    };
  } catch (error) {
    return {
      target: side.name,
      outcome: "failed",
      elapsedMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const zenith = target("ZENITH", defaults);
const reference = target("REFERENCE", { ...defaults, name: "Reference", protocolVersion: 2168 });
console.log(`differential:join → Zenith ${zenith.host}:${zenith.port}; Reference ${reference.host}:${reference.port}`);

const observations = [await observe(zenith), await observe(reference)];
console.log(JSON.stringify({ scenario: "join-spawn", observations }, null, 2));

if (observations.every((item) => item.outcome === "spawned")) {
  console.log("EQUIVALENT: both targets completed join/spawn. Packet timing and metadata are diagnostic only.");
  process.exit(0);
}

console.error("INCONCLUSIVE: at least one target did not reach spawn; classify the client/protocol failure before judging gameplay.");
process.exit(1);

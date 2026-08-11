/**
 * Low-level per-packet capture — logs each inbound game packet's name/length before
 * `bedrock-protocol` tries to deserialize it, and dumps the raw hex to a file. Exists because
 * `bedrock-protocol`'s own error on a decode failure ("array size is abnormally large", etc.)
 * only names the *symptom* packet, not necessarily the packet that's actually wrong — each game
 * packet is independently framed, so a failure is real evidence about *that* packet's own wire
 * shape, but the surrounding log noise (which packet decoded fine right before it) is what
 * actually narrows down where to look. Used to find ADR §85 (CreativeContentPacket) this way.
 *
 * Output: ZENITH_DEBUG_CAPTURE_DIR/pkt_NNN.hex (default: ./capture in cwd).
 *
 * Not part of the pass/fail smoke suite — run manually when a decode error needs isolating.
 */
import bedrock from "bedrock-protocol";
import { config } from "./config.ts";
import { mkdirSync, writeFileSync } from "fs";

const outDir = process.env.ZENITH_DEBUG_CAPTURE_DIR ?? "./capture";
mkdirSync(outDir, { recursive: true });

const client = bedrock.createClient({
  host: config.host,
  port: config.port,
  username: config.username,
  offline: true,
  version: config.version,
  raknetBackend: "raknet-native",
  skipPing: true,
  connectTimeout: config.timeoutMs,
});
// See client.ts for why this override exists.
(client as unknown as { options: { protocolVersion: number } }).options.protocolVersion =
  config.protocolVersion;

// bedrock-protocol has no public per-packet-buffer hook, so this wraps the private
// Client#readPacket (called once per already-framed game packet) to log + dump before it
// attempts to deserialize. Fragile to library internals changing — that's an acceptable
// tradeoff for a manual debug tool, not the pass/fail smoke suite.
const readPacket = (
  client as unknown as { readPacket: (packet: Buffer) => void }
).readPacket.bind(client);
let count = 0;
(client as unknown as { readPacket: (packet: Buffer) => void }).readPacket = (
  packet: Buffer,
) => {
  count++;
  const n = count;
  const hex = Buffer.from(packet).toString("hex");
  writeFileSync(`${outDir}/pkt_${String(n).padStart(3, "0")}.hex`, hex);
  console.log(`[capture] #${n} len=${packet.length} first16=${hex.slice(0, 32)}`);
  try {
    readPacket(packet);
  } catch (e) {
    console.log(`[capture] #${n} threw:`, e);
  }
};

client.on("error", (e: unknown) =>
  console.log("event:error", e instanceof Error ? e.message : e),
);
client.on("close", () => {
  console.log("event:close");
  process.exit(0);
});
client.on("spawn", () => {
  console.log("event:spawn");
  process.exit(0);
});

setTimeout(() => {
  console.log(`timeout after ${config.timeoutMs}ms`);
  process.exit(1);
}, config.timeoutMs);

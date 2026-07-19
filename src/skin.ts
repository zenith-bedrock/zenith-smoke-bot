/**
 * Skin relay smoke (§49 / ADR priority):
 * Bot A sends player_skin → Zenith relays → Bot B receives matching classic RGBA.
 *
 * Exit 0 = peer saw faithful relay. Exit 1 = fail.
 */
import { config } from "./config.ts";
import { closeQuiet, connectUntilSpawn, rakBackend } from "./client.ts";
import {
  assertSkinRelay,
  buildPlayerSkinParams,
} from "./skinPayload.ts";
import { toZenithWireUuidString } from "./bedrockUuid.ts";

const userA = process.env.ZENITH_BOT_A ?? "SmokeSkinA";
const userB = process.env.ZENITH_BOT_B ?? "SmokeSkinB";

let settled = false;

function finish(code: number, message?: string) {
  if (settled) return;
  settled = true;
  if (message) {
    if (code === 0) console.log(message);
    else console.error(`FAIL: ${message}`);
  }
  closeQuiet(clientA);
  closeQuiet(clientB);
  process.exit(code);
}

let clientA: Awaited<ReturnType<typeof connectUntilSpawn>> | undefined;
let clientB: Awaited<ReturnType<typeof connectUntilSpawn>> | undefined;

console.log(
  `smoke:skin → ${config.host}:${config.port} A=${userA} B=${userB} version=${config.version} raknet=${rakBackend()}`,
);

try {
  // B first so it is InGame before A's skin relay.
  clientB = await connectUntilSpawn(userB);
  clientA = await connectUntilSpawn(userA);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

const uuidA = String(clientA!.profile?.uuid ?? "");
if (!uuidA) {
  finish(1, "client A has no profile.uuid after spawn");
}

const wireUuid = toZenithWireUuidString(uuidA);
const relayWaitMs = Math.min(config.timeoutMs, 15_000);
const skinParams = buildPlayerSkinParams(wireUuid);

const relayed = new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => {
    reject(new Error(`timeout waiting for player_skin on B after ${relayWaitMs}ms`));
  }, relayWaitMs);

  clientB!.on("player_skin", (packet: unknown) => {
    clearTimeout(timer);
    // Zenith WriteUuid → bedrock reads as wire-form string (not logical Guid text).
    const err = assertSkinRelay(
      packet as Parameters<typeof assertSkinRelay>[0],
      wireUuid,
    );
    if (err) reject(new Error(err));
    else resolve();
  });
});

console.log(`A writing player_skin logical=${uuidA} wireUuid=${wireUuid}`);
try {
  clientA!.write("player_skin", skinParams);
} catch (err) {
  finish(1, `A write player_skin failed: ${err instanceof Error ? err.message : String(err)}`);
}

try {
  await relayed;
  finish(0, "OK: B received player_skin relay with matching classic RGBA");
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

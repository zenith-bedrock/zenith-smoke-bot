/** Two-client semantic smoke for the concrete short-lived Projectile slice. */
import bedrock from "bedrock-protocol";
import { writeAuthInput } from "./actions.ts";
import { config } from "./config.ts";
import { rakBackend, type SmokeClient } from "./client.ts";
import { finish, smokeBanner, waitForPacket, waitMs } from "./session.ts";

type Observation = { runtimeId: bigint | number | string; moves: number; removes: number };

function createPendingClient(username: string): SmokeClient {
  const client = bedrock.createClient({
    host: config.host, port: config.port, username, offline: true, version: config.version,
    raknetBackend: rakBackend(), skipPing: true, connectTimeout: config.timeoutMs,
  } as Parameters<typeof bedrock.createClient>[0]);
  (client as unknown as { options: { protocolVersion: number } }).options.protocolVersion = config.protocolVersion;
  return client;
}

function waitForSpawn(client: SmokeClient, username: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timeout spawn for ${username}`)), config.timeoutMs);
    client.once("spawn", () => { clearTimeout(timeout); resolve(); });
    client.once("error", reject);
    client.once("kick", (reason) => reject(new Error(`kicked ${username}: ${String(reason)}`)));
  });
}

function observeProjectile(client: SmokeClient, nearPlayer: boolean): { add: Promise<Observation>; observation: Observation } {
  const observation: Observation = { runtimeId: 0, moves: 0, removes: 0 };
  const add = waitForPacket<any>(client, "add_entity", (p) =>
    p.entity_type === "minecraft:snowball" && (!nearPlayer ||
      (Math.abs(Number(p.position?.x ?? Number.NaN)) < 1 && Math.abs(Number(p.position?.z ?? Number.NaN)) < 1 &&
       Number(p.velocity_z ?? p.velocity?.z ?? 0) > 0.4))).then((p) => {
    observation.runtimeId = p.runtime_id ?? p.runtime_entity_id;
    return observation;
  });
  client.on("move_entity", (p: any) => {
    if (String(p.runtime_entity_id ?? p.entity_id) === String(observation.runtimeId)) observation.moves++;
  });
  client.on("remove_entity", (p: any) => {
    if (String(p.entity_id_self ?? p.entity_id) === String(observation.runtimeId)) observation.removes++;
  });
  return { add, observation };
}

function fireAttackUse(client: SmokeClient) {
  client.write("inventory_transaction", {
    transaction: {
      legacy: { legacy_request_id: 0 }, transaction_type: "item_use", actions: [],
      transaction_data: {
        action_type: "attack", trigger_type: "player_input", block_position: { x: 0, y: -60, z: 0 },
        face: 0, hotbar_slot: 0, held_item: { network_id: 0 }, player_pos: { x: 0, y: -60, z: 0 },
        click_pos: { x: 0.5, y: 0.5, z: 0.5 }, block_runtime_id: 0,
        client_prediction: "success", client_cooldown_state: "off",
      },
    },
  });
}

smokeBanner("projectile", "two-client semantic lifecycle");
let a: SmokeClient | undefined;
let b: SmokeClient | undefined;
let aObservation: Observation | undefined;
let bObservation: Observation | undefined;
try {
  b = createPendingClient(process.env.ZENITH_BOT_B ?? "SmokeProjectileB");
  const seenByB = observeProjectile(b, true);
  bObservation = seenByB.observation;
  await waitForSpawn(b, "B");
  writeAuthInput(b, { pose: { x: 0, y: -60, z: -5, pitch: 0, yaw: 0 }, flags: { vertical_collision: true } });
  await waitMs(200);

  a = createPendingClient(process.env.ZENITH_BOT_A ?? "SmokeProjectileA");
  const seenByA = observeProjectile(a, true);
  aObservation = seenByA.observation;
  await waitForSpawn(a, "A");
  writeAuthInput(a, { pose: { x: 0, y: -60, z: 0, pitch: 0, yaw: 0 }, flags: { vertical_collision: true } });
  await waitMs(400);

  const aAdded = seenByA.add;
  const bAdded = seenByB.add;
  fireAttackUse(a);
  const [aState, bState] = await Promise.all([aAdded, bAdded]);
  if (String(aState.runtimeId) !== String(bState.runtimeId)) throw new Error("observers received different projectile identities");

  const aRemoved = waitForPacket<any>(a, "remove_entity", (p) => String(p.entity_id_self ?? p.entity_id) === String(aState.runtimeId), 10_000);
  const bRemoved = waitForPacket<any>(b, "remove_entity", (p) => String(p.entity_id_self ?? p.entity_id) === String(bState.runtimeId), 10_000);
  await Promise.all([aRemoved, bRemoved]);
  if (aState.moves < 1 || bState.moves < 1) throw new Error(`expected movement for both observers; A=${aState.moves} B=${bState.moves}`);
  if (aState.removes !== 1 || bState.removes !== 1) throw new Error(`expected one removal per observer; A=${aState.removes} B=${bState.removes}`);
  finish(0, `OK: projectile rid=${String(aState.runtimeId)} moved and removed once for both clients`, a, b);
} catch (err) {
  finish(1, `${err instanceof Error ? err.message : String(err)}; A=${String(aObservation?.runtimeId)} moves=${aObservation?.moves} removes=${aObservation?.removes}; B=${String(bObservation?.runtimeId)} moves=${bObservation?.moves} removes=${bObservation?.removes}`, a, b);
}

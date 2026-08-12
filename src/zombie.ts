/**
 * Two-client semantic actor smoke.
 *
 * B observes the initial Zombie actor; A joins later and must receive its current state.
 * A then sends a protocol-valid click_air item-use sequence. Both clients must observe
 * authoritative health changes and exactly one remove_entity event.
 */
import bedrock from "bedrock-protocol";
import { writeAuthInput } from "./actions.ts";
import { config } from "./config.ts";
import { closeQuiet, rakBackend, type SmokeClient } from "./client.ts";
import { finish, smokeBanner, waitForPacket, waitMs } from "./session.ts";

type ZombieObservation = {
  runtimeId: bigint | number | string;
  position: { x: number; y: number; z: number };
  health: number[];
  moves: number;
  removes: number;
};

function isZombie(packet: any): boolean {
  return String(packet.entity_type ?? packet.type ?? packet.identifier ?? "").includes("zombie");
}

function createPendingClient(username: string): SmokeClient {
  const client = bedrock.createClient({
    host: config.host,
    port: config.port,
    username,
    offline: true,
    version: config.version,
    raknetBackend: rakBackend(),
    skipPing: true,
    connectTimeout: config.timeoutMs,
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

function observeZombie(client: SmokeClient): { add: Promise<ZombieObservation>; observation: ZombieObservation } {
  const observation: ZombieObservation = { runtimeId: 0, position: { x: 0, y: -60, z: 0 }, health: [], moves: 0, removes: 0 };
  const add = waitForPacket<any>(client, "add_entity", isZombie).then((packet) => {
    observation.runtimeId = packet.runtime_id ?? packet.runtime_entity_id ?? packet.entity_id;
    observation.position = packet.position ?? observation.position;
    return observation;
  });
  client.on("move_entity", (packet: any) => {
    if (String(packet.runtime_entity_id ?? packet.entity_id) !== String(observation.runtimeId)) return;
    observation.moves++;
    observation.position = packet.position ?? observation.position;
  });
  client.on("remove_entity", (packet: any) => {
    if (String(packet.entity_id_self ?? packet.entity_id ?? packet.runtime_entity_id) === String(observation.runtimeId)) observation.removes++;
  });
  client.on("update_attributes", (packet: any) => {
    if (String(packet.runtime_entity_id ?? packet.entity_id) !== String(observation.runtimeId)) return;
    for (const attribute of packet.attributes ?? []) {
      if (attribute.name === "minecraft:health") observation.health.push(Number(attribute.current));
    }
  });
  return { add, observation };
}

function clickAir(client: SmokeClient) {
  client.write("inventory_transaction", {
    transaction: {
      legacy: { legacy_request_id: 0 },
      transaction_type: "item_use",
      actions: [],
      transaction_data: {
        action_type: "click_air",
        trigger_type: "player_input",
        block_position: { x: 0, y: -60, z: 0 },
        face: 0,
        hotbar_slot: 0,
        held_item: { network_id: 0 },
        player_pos: { x: 1, y: -60, z: 0 },
        click_pos: { x: 0.5, y: 0.5, z: 0.5 },
        block_runtime_id: 0,
        client_prediction: "success",
        client_cooldown_state: "off",
      },
    },
  });
}

smokeBanner("zombie", "two-client semantic lifecycle");

let a: SmokeClient | undefined;
let b: SmokeClient | undefined;
let aObservation: ZombieObservation | undefined;
let bObservation: ZombieObservation | undefined;
try {
  b = createPendingClient(process.env.ZENITH_BOT_B ?? "SmokeZombieB");
  const bZombie = observeZombie(b);
  bObservation = bZombie.observation;
  await waitForSpawn(b, "B");
  const bState = await bZombie.add;
  writeAuthInput(b, { pose: { x: 0, y: -60, z: -8, pitch: 0, yaw: 0 }, flags: { vertical_collision: true } });
  await waitMs(200);

  a = createPendingClient(process.env.ZENITH_BOT_A ?? "SmokeZombieA");
  const aZombie = observeZombie(a);
  aObservation = aZombie.observation;
  await waitForSpawn(a, "A");
  const aState = await aZombie.add;
  if (String(aState.runtimeId) !== String(bState.runtimeId)) throw new Error("late join received a different Zombie identity");

  await waitMs(1_000);
  if (aState.moves < 1 || bState.moves < 1) {
    throw new Error(`expected movement for both observers; A=${aState.moves} B=${bState.moves}`);
  }

  writeAuthInput(a, {
    pose: { x: aState.position.x - 1, y: aState.position.y, z: aState.position.z, pitch: 0, yaw: 0 },
    flags: { vertical_collision: true },
  });
  await waitMs(400);

  let playerDamageCount = 0;
  a.on("update_attributes", (packet: any) => {
    if ((packet.attributes ?? []).some((x: any) => x.name === "minecraft:health" && Number(x.current) < 20)) playerDamageCount++;
  });
  const playerDamaged = waitForPacket<any>(a, "update_attributes", (packet) =>
    (packet.attributes ?? []).some((x: any) => x.name === "minecraft:health" && Number(x.current) < 20), 10_000);
  await playerDamaged;
  await waitMs(600);
  if (playerDamageCount !== 1) throw new Error(`Zombie attack cooldown was too short: ${playerDamageCount} hits in 600ms`);
  await waitMs(700);
  if (playerDamageCount < 2) throw new Error("Zombie did not attack again after its cooldown");

  closeQuiet(a);
  await waitMs(300);
  a = createPendingClient(process.env.ZENITH_BOT_A ?? "SmokeZombieA");
  const rejoinedZombie = observeZombie(a);
  aObservation = rejoinedZombie.observation;
  await waitForSpawn(a, "A reconnect");
  const rejoinedState = await rejoinedZombie.add;
  if (String(rejoinedState.runtimeId) !== String(bState.runtimeId)) throw new Error("reconnect did not receive the combat Zombie");
  writeAuthInput(a, {
    pose: { x: rejoinedState.position.x - 1, y: rejoinedState.position.y, z: rejoinedState.position.z, pitch: 0, yaw: 0 },
    flags: { vertical_collision: true },
  });
  await waitMs(300);

  const bDamaged = waitForPacket<any>(b, "update_attributes", (p) =>
    String(p.runtime_entity_id ?? p.entity_id) === String(bState.runtimeId) &&
    (p.attributes ?? []).some((x: any) => x.name === "minecraft:health" && Number(x.current) < 20), 10_000);
  const aDamaged = waitForPacket<any>(a, "update_attributes", (p) =>
    String(p.runtime_entity_id ?? p.entity_id) === String(aState.runtimeId) &&
    (p.attributes ?? []).some((x: any) => x.name === "minecraft:health" && Number(x.current) < 20), 10_000);
  const bRemoved = waitForPacket<any>(b, "remove_entity", (p) => String(p.entity_id_self ?? p.entity_id ?? p.runtime_entity_id) === String(bState.runtimeId), 10_000);
  const aRemoved = waitForPacket<any>(a, "remove_entity", (p) => String(p.entity_id_self ?? p.entity_id ?? p.runtime_entity_id) === String(aState.runtimeId), 10_000);

  for (let i = 0; i < 5; i++) { clickAir(a); await waitMs(350); }
  await Promise.all([bDamaged, aDamaged, bRemoved, aRemoved]);
  await waitMs(500);
  if (aObservation.removes !== 1 || bState.removes !== 1) throw new Error(`expected one removal per observer; A=${aObservation.removes} B=${bState.removes}`);
  finish(0, `OK: zombie rid=${String(aState.runtimeId)} moved; both clients observed health and one removal`, a, b);
} catch (err) {
  finish(1, `${err instanceof Error ? err.message : String(err)}; A health=${aObservation?.health.join(",") ?? "n/a"}; B health=${bObservation?.health.join(",") ?? "n/a"}`, a, b);
}

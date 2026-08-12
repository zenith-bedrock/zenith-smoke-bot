/** Two-client mixed-combat smoke: concrete Zombie + Skeleton, repeated Skeleton shots and late join. */
import bedrock from "bedrock-protocol";
import { writeAuthInput } from "./actions.ts";
import { config } from "./config.ts";
import { rakBackend, type SmokeClient } from "./client.ts";
import { finish, smokeBanner, waitForPacket, waitMs } from "./session.ts";

type Id = bigint | number | string;
function create(username: string): SmokeClient {
  const client = bedrock.createClient({ host: config.host, port: config.port, username, offline: true, version: config.version,
    raknetBackend: rakBackend(), skipPing: true, connectTimeout: config.timeoutMs } as Parameters<typeof bedrock.createClient>[0]);
  (client as unknown as { options: { protocolVersion: number } }).options.protocolVersion = config.protocolVersion;
  return client;
}
function spawned(client: SmokeClient, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout spawn for ${name}`)), config.timeoutMs);
    client.once("spawn", () => { clearTimeout(timer); resolve(); }); client.once("error", reject); client.once("kick", reject);
  });
}
const actor = (client: SmokeClient, type: string): Promise<Id> =>
  waitForPacket<any>(client, "add_entity", p => p.entity_type === type).then(p => p.runtime_id ?? p.runtime_entity_id ?? p.entity_id);
function twoSnowballs(client: SmokeClient): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const ids = new Set<string>(); const timer = setTimeout(() => { client.off("add_entity", onAdd); reject(new Error("timeout waiting for two Skeleton projectiles")); }, 10_000);
    const onAdd = (p: any) => { if (p.entity_type !== "minecraft:snowball") return; ids.add(String(p.runtime_id ?? p.runtime_entity_id ?? p.entity_id)); if (ids.size < 2) return; clearTimeout(timer); client.off("add_entity", onAdd); resolve(ids); };
    client.on("add_entity", onAdd);
  });
}

smokeBanner("mixed-combat", "Zombie + Skeleton + repeated projectiles + late join");
let a: SmokeClient | undefined; let b: SmokeClient | undefined;
try {
  a = create(process.env.ZENITH_BOT_A ?? "SmokeMixedA");
  const az = actor(a, "minecraft:zombie"); const ask = actor(a, "minecraft:skeleton");
  await spawned(a, "A");
  writeAuthInput(a, { pose: { x: 0, y: -60, z: 0, pitch: 0, yaw: 0 }, flags: { vertical_collision: true } });
  const [zombieA, skeletonA] = await Promise.all([az, ask]);

  b = create(process.env.ZENITH_BOT_B ?? "SmokeMixedB");
  const bz = actor(b, "minecraft:zombie"); const bsk = actor(b, "minecraft:skeleton");
  await spawned(b, "B");
  writeAuthInput(b, { pose: { x: 0, y: -60, z: -8, pitch: 0, yaw: 0 }, flags: { vertical_collision: true } });
  const [zombieB, skeletonB] = await Promise.all([bz, bsk]);
  if (String(zombieA) !== String(zombieB) || String(skeletonA) !== String(skeletonB)) throw new Error("late join did not receive existing mixed actors");
  const [aShots, bShots] = await Promise.all([twoSnowballs(a), twoSnowballs(b)]);
  const common = [...aShots].filter(id => bShots.has(id));
  if (common.length < 2) throw new Error(`observers did not correlate two Skeleton projectiles: common=${common.length}`);
  await waitMs(100);
  finish(0, `OK: Zombie ${String(zombieA)}, Skeleton ${String(skeletonA)}, ${common.length} shared projectiles after late join`, a, b);
} catch (error) { finish(1, error instanceof Error ? error.message : String(error), a, b); }

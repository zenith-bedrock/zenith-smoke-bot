/**
 * Two-client concrete ranged-mob smoke. It correlates the Skeleton shot by its spawn origin,
 * then observes its target's health rather than assuming the next snowball belongs to a player.
 */
import bedrock from "bedrock-protocol";
import { writeAuthInput } from "./actions.ts";
import { config } from "./config.ts";
import { closeQuiet, rakBackend, type SmokeClient } from "./client.ts";
import { finish, smokeBanner, waitForPacket, waitMs } from "./session.ts";

type Actor = { runtimeId: bigint | number | string; position: { x: number; y: number; z: number } };

function create(username: string): SmokeClient {
  const client = bedrock.createClient({ host: config.host, port: config.port, username, offline: true, version: config.version,
    raknetBackend: rakBackend(), skipPing: true, connectTimeout: config.timeoutMs } as Parameters<typeof bedrock.createClient>[0]);
  (client as unknown as { options: { protocolVersion: number } }).options.protocolVersion = config.protocolVersion;
  return client;
}

function spawned(client: SmokeClient, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout spawn for ${name}`)), config.timeoutMs);
    client.once("spawn", () => { clearTimeout(timer); resolve(); });
    client.once("error", reject); client.once("kick", reason => reject(new Error(`kicked ${name}: ${String(reason)}`)));
  });
}

const observeSkeleton = (client: SmokeClient): Promise<Actor> =>
  waitForPacket<any>(client, "add_entity", p => p.entity_type === "minecraft:skeleton").then(p => ({
    runtimeId: p.runtime_id ?? p.runtime_entity_id ?? p.entity_id, position: p.position,
  }));

const observeSkeletonShot = (client: SmokeClient, skeleton: Actor): Promise<bigint | number | string> =>
  waitForPacket<any>(client, "add_entity", p => {
    if (p.entity_type !== "minecraft:snowball" || !p.position) return false;
    return Math.abs(Number(p.position.x) - skeleton.position.x) < 1 && Math.abs(Number(p.position.z) - skeleton.position.z) < 1;
  }, 10_000).then(p => p.runtime_id ?? p.runtime_entity_id ?? p.entity_id);

smokeBanner("skeleton", "two-client ranged combat + reconnect");
let a: SmokeClient | undefined; let b: SmokeClient | undefined; let again: SmokeClient | undefined;
try {
  a = create(process.env.ZENITH_BOT_A ?? "SmokeSkeletonA");
  const aSkeleton = observeSkeleton(a);
  await spawned(a, "A");
  writeAuthInput(a, { pose: { x: 0, y: -60, z: 0, pitch: 0, yaw: 0 }, flags: { vertical_collision: true } });
  const skeleton = await aSkeleton;
  const aHit = waitForPacket<any>(a, "update_attributes", p =>
    (p.attributes ?? []).some((x: any) => x.name === "minecraft:health" && Number(x.current) < 20), 10_000);

  b = create(process.env.ZENITH_BOT_B ?? "SmokeSkeletonB");
  const bSkeleton = observeSkeleton(b);
  await spawned(b, "B");
  writeAuthInput(b, { pose: { x: 0, y: -60, z: -8, pitch: 0, yaw: 0 }, flags: { vertical_collision: true } });
  const lateSkeleton = await bSkeleton;
  if (String(skeleton.runtimeId) !== String(lateSkeleton.runtimeId)) throw new Error("late join received a different Skeleton identity");

  const aShot = observeSkeletonShot(a, skeleton);
  const bShot = observeSkeletonShot(b, lateSkeleton);
  const [aProjectile, bProjectile] = await Promise.all([aShot, bShot]);
  if (String(aProjectile) !== String(bProjectile)) throw new Error("observers received different Skeleton projectile identities");
  await aHit;

  // A reconnects while the Skeleton remains active; it must receive the existing relevant actor.
  closeQuiet(a); await waitMs(300);
  again = create(process.env.ZENITH_BOT_A ?? "SmokeSkeletonA");
  const reconnectedSkeleton = observeSkeleton(again);
  await spawned(again, "A reconnect");
  await reconnectedSkeleton;
  finish(0, `OK: Skeleton ${String(skeleton.runtimeId)} shot ${String(aProjectile)}, damaged target and survived reconnect`, b, again);
} catch (error) {
  finish(1, error instanceof Error ? error.message : String(error), a, b, again);
}

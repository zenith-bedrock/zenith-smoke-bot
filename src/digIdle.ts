/**
 * Wave-2 #2 — dig idle StopCrack.
 * A start_break then goes idle; B must see block_stop_break LevelEvent.
 */
import { Face, writeAuthInput, writeUseItemClickBlock } from "./actions.ts";
import { approachCell } from "./move.ts";
import {
  DigIdleAbortMs,
  Flat,
  Hotbar,
  finish,
  openSession,
  smokeBanner,
  uniquePlaceCell,
  waitForPacket,
  waitMs,
} from "./session.ts";

const userA = process.env.ZENITH_BOT_A ?? "SmokeIdleA";
const userB = process.env.ZENITH_BOT_B ?? "SmokeIdleB";
const cell = uniquePlaceCell(20);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("dig-idle", `A=${userA} B=${userB} cell=${cell.x},${cell.y},${cell.z}`);

let a;
let b;
try {
  b = await openSession(userB);
  a = await openSession(userA);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a?.client, b?.client);
}

await approachCell(a!, cell);
writeUseItemClickBlock(a!.client, {
  block: support,
  face: Face.Up,
  hotbarSlot: Hotbar.Dirt,
  held: a!.inventory[Hotbar.Dirt],
  pose: a!.pose,
});

await waitForPacket<any>(
  a!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  8_000,
).catch((err) => {
  finish(1, `place failed: ${err.message}`, a!.client, b!.client);
  throw err;
});

const startCrack = waitForPacket<any>(
  b!.client,
  "level_event",
  (p) => p.event === "block_start_break" || p.event === 3600,
  8_000,
);
const stopCrack = waitForPacket<any>(
  b!.client,
  "level_event",
  (p) => p.event === "block_stop_break" || p.event === 3601,
  DigIdleAbortMs + 5_000,
);

writeAuthInput(a!.client, {
  pose: a!.pose,
  blockActions: [{ action: "start_break", position: cell, face: Face.Up }],
});

try {
  await startCrack;
  // Idle — no crack/continue — past DigIdleAbortTicks.
  await waitMs(DigIdleAbortMs);
  await stopCrack;
  finish(0, "OK: B saw start crack then stop after idle", a!.client, b!.client);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a!.client, b!.client);
}

/**
 * #8 dig-timing — Survival early predict_break rejected (resync keeps block).
 */
import {
  Face,
  writeAuthInput,
  writeUseItemBreakBlock,
  writeUseItemClickBlock,
} from "./actions.ts";
import {
  Flat,
  Hotbar,
  finish,
  openSession,
  smokeBanner,
  uniquePlaceCell,
  waitForPacket,
  waitMs,
} from "./session.ts";
import { approachCell } from "./move.ts";

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokeDig";
const cell = uniquePlaceCell(8);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("dig-timing", `user=${user} cell=${cell.x},${cell.y},${cell.z}`);

let session;
try {
  session = await openSession(user);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

await approachCell(session!, cell);
writeUseItemClickBlock(session!.client, {
  block: support,
  face: Face.Up,
  hotbarSlot: Hotbar.Dirt,
  held: session!.inventory[Hotbar.Dirt],
  pose: session!.pose,
});

const placed = await waitForPacket<any>(
  session!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  8_000,
).catch((err) => {
  finish(1, `place failed: ${err.message}`, session!.client);
  throw err;
});

const placedRid = placed.block_runtime_id;

// Early destroy without dig auth → ResyncCell with same rid.
writeUseItemBreakBlock(session!.client, {
  block: cell,
  hotbarSlot: Hotbar.Dirt,
  held: session!.inventory[Hotbar.Dirt],
  pose: session!.pose,
});

const early = await waitForPacket<any>(
  session!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z,
  8_000,
).catch((err) => {
  finish(1, `early reject resync missing: ${err.message}`, session!.client);
  throw err;
});

if (early.block_runtime_id !== placedRid) {
  finish(
    1,
    `early break incorrectly cleared cell: got ${early.block_runtime_id} want ${placedRid}`,
    session!.client,
  );
}

// Start dig then early predict (before DirtDigTicks) → still reject.
writeAuthInput(session!.client, {
  pose: session!.pose,
  blockActions: [{ action: "start_break", position: cell, face: Face.Up }],
});
await waitMs(100); // << 15 ticks
writeAuthInput(session!.client, {
  pose: session!.pose,
  blockActions: [{ action: "predict_break", position: cell, face: Face.Up }],
});

const mid = await waitForPacket<any>(
  session!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z,
  8_000,
).catch((err) => {
  finish(1, `mid-dig reject resync missing: ${err.message}`, session!.client);
  throw err;
});

if (mid.block_runtime_id === Flat.AirRuntimeId) {
  finish(1, "mid-dig early predict incorrectly broke block", session!.client);
}

finish(
  0,
  `OK: dig-timing rejected early break (kept rid=${placedRid})`,
  session!.client,
);

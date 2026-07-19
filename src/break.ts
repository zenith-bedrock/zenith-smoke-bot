/**
 * #3 break — place dirt, dig with AuthInput timing, expect air UpdateBlock.
 */
import {
  Face,
  writeAuthInput,
  writeUseItemClickBlock,
} from "./actions.ts";
import {
  DirtDigTicks,
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

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokeBreak";
const cell = uniquePlaceCell(3);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("break", `user=${user} cell=${cell.x},${cell.y},${cell.z}`);

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
  finish(1, `place before break failed: ${err.message}`, session!.client);
  throw err;
});

writeAuthInput(session!.client, {
  pose: session!.pose,
  blockActions: [{ action: "start_break", position: cell, face: Face.Up }],
});
await waitMs(DirtDigTicks * 50 + 100);
writeAuthInput(session!.client, {
  pose: session!.pose,
  blockActions: [{ action: "predict_break", position: cell, face: Face.Up }],
});

try {
  await waitForPacket<any>(
    session!.client,
    "update_block",
    (p) =>
      p.position?.x === cell.x &&
      p.position?.y === cell.y &&
      p.position?.z === cell.z &&
      p.block_runtime_id === Flat.AirRuntimeId,
    8_000,
  );
  finish(
    0,
    `OK: break → air (was rid=${placed.block_runtime_id})`,
    session!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), session!.client);
}

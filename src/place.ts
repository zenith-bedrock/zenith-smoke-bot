/**
 * #2 place — Survival hotbar stone → UpdateBlock at cell above grass.
 */
import { Face, writeUseItemClickBlock } from "./actions.ts";
import {
  Flat,
  Hotbar,
  finish,
  openSession,
  smokeBanner,
  uniquePlaceCell,
  waitForPacket,
} from "./session.ts";
import { approachCell } from "./move.ts";

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokePlace";
const cell = uniquePlaceCell(2);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("place", `user=${user} cell=${cell.x},${cell.y},${cell.z}`);

let session;
try {
  session = await openSession(user);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

const before = session!.inventory[Hotbar.Stone]?.count ?? 0;
await approachCell(session!, cell);
writeUseItemClickBlock(session!.client, {
  block: support,
  face: Face.Up,
  hotbarSlot: Hotbar.Stone,
  held: session!.inventory[Hotbar.Stone],
  pose: session!.pose,
});

try {
  const ub = await waitForPacket<any>(
    session!.client,
    "update_block",
    (p) =>
      p.position?.x === cell.x &&
      p.position?.y === cell.y &&
      p.position?.z === cell.z &&
      p.block_runtime_id !== Flat.AirRuntimeId,
    8_000,
  );
  finish(
    0,
    `OK: place update_block rid=${ub.block_runtime_id} (hotbar was ${before})`,
    session!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), session!.client);
}

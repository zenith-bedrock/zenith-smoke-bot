/**
 * #4 inv-hotbar — stack count drops after place (InventoryContent sync).
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

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokeInv";
const cell = uniquePlaceCell(4);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("inv-hotbar", `user=${user} cell=${cell.x},${cell.y},${cell.z}`);

let session;
try {
  session = await openSession(user);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

const before = session!.inventory[Hotbar.OakPlanks]?.count ?? 0;
if (before <= 0) {
  finish(1, "oak_planks hotbar empty — expected Survival seed", session!.client);
}

const contentDrop = waitForPacket<any>(
  session!.client,
  "inventory_content",
  (p) => {
    if (p.window_id !== "inventory" && p.window_id !== 0) return false;
    const slot = p.input?.[Hotbar.OakPlanks];
    return typeof slot?.count === "number" && slot.count === before - 1;
  },
  8_000,
);
const placed = waitForPacket<any>(
  session!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  8_000,
);

await approachCell(session!, cell);
writeUseItemClickBlock(session!.client, {
  block: support,
  face: Face.Up,
  hotbarSlot: Hotbar.OakPlanks,
  held: session!.inventory[Hotbar.OakPlanks],
  pose: session!.pose,
});

try {
  await Promise.all([placed, contentDrop]);
  finish(
    0,
    `OK: oak_planks ${before} → ${before - 1} after place`,
    session!.client,
  );
} catch (err) {
  finish(
    1,
    `${err instanceof Error ? err.message : String(err)} (cell ${cell.x},${cell.y},${cell.z} may be occupied — re-run)`,
    session!.client,
  );
}

/**
 * #6 chest-open — place single chest → click open → InventoryContent 27 slots.
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

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokeChest";
const cell = uniquePlaceCell(6);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("chest-open", `user=${user} cell=${cell.x},${cell.y},${cell.z}`);

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
  hotbarSlot: Hotbar.Chest,
  held: session!.inventory[Hotbar.Chest],
  pose: session!.pose,
});

await waitForPacket<any>(
  session!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  8_000,
).catch((err) => {
  finish(1, `chest place failed: ${err.message}`, session!.client);
  throw err;
});

const openWait = waitForPacket<any>(
  session!.client,
  "container_open",
  (p) => p.window_type === "container" || p.window_type === 0,
  8_000,
);
const contentWait = waitForPacket<any>(
  session!.client,
  "inventory_content",
  (p) => {
    // WindowChest = 2 (may decode as number when unmapped).
    const wid = p.window_id;
    if (wid !== 2 && wid !== "chest" && wid !== "container") return false;
    return Array.isArray(p.input) && p.input.length === 27;
  },
  8_000,
);

// Non-sneak click on chest with held stone → open (§56).
writeUseItemClickBlock(session!.client, {
  block: cell,
  face: Face.Up,
  hotbarSlot: Hotbar.Stone,
  held: session!.inventory[Hotbar.Stone],
  pose: session!.pose,
});

try {
  const open = await openWait;
  const content = await contentWait;
  finish(
    0,
    `OK: chest open type=${open.window_type} slots=${content.input.length}`,
    session!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), session!.client);
}

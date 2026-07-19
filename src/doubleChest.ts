/**
 * #7 double-chest — sneak-place partner → open → InventoryContent 54 slots.
 */
import {
  Face,
  writeAuthInput,
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

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokeDChest";
const primary = uniquePlaceCell(7);
// Keep partner in-reach: prefer East (+x) unless at x=2.
const partner =
  primary.x >= 2
    ? { x: primary.x - 1, y: primary.y, z: primary.z }
    : { x: primary.x + 1, y: primary.y, z: primary.z };
const partnerFace = partner.x > primary.x ? Face.East : Face.West;
const support = { x: primary.x, y: Flat.GrassY, z: primary.z };

smokeBanner(
  "double-chest",
  `user=${user} primary=${primary.x},${primary.y},${primary.z}`,
);

let session;
try {
  session = await openSession(user);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

await approachCell(session!, primary);
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
    p.position?.x === primary.x &&
    p.position?.y === primary.y &&
    p.position?.z === primary.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  8_000,
).catch((err) => {
  finish(1, `primary chest place failed: ${err.message}`, session!.client);
  throw err;
});

await waitMs(100);

// Sneak + held chest + click face East of primary → partner at x+1.
writeAuthInput(session!.client, {
  pose: session!.pose,
  sneaking: true,
});
writeUseItemClickBlock(session!.client, {
  block: primary,
  face: partnerFace,
  hotbarSlot: Hotbar.Chest,
  held: session!.inventory[Hotbar.Chest],
  pose: session!.pose,
});

await waitForPacket<any>(
  session!.client,
  "update_block",
  (p) =>
    p.position?.x === partner.x &&
    p.position?.y === partner.y &&
    p.position?.z === partner.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  8_000,
).catch((err) => {
  finish(1, `partner chest place failed: ${err.message}`, session!.client);
  throw err;
});

const contentWait = waitForPacket<any>(
  session!.client,
  "inventory_content",
  (p) => {
    const wid = p.window_id;
    if (wid !== 2 && wid !== "chest" && wid !== "container") return false;
    return Array.isArray(p.input) && p.input.length === 54;
  },
  8_000,
);

// Open without sneak (stone hand).
writeAuthInput(session!.client, { pose: session!.pose, sneaking: false });
writeUseItemClickBlock(session!.client, {
  block: primary,
  face: Face.Up,
  hotbarSlot: Hotbar.Stone,
  held: session!.inventory[Hotbar.Stone],
  pose: session!.pose,
});

try {
  const content = await contentWait;
  finish(0, `OK: double-chest UI slots=${content.input.length}`, session!.client);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), session!.client);
}

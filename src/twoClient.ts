/**
 * #10 two-client — A places → B sees UpdateBlock (peer fan-out).
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

const userA = process.env.ZENITH_BOT_A ?? "SmokePeerA";
const userB = process.env.ZENITH_BOT_B ?? "SmokePeerB";
const cell = uniquePlaceCell(10);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("two-client", `A=${userA} B=${userB} cell=${cell.x},${cell.y},${cell.z}`);

let a;
let b;
try {
  b = await openSession(userB);
  a = await openSession(userA);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a?.client, b?.client);
}

const sandBefore = a!.inventory[Hotbar.Sand]?.count ?? 0;
if (sandBefore <= 0) {
  finish(1, "A sand hotbar empty — expected Survival seed", a!.client, b!.client);
}

const aPlaced = waitForPacket<any>(
  a!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  10_000,
);
const aConsumed = waitForPacket<any>(
  a!.client,
  "inventory_content",
  (p) => {
    if (p.window_id !== "inventory" && p.window_id !== 0) return false;
    return (p.input?.[Hotbar.Sand]?.count ?? -1) === sandBefore - 1;
  },
  10_000,
);
const peerSee = waitForPacket<any>(
  b!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  10_000,
);

await approachCell(a!, cell);
writeUseItemClickBlock(a!.client, {
  block: support,
  face: Face.Up,
  hotbarSlot: Hotbar.Sand,
  held: a!.inventory[Hotbar.Sand],
  pose: a!.pose,
});

try {
  await aPlaced;
  await aConsumed;
  const ub = await peerSee;
  finish(
    0,
    `OK: B saw A's place rid=${ub.block_runtime_id}`,
    a!.client,
    b!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a!.client, b!.client);
}

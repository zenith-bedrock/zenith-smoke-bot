/**
 * Wave-2 #7 — LevelSound peer (§59).
 * A places; B receives level_sound_event sound_id "place".
 */
import { Face, writeUseItemClickBlock } from "./actions.ts";
import { approachCell } from "./move.ts";
import {
  Flat,
  Hotbar,
  finish,
  openSession,
  smokeBanner,
  uniquePlaceCell,
  waitForPacket,
} from "./session.ts";

const userA = process.env.ZENITH_BOT_A ?? "SmokeSoundA";
const userB = process.env.ZENITH_BOT_B ?? "SmokeSoundB";
const cell = uniquePlaceCell(21);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("sound", `A=${userA} B=${userB} cell=${cell.x},${cell.y},${cell.z}`);

let a;
let b;
try {
  b = await openSession(userB);
  a = await openSession(userA);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a?.client, b?.client);
}

const sound = waitForPacket<any>(
  b!.client,
  "level_sound_event",
  (p) => p.sound_id === "place" || p.sound_id === "Place",
  10_000,
);

await approachCell(a!, cell);
writeUseItemClickBlock(a!.client, {
  block: support,
  face: Face.Up,
  hotbarSlot: Hotbar.Stone,
  held: a!.inventory[Hotbar.Stone],
  pose: a!.pose,
});

try {
  const pkt = await sound;
  finish(
    0,
    `OK: B heard LevelSoundEvent sound_id=${pkt.sound_id}`,
    a!.client,
    b!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a!.client, b!.client);
}

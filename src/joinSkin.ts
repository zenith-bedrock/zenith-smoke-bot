/**
 * Wave-2 #6 — join skin honesty (§49).
 * B is InGame first; A joins with distinctive ClientData skin; B's player_list ADD carries magic RGBA.
 */
import { SKIN_MAGIC, SKIN_EDGE, SKIN_BYTES } from "./skinPayload.ts";
import { buildJoinSkinData } from "./joinSkinData.ts";
import {
  finish,
  openSession,
  smokeBanner,
  waitForPacket,
} from "./session.ts";

const userA = process.env.ZENITH_BOT_A ?? "SmokeJoinSkinA";
const userB = process.env.ZENITH_BOT_B ?? "SmokeJoinSkinB";
const skinId = "zenith_smoke_join_classic";

smokeBanner("join-skin", `A=${userA} B=${userB}`);

let b;
try {
  b = await openSession(userB);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

const listWait = waitForPacket<any>(
  b!.client,
  "player_list",
  (p) => {
    if (p.records?.type !== "add" && p.type !== "add") {
      // PlayerRecords wrapper
      const type = p.records?.type ?? p.type;
      if (type !== "add" && type !== 0) return false;
    }
    const records = p.records?.records ?? p.records ?? [];
    if (!Array.isArray(records)) return false;
    for (const rec of records) {
      if (String(rec.username) !== userA) continue;
      const skin = rec.skin_data ?? rec.skin;
      const img = skin?.skin_data ?? skin;
      if (!img) return false;
      if (img.width !== SKIN_EDGE || img.height !== SKIN_EDGE) return false;
      const data = Buffer.isBuffer(img.data)
        ? img.data
        : Buffer.from(img.data ?? []);
      if (data.length !== SKIN_BYTES) return false;
      if (!data.subarray(0, SKIN_MAGIC.length).equals(SKIN_MAGIC)) return false;
      if (skin?.skin_id && skin.skin_id !== skinId) return false;
      return true;
    }
    return false;
  },
  20_000,
);

let a;
try {
  a = await openSession(userA, { skinData: buildJoinSkinData(skinId) });
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), b!.client);
}

try {
  await listWait;
  finish(0, "OK: B PlayerList ADD carried join classic MAGIC skin", a!.client, b!.client);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a?.client, b!.client);
}

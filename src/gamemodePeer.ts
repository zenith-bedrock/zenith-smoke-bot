/**
 * Wave-2 #3 — /gamemode peer RefreshPeerView (§59).
 * A → creative; B gets remove_entity + add_player (no PlayerList churn required).
 */
import { writeGamemodeCommand } from "./actions.ts";
import {
  finish,
  openSession,
  smokeBanner,
  waitForPacket,
  waitMs,
} from "./session.ts";

const userA = process.env.ZENITH_BOT_A ?? "SmokeModeA";
const userB = process.env.ZENITH_BOT_B ?? "SmokeModeB";

smokeBanner("gamemode-peer", `A=${userA} B=${userB}`);

let a;
let b;
try {
  b = await openSession(userB);
  a = await openSession(userA);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a?.client, b?.client);
}

const ridA = a!.runtimeEntityId;
await waitMs(300);

const removed = waitForPacket<any>(
  b!.client,
  "remove_entity",
  (p) => String(p.entity_id_self) === String(ridA),
  10_000,
);

const reAdded = waitForPacket<any>(
  b!.client,
  "add_player",
  (p) => {
    if (String(p.username) !== userA) return false;
    const gm = p.gamemode;
    return gm === "creative" || gm === 1 || gm === "Creative";
  },
  10_000,
);

writeGamemodeCommand(a!.client, "creative", ridA);

try {
  await removed;
  const add = await reAdded;
  finish(
    0,
    `OK: B saw RemoveActor + AddPlayer gamemode=${add.gamemode}`,
    a!.client,
    b!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a!.client, b!.client);
}

/**
 * #5 respawn — AuthInput into void → death_info → client ready → spawn; bag intact.
 */
import { writeAuthInput, writeRespawnReady } from "./actions.ts";
import {
  Flat,
  Hotbar,
  VoidY,
  finish,
  openSession,
  smokeBanner,
  waitForPacket,
  waitMs,
} from "./session.ts";

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokeRespawn";

smokeBanner("respawn", `user=${user}`);

let session;
try {
  session = await openSession(user);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

const stoneBefore = session!.inventory[Hotbar.Stone]?.count ?? 0;
if (stoneBefore <= 0) {
  finish(1, "stone hotbar empty before void", session!.client);
}

const death = waitForPacket(session!.client, "death_info", () => true, 10_000);
const searching = waitForPacket<any>(
  session!.client,
  "respawn",
  (p) => p.state === 0 || p.state === "searching_for_spawn",
  10_000,
);

// Fall into void (below FlatMinY - margin).
writeAuthInput(session!.client, {
  pose: { ...session!.pose, y: VoidY },
});

try {
  await death;
  const searchPkt = await searching;
  console.log("event: death + respawn searching", searchPkt.state);

  writeRespawnReady(session!.client, {
    position: {
      x: session!.pose.x,
      y: Flat.SpawnFeetY + Flat.EyeHeight,
      z: session!.pose.z,
    },
    runtimeEntityId: session!.runtimeEntityId,
  });

  // Also PlayerAction respawn is accepted; belt-and-suspenders via packet already sent.
  await waitMs(500);

  // Inventory should still have stone (death keeps bag).
  const still = session!.inventory[Hotbar.Stone]?.count ?? 0;
  if (still !== stoneBefore) {
    // May need a fresh inventory_content — wait briefly.
    await waitForPacket<any>(
      session!.client,
      "inventory_content",
      (p) => {
        if (p.window_id !== "inventory" && p.window_id !== 0) return false;
        return (p.input?.[Hotbar.Stone]?.count ?? -1) === stoneBefore;
      },
      3_000,
    ).catch(() => {
      throw new Error(
        `bag not intact: stone was ${stoneBefore}, now ${session!.inventory[Hotbar.Stone]?.count}`,
      );
    });
  }

  finish(
    0,
    `OK: void death → respawn; stone count still ${stoneBefore}`,
    session!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), session!.client);
}

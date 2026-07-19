/**
 * Wave-2 #1 — parked peer Absolute ON_GROUND.
 * A walks then parks with VerticalCollision; B must see move_entity flags & FLAG_ON_GROUND.
 */
import { writeAuthInput } from "./actions.ts";
import {
  FlagOnGround,
  finish,
  openSession,
  smokeBanner,
  waitForPacket,
  waitMs,
} from "./session.ts";

const userA = process.env.ZENITH_BOT_A ?? "SmokeGroundA";
const userB = process.env.ZENITH_BOT_B ?? "SmokeGroundB";

smokeBanner("peer-ground", `A=${userA} B=${userB}`);

let a;
let b;
try {
  b = await openSession(userB);
  a = await openSession(userA);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a?.client, b?.client);
}

const ridA = a!.runtimeEntityId;
if (!ridA) finish(1, "A missing runtimeEntityId", a!.client, b!.client);

// Walk a few blocks so Absolute fans (pose dirty).
for (let i = 1; i <= 4; i++) {
  writeAuthInput(a!.client, {
    pose: { ...a!.pose, x: i * 0.4, z: 0.2 },
    flags: { vertical_collision: true },
  });
  a!.pose.x = i * 0.4;
  await waitMs(80);
}

const parked = waitForPacket<any>(
  b!.client,
  "move_entity",
  (p) => {
    if (String(p.runtime_entity_id) !== String(ridA)) return false;
    const flags = Number(p.flags ?? 0);
    return (flags & FlagOnGround) !== 0;
  },
  10_000,
);

// Park: same XY, VerticalCollision set → on-ground dirty Absolute (§44 adendo).
writeAuthInput(a!.client, {
  pose: a!.pose,
  flags: { vertical_collision: true },
});
await waitMs(100);
writeAuthInput(a!.client, {
  pose: a!.pose,
  flags: { vertical_collision: true },
});

try {
  const mv = await parked;
  finish(
    0,
    `OK: B saw parked Absolute ON_GROUND flags=${mv.flags}`,
    a!.client,
    b!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a!.client, b!.client);
}

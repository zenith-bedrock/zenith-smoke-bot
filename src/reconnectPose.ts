/**
 * ADR §60 — reconnect pose + GameMode via world LevelDB `pd:{uuid}`.
 *
 * Move away from spawn → creative → disconnect → same user rejoins:
 * StartGame near last feet (not flat origin) and gamemode creative.
 */
import {
  writeAuthInput,
  writeGamemodeCommand,
} from "./actions.ts";
import { closeQuiet } from "./client.ts";
import {
  Flat,
  finish,
  openSession,
  smokeBanner,
  waitMs,
} from "./session.ts";

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokeReconnectPose";
const targetX = 5.5;
const targetZ = 9.5;
const targetFeetY = Flat.SpawnFeetY;
const eps = 1.25;
/** Bedrock / Zenith GameMode.Creative */
const Creative = 1;

smokeBanner("reconnect-pose", `user=${user} target=${targetX},${targetFeetY},${targetZ}`);

const session = await openSession(user);

writeGamemodeCommand(session.client, "creative", session.runtimeEntityId);
await waitMs(500);

session.pose = {
  ...session.pose,
  x: targetX,
  y: targetFeetY,
  z: targetZ,
  yaw: 90,
  pitch: -10,
};

for (let i = 0; i < 8; i++) {
  writeAuthInput(session.client, { pose: session.pose });
  await waitMs(50);
}
await waitMs(200);

closeQuiet(session.client);
await waitMs(500);

const again = await openSession(user);
const near =
  Math.abs(again.pose.x - targetX) < eps &&
  Math.abs(again.pose.y - targetFeetY) < eps &&
  Math.abs(again.pose.z - targetZ) < eps;

if (!near) {
  finish(
    1,
    `rejoin pose not restored: got ${again.pose.x.toFixed(2)},${again.pose.y.toFixed(2)},${again.pose.z.toFixed(2)} ` +
      `(expected ~${targetX},${targetFeetY},${targetZ})`,
    again.client,
  );
}

if (again.gameMode !== Creative) {
  finish(
    1,
    `rejoin gamemode not creative: got ${again.gameMode ?? "undefined"} (expected ${Creative})`,
    again.client,
  );
}

finish(
  0,
  `OK: reconnect pose @ ${again.pose.x.toFixed(2)},${again.pose.y.toFixed(2)},${again.pose.z.toFixed(2)} mode=creative`,
  again.client,
);

import { writeAuthInput } from "./actions.ts";
import { Flat, waitMs, type SmokeSession, type Vec3 } from "./session.ts";

/** Walk domain feet near a target cell so MaxBlockReach (6) can hit it. */
export async function approachCell(session: SmokeSession, cell: Vec3) {
  session.pose = {
    ...session.pose,
    x: cell.x + 0.5,
    y: Flat.SpawnFeetY,
    z: cell.z - 1.5,
  };
  writeAuthInput(session.client, {
    pose: session.pose,
    flags: { vertical_collision: true },
  });
  await waitMs(400);
}

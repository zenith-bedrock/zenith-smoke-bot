/**
 * ADR §57 — sand/gravel cell-tick gravity.
 *
 * 1) Fall: dirt pedestal + sand on top → dig dirt → sand lands on grass+1
 * 2) Tower: three sand → dig bottom → cascade settles (2 sand, top air)
 * 3) Gravel: creative craft → same fall pattern as sand
 */
import {
  Face,
  writeAuthInput,
  writeGamemodeCommand,
  writeUseItemClickBlock,
} from "./actions.ts";
import { approachCell } from "./move.ts";
import {
  Flat,
  Hotbar,
  finish,
  openSession,
  smokeBanner,
  uniquePlaceCell,
  waitForPacket,
  waitMs,
  type SmokeSession,
  type Vec3,
} from "./session.ts";

/** Sand / gravel empty-hand dig ticks (BreakDurationTests). */
const SandDigTicks = 15;
const GravitySettleMs = 400;
const CreatedOutputSlot = 50;
const CreativeGravelNetId = 20;

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokeGravity";

smokeBanner("gravity", `user=${user}`);

let session: SmokeSession | undefined;
try {
  session = await openSession(user);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

async function placeOn(
  s: SmokeSession,
  support: Vec3,
  hotbar: number,
  label: string,
): Promise<{ cell: Vec3; rid: number }> {
  const cell = { x: support.x, y: support.y + 1, z: support.z };
  await approachCell(s, cell);
  writeUseItemClickBlock(s.client, {
    block: support,
    face: Face.Up,
    hotbarSlot: hotbar,
    held: s.inventory[hotbar],
    pose: s.pose,
  });
  try {
    const ub = await waitForPacket<any>(
      s.client,
      "update_block",
      (p) =>
        p.position?.x === cell.x &&
        p.position?.y === cell.y &&
        p.position?.z === cell.z &&
        p.block_runtime_id !== Flat.AirRuntimeId,
      8_000,
    );
    return { cell, rid: ub.block_runtime_id };
  } catch (err) {
    finish(
      1,
      `${label} place @ ${cell.x},${cell.y},${cell.z}: ${err instanceof Error ? err.message : String(err)}`,
      s.client,
    );
  }
}

async function digCell(s: SmokeSession, cell: Vec3) {
  await approachCell(s, cell);
  writeAuthInput(s.client, {
    pose: s.pose,
    blockActions: [{ action: "start_break", position: cell, face: Face.Up }],
  });
  await waitMs(SandDigTicks * 50 + 150);
  writeAuthInput(s.client, {
    pose: s.pose,
    blockActions: [{ action: "predict_break", position: cell, face: Face.Up }],
  });
  await waitForPacket<any>(
    s.client,
    "update_block",
    (p) =>
      p.position?.x === cell.x &&
      p.position?.y === cell.y &&
      p.position?.z === cell.z &&
      p.block_runtime_id === Flat.AirRuntimeId,
    8_000,
  );
}

function waitRidAt(
  s: SmokeSession,
  cell: Vec3,
  wantRid: number,
  timeoutMs = 8_000,
) {
  return waitForPacket<any>(
    s.client,
    "update_block",
    (p) =>
      p.position?.x === cell.x &&
      p.position?.y === cell.y &&
      p.position?.z === cell.z &&
      p.block_runtime_id === wantRid,
    timeoutMs,
  );
}

// Fresh Z band each run — persisted smoke world keeps leftover towers.
const cellSalt = 200 + (Date.now() % 500);

// ── 1) Sand fall onto grass+1 ───────────────────────────────────────────
const fallBase = uniquePlaceCell(cellSalt);
const grass = { x: fallBase.x, y: Flat.GrassY, z: fallBase.z };
const dirtPlaced = await placeOn(session!, grass, Hotbar.Dirt, "fall dirt");
const sandPlaced = await placeOn(
  session!,
  dirtPlaced.cell,
  Hotbar.Sand,
  "fall sand",
);
const sandRid = sandPlaced.rid;

const sandLanded = waitRidAt(session!, dirtPlaced.cell, sandRid, 8_000);
await digCell(session!, dirtPlaced.cell);
await waitMs(GravitySettleMs);
try {
  await sandLanded;
} catch (err) {
  finish(
    1,
    `sand fall: expected rid=${sandRid} at grass+1: ${err instanceof Error ? err.message : String(err)}`,
    session!.client,
  );
}

// ── 2) Tower cascade ────────────────────────────────────────────────────
const towerBase = uniquePlaceCell(cellSalt + 1);
const tGrass = { x: towerBase.x, y: Flat.GrassY, z: towerBase.z };
const t0 = await placeOn(session!, tGrass, Hotbar.Sand, "tower base");
const t1 = await placeOn(session!, t0.cell, Hotbar.Sand, "tower mid");
const t2 = await placeOn(session!, t1.cell, Hotbar.Sand, "tower top");
const towerRid = t0.rid;

const midLand = waitRidAt(session!, t0.cell, towerRid, 8_000);
const topLand = waitRidAt(session!, t1.cell, towerRid, 8_000);
const topClear = waitRidAt(session!, t2.cell, Flat.AirRuntimeId, 8_000);

await digCell(session!, t0.cell);
await waitMs(GravitySettleMs);

try {
  await Promise.all([midLand, topLand, topClear]);
} catch (err) {
  finish(
    1,
    `tower cascade: ${err instanceof Error ? err.message : String(err)}`,
    session!.client,
  );
}

// ── 3) Gravel fall (creative catalog net id 20) ─────────────────────────
// Starter hotbar 0–5 is filled; after sand places the bot bag count is stale,
// so drop/overwrite of slot 4 is brittle. Craft into an empty hotbar slot instead.
const GravelHotbar = 6;

writeGamemodeCommand(session!.client, "creative", session!.runtimeEntityId);
await waitMs(400);

let craftOk = false;
const onCraftResponse = (p: any) => {
  const responses = p?.responses ?? (Array.isArray(p) ? p : [p]);
  for (const r of responses) {
    if (r?.request_id === -1) {
      const status = r?.status ?? r?.result;
      craftOk = status === "ok" || status === 0 || status === "success";
    }
  }
};
session!.client.on("item_stack_response", onCraftResponse);

try {
  session!.client.write("item_stack_request", {
    requests: [
      {
        request_id: -1,
        actions: [
          {
            type_id: "craft_creative",
            item_id: CreativeGravelNetId,
            times_crafted: 1,
          },
          {
            type_id: "place",
            count: 64,
            source: {
              slot_type: { container_id: "creative_output" },
              slot: CreatedOutputSlot,
              stack_id: 0,
            },
            destination: {
              slot_type: { container_id: "inventory" },
              slot: GravelHotbar,
              stack_id: 0,
            },
          },
        ],
        custom_names: [],
        cause: "chat_public",
      },
    ],
  });
} catch (err) {
  finish(
    1,
    `gravel ISR failed: ${err instanceof Error ? err.message : String(err)}`,
    session!.client,
  );
}
await waitMs(300);
session!.client.removeListener("item_stack_response", onCraftResponse);
if (!craftOk) {
  finish(1, "gravel craft_creative ISR not ok", session!.client);
}

// ISR OK does not refresh bot bag — remint so held_item encodes a real stack.
const synced = waitForPacket<any>(
  session!.client,
  "inventory_content",
  (p) => p?.window_id === "inventory" || p?.window_id === 0,
  5_000,
);
try {
  session!.client.write("item_stack_request", {
    requests: [
      {
        request_id: -2,
        actions: [
          { type_id: "craft_creative", item_id: 999999, times_crafted: 1 },
        ],
        custom_names: [],
        cause: "chat_public",
      },
    ],
  });
} catch {
  /* ignore */
}
try {
  await synced;
} catch (err) {
  finish(
    1,
    `gravel bag sync failed: ${err instanceof Error ? err.message : String(err)}`,
    session!.client,
  );
}
const gravelHeld = session!.inventory[GravelHotbar];
if (!gravelHeld?.network_id) {
  finish(1, "gravel hotbar empty after craft+sync", session!.client);
}

const gBase = uniquePlaceCell(cellSalt + 2);
const gGrass = { x: gBase.x, y: Flat.GrassY, z: gBase.z };
const gDirt = await placeOn(session!, gGrass, Hotbar.Dirt, "gravel dirt");
const gGravel = await placeOn(
  session!,
  gDirt.cell,
  GravelHotbar,
  "gravel block",
);
const gravelRid = gGravel.rid;
if (gravelRid === sandRid) {
  finish(
    1,
    `gravel place used sand rid=${gravelRid} — craft landed wrong item`,
    session!.client,
  );
}

const gravelLanded = waitRidAt(session!, gDirt.cell, gravelRid, 8_000);
await digCell(session!, gDirt.cell);
await waitMs(GravitySettleMs);
try {
  await gravelLanded;
} catch (err) {
  finish(
    1,
    `gravel fall: ${err instanceof Error ? err.message : String(err)}`,
    session!.client,
  );
}

writeGamemodeCommand(session!.client, "survival", session!.runtimeEntityId);
await waitMs(200);

finish(
  0,
  `OK: sand fall + tower cascade + gravel fall (sandRid=${sandRid} gravelRid=${gravelRid})`,
  session!.client,
);

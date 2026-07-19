/**
 * Wave-2 #4 — floor drop + delayed pickup (§26).
 *
 * Strategy: place dirt → creative → clear bag → fill every slot with 64 stone via
 * CraftCreative + Place (CreatedOutput wire slot 50) → survival dig dirt (cannot
 * merge) → B sees add_item_entity → wait DefaultPickupDelay → walk onto drop →
 * take_item_entity.
 */
import {
  Face,
  writeAuthInput,
  writeGamemodeCommand,
  writeUseItemClickBlock,
} from "./actions.ts";
import { approachCell } from "./move.ts";
import {
  DirtDigTicks,
  Flat,
  FloorPickupDelayMs,
  Hotbar,
  finish,
  openSession,
  smokeBanner,
  uniquePlaceCell,
  waitForPacket,
  waitMs,
} from "./session.ts";

/** InventoryContainerMap.CraftingResultWireSlot — CreatedOutput (60) maps only slot 50. */
const CreatedOutputSlot = 50;
/** CreativeCatalog.Stone */
const CreativeStoneNetId = 1;

const userA = process.env.ZENITH_BOT_A ?? "SmokeFloorA";
const userB = process.env.ZENITH_BOT_B ?? "SmokeFloorB";
const cell = uniquePlaceCell(22);
const support = { x: cell.x, y: Flat.GrassY, z: cell.z };

smokeBanner("floor-pickup", `A=${userA} B=${userB} cell=${cell.x},${cell.y},${cell.z}`);

let a;
let b;
try {
  b = await openSession(userB);
  a = await openSession(userA);
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a?.client, b?.client);
}

await approachCell(a!, cell);
writeUseItemClickBlock(a!.client, {
  block: support,
  face: Face.Up,
  hotbarSlot: Hotbar.Dirt,
  held: a!.inventory[Hotbar.Dirt],
  pose: a!.pose,
});

await waitForPacket<any>(
  a!.client,
  "update_block",
  (p) =>
    p.position?.x === cell.x &&
    p.position?.y === cell.y &&
    p.position?.z === cell.z &&
    p.block_runtime_id !== Flat.AirRuntimeId,
  8_000,
).catch((err) => {
  finish(1, `dirt place failed: ${err.message}`, a!.client, b!.client);
  throw err;
});

writeGamemodeCommand(a!.client, "creative", a!.runtimeEntityId);
await waitMs(500);

let reqId = -1;

function writeIsr(actions: Record<string, unknown>[]) {
  a!.client.write("item_stack_request", {
    requests: [
      {
        request_id: reqId--,
        actions,
        custom_names: [],
        cause: "chat_public",
      },
    ],
  });
}

/** ISR Drop only empties the slot (no floor entity) — clear starter bag. */
for (let slot = 0; slot < 36; slot++) {
  const count = a!.inventory[slot]?.count ?? 0;
  if (count <= 0) continue;
  try {
    writeIsr([
      {
        type_id: "drop",
        count,
        randomly: false,
        source: {
          slot_type: { container_id: "inventory" },
          slot,
          stack_id: 0,
        },
      },
    ]);
  } catch (err) {
    finish(
      1,
      `ISR drop failed at slot ${slot}: ${err instanceof Error ? err.message : String(err)}`,
      a!.client,
      b!.client,
    );
  }
  await waitMs(20);
}
await waitMs(200);

let okResponses = 0;
a!.client.on("item_stack_response", (p: any) => {
  const responses = p?.responses ?? (Array.isArray(p) ? p : [p]);
  for (const r of responses) {
    const status = r?.status ?? r?.result;
    if (status === "ok" || status === 0 || status === "success") okResponses++;
  }
});

for (let slot = 0; slot < 36; slot++) {
  try {
    writeIsr([
      { type_id: "craft_creative", item_id: CreativeStoneNetId, times_crafted: 1 },
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
          slot,
          stack_id: 0,
        },
      },
    ]);
  } catch (err) {
    finish(
      1,
      `ISR fill failed at slot ${slot}: ${err instanceof Error ? err.message : String(err)}`,
      a!.client,
      b!.client,
    );
  }
  await waitMs(40);
}

await waitMs(600);

if (okResponses < 36) {
  // inventory_content may not refresh on ISR OK — fall through and rely on floor-drop proof.
  console.log(`note: item_stack_response ok count=${okResponses}/36 (continuing)`);
}

writeGamemodeCommand(a!.client, "survival", a!.runtimeEntityId);
await waitMs(400);

const dropSeen = waitForPacket<any>(
  b!.client,
  "add_item_entity",
  (p) => {
    const pos = p.position;
    if (!pos) return false;
    return (
      Math.abs(pos.x - (cell.x + 0.5)) < 1.5 &&
      Math.abs(pos.z - (cell.z + 0.5)) < 1.5
    );
  },
  12_000,
);

writeAuthInput(a!.client, {
  pose: a!.pose,
  blockActions: [{ action: "start_break", position: cell, face: Face.Up }],
});
await waitMs(DirtDigTicks * 50 + 150);
writeAuthInput(a!.client, {
  pose: a!.pose,
  blockActions: [{ action: "predict_break", position: cell, face: Face.Up }],
});

let drop;
try {
  drop = await dropSeen;
} catch (err) {
  finish(
    1,
    `no floor drop (bag likely not full; ISR ok=${okResponses}/36): ${err instanceof Error ? err.message : String(err)}`,
    a!.client,
    b!.client,
  );
}

// Full bag forced the floor drop; free one stone stack so dirt can TryAdd on pickup.
try {
  writeIsr([
    {
      type_id: "drop",
      count: 64,
      randomly: false,
      source: {
        slot_type: { container_id: "inventory" },
        slot: 0,
        stack_id: 0,
      },
    },
  ]);
} catch (err) {
  finish(
    1,
    `ISR free-slot drop failed: ${err instanceof Error ? err.message : String(err)}`,
    a!.client,
    b!.client,
  );
}
await waitMs(100);

const takeSeen = waitForPacket<any>(b!.client, "take_item_entity", () => true, 10_000);
await waitMs(FloorPickupDelayMs);
for (let i = 0; i < 6; i++) {
  writeAuthInput(a!.client, {
    pose: {
      x: cell.x + 0.5,
      y: Flat.SpawnFeetY,
      z: cell.z + 0.5,
      pitch: 0,
      yaw: 0,
    },
    flags: { vertical_collision: true },
  });
  await waitMs(100);
}

try {
  await takeSeen;
  finish(
    0,
    `OK: floor drop + delayed take (entity=${drop.runtime_entity_id} isr_ok=${okResponses})`,
    a!.client,
    b!.client,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err), a!.client, b!.client);
}

/**
 * Outbound InventoryTransaction (item_use) + PlayerAuthInput dig helpers.
 */
import type { SmokeClient } from "./client.ts";
import { toTransactionItem, type Pose, type Vec3, type WireItem } from "./session.ts";


/** Face indices match Zenith FaceOffset / Bedrock. */
export const Face = {
  Down: 0,
  Up: 1,
  North: 2,
  South: 3,
  West: 4,
  East: 5,
} as const;

export function writeUseItemClickBlock(
  client: SmokeClient,
  opts: {
    block: Vec3;
    face: number;
    hotbarSlot: number;
    held?: WireItem;
    pose: Pose;
    clickPos?: Vec3;
    blockRuntimeId?: number;
  },
) {
  client.write("inventory_transaction", {
    transaction: {
      legacy: { legacy_request_id: 0 },
      transaction_type: "item_use",
      actions: [],
      transaction_data: {
        action_type: "click_block",
        trigger_type: "player_input",
        block_position: opts.block,
        face: opts.face,
        hotbar_slot: opts.hotbarSlot,
        held_item: toTransactionItem(opts.held),
        player_pos: { x: opts.pose.x, y: opts.pose.y, z: opts.pose.z },
        click_pos: opts.clickPos ?? { x: 0.5, y: 1.0, z: 0.5 },
        block_runtime_id: opts.blockRuntimeId ?? 0,
        client_prediction: "success",
        client_cooldown_state: "off",
      },
    },
  });
}

export function writeUseItemBreakBlock(
  client: SmokeClient,
  opts: {
    block: Vec3;
    face?: number;
    hotbarSlot: number;
    held?: WireItem;
    pose: Pose;
  },
) {
  client.write("inventory_transaction", {
    transaction: {
      legacy: { legacy_request_id: 0 },
      transaction_type: "item_use",
      actions: [],
      transaction_data: {
        action_type: "break_block",
        trigger_type: "player_input",
        block_position: opts.block,
        face: opts.face ?? Face.Up,
        hotbar_slot: opts.hotbarSlot,
        held_item: toTransactionItem(opts.held),
        player_pos: { x: opts.pose.x, y: opts.pose.y, z: opts.pose.z },
        click_pos: { x: 0.5, y: 0.5, z: 0.5 },
        block_runtime_id: 0,
        client_prediction: "success",
        client_cooldown_state: "off",
      },
    },
  });
}

let authTick = 1n;

/**
 * Minimal PlayerAuthInput with optional block_action list.
 * Pose is domain feet (Zenith AuthInput is feet after §26).
 */
export function writeAuthInput(
  client: SmokeClient,
  opts: {
    pose: Pose;
    flags?: Record<string, boolean>;
    blockActions?: Array<{
      action:
        | "start_break"
        | "abort_break"
        | "crack_break"
        | "predict_break"
        | "continue_break";
      position: Vec3;
      face?: number;
    }>;
    sneaking?: boolean;
  },
) {
  const flags: Record<string, boolean> = {
    ...(opts.flags ?? {}),
  };
  if (opts.sneaking) flags.sneaking = true;
  if (opts.blockActions?.length) flags.block_action = true;

  const packet: Record<string, unknown> = {
    pitch: opts.pose.pitch,
    yaw: opts.pose.yaw,
    position: { x: opts.pose.x, y: opts.pose.y, z: opts.pose.z },
    move_vector: { x: 0, z: 0 },
    head_yaw: opts.pose.yaw,
    input_data: flags,
    input_mode: "mouse",
    play_mode: "normal",
    interaction_model: "classic",
    interact_rotation: { x: 0, z: 0 },
    tick: authTick++,
    delta: { x: 0, y: 0, z: 0 },
    analogue_move_vector: { x: 0, z: 0 },
    camera_orientation: { x: 0, y: 0, z: 0 },
    raw_move_vector: { x: 0, z: 0 },
  };

  if (opts.blockActions?.length) {
    packet.block_action = opts.blockActions.map((a) => ({
      action: a.action,
      position: a.position,
      face: a.face ?? Face.Up,
    }));
  }

  client.write("player_auth_input", packet);
}

export function writePlayerAction(
  client: SmokeClient,
  opts: {
    runtimeEntityId: bigint | number | string;
    action: string;
    position: Vec3;
    face?: number;
  },
) {
  client.write("player_action", {
    runtime_entity_id: opts.runtimeEntityId,
    action: opts.action,
    position: opts.position,
    result_position: opts.position,
    face: opts.face ?? Face.Up,
  });
}

export function writeRespawnReady(
  client: SmokeClient,
  opts: {
    position: Vec3;
    runtimeEntityId: bigint | number | string;
  },
) {
  // RespawnPacket.StateClientReadyToSpawn = 2
  client.write("respawn", {
    position: opts.position,
    state: 2,
    runtime_entity_id: opts.runtimeEntityId,
  });
}

/** `/gamemode` via CommandRequest (0x4D) — Zenith §52. */
export function writeGamemodeCommand(
  client: SmokeClient,
  mode: "survival" | "creative",
  runtimeEntityId: bigint | number | string = 0,
) {
  client.write("command_request", {
    command: `/gamemode ${mode}`,
    origin: {
      type: "player",
      uuid: "00000000-0000-0000-0000-000000000000",
      request_id: "",
      player_entity_id: Number(runtimeEntityId) || 0,
    },
    internal: false,
    version: "1.26.30",
  });
}


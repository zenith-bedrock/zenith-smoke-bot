/**
 * Spawned session helpers — capture pose + inventory during connect,
 * and shared wait/write utilities for protocol smokes.
 */
import { config } from "./config.ts";
import {
  closeQuiet,
  connectUntilSpawn,
  rakBackend,
  type ConnectOptions,
  type SmokeClient,
} from "./client.ts";
import type { ConnectCapture, Pose, Vec3, WireItem } from "./types.ts";

export type { Pose, Vec3, WireItem } from "./types.ts";
export type { ConnectOptions } from "./client.ts";

export type SmokeSession = {
  client: SmokeClient;
  username: string;
  pose: Pose;
  runtimeEntityId: bigint | number | string;
  /** Latest main inventory (window "inventory") — 36 slots. */
  inventory: WireItem[];
  /** StartGame gamemode when captured (0 survival / 1 creative). */
  gameMode?: number;
};

export function airItem(): { network_id: 0 } {
  return { network_id: 0 };
}

/** Convert inventory ItemV4 (or sparse) into AuthInput / InventoryTransaction `Item`. */
export function toTransactionItem(slot: WireItem | undefined): Record<string, unknown> {
  if (!slot || !slot.network_id) return airItem();
  return {
    network_id: slot.network_id,
    count: slot.count ?? 1,
    metadata: slot.metadata ?? 0,
    has_stack_id: 0,
    block_runtime_id: slot.block_runtime_id ?? 0,
    extra: { has_nbt: false, can_place_on: [], can_destroy: [] },
  };
}

export function floorPos(pose: Pose): { x: number; y: number; z: number } {
  return {
    x: Math.floor(pose.x),
    y: Math.floor(pose.y),
    z: Math.floor(pose.z),
  };
}

/** Block under feet on flat world (feet Y = FlatSpawnY = -60 → ground top = -61). */
export function groundUnderFeet(pose: Pose): Vec3 {
  const f = floorPos(pose);
  return { x: f.x, y: f.y - 1, z: f.z };
}

export function waitMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function waitForPacket<T = unknown>(
  client: SmokeClient,
  event: string,
  pred: (packet: T) => boolean,
  timeoutMs = config.timeoutMs,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, onPacket);
      reject(new Error(`timeout waiting for ${event} after ${timeoutMs}ms`));
    }, timeoutMs);

    function onPacket(packet: T) {
      try {
        if (!pred(packet)) return;
      } catch {
        return;
      }
      clearTimeout(timer);
      client.off(event, onPacket);
      resolve(packet);
    }

    client.on(event, onPacket);
  });
}

export async function openSession(
  username: string,
  options?: ConnectOptions,
): Promise<SmokeSession> {
  const capture: ConnectCapture = {
    pose: { x: 0, y: -60, z: 0, pitch: 0, yaw: 0 },
    runtimeEntityId: 0,
    inventory: [],
  };
  const client = await connectUntilSpawn(username, capture, options);
  const feet = normalizePoseToFeet(capture.pose);
  const session: SmokeSession = {
    client,
    username,
    pose: feet,
    runtimeEntityId: capture.runtimeEntityId,
    inventory: [...capture.inventory],
    gameMode: capture.gameMode,
  };

  client.on("inventory_content", (p: any) => {
    if (p?.window_id === "inventory" || p?.window_id === 0) {
      session.inventory = Array.isArray(p.input) ? p.input : [];
    }
  });

  client.on("move_player", (p: any) => {
    if (p?.position) {
      session.pose.x = p.position.x;
      session.pose.z = p.position.z;
      const y = p.position.y;
      session.pose.y =
        Math.abs(y - Flat.SpawnFeetY) < 0.2
          ? Flat.SpawnFeetY
          : Math.abs(y - (Flat.SpawnFeetY + Flat.EyeHeight)) < 0.2
            ? Flat.SpawnFeetY
            : y;
    }
  });

  await waitMs(200);
  return session;
}

export function finish(
  code: number,
  message: string | undefined,
  ...clients: Array<SmokeClient | undefined>
): never {
  if (message) {
    if (code === 0) console.log(message);
    else console.error(`FAIL: ${message}`);
  }
  for (const c of clients) closeQuiet(c);
  process.exit(code);
}

export function smokeBanner(name: string, extra = "") {
  console.log(
    `smoke:${name} → ${config.host}:${config.port} version=${config.version} raknet=${rakBackend()}${extra ? ` ${extra}` : ""}`,
  );
}

/** Survival starter hotbar indices (PlayerInventory seed). */
export const Hotbar = {
  Stone: 0,
  Dirt: 1,
  OakPlanks: 2,
  OakLog: 3,
  Sand: 4,
  Chest: 5,
} as const;

/** Zenith flat world (Blocks.*) — use for block math; StartGame Y is eye-space. */
export const Flat = {
  MinY: -64,
  StoneTopY: -62,
  GrassY: -61,
  SpawnFeetY: -60,
  /** Blocks.PlayerEyeHeight — StartGame player_position.y = feet + this. */
  EyeHeight: 1.62,
  AirRuntimeId: -604749536,
} as const;

/** Zenith flat void threshold: FlatMinY(-64) - 8 = -72. */
export const VoidY = -80;

/** Dirt empty-hand dig ticks (BreakDurationTests). */
export const DirtDigTicks = 15;

/** DigIdleAbortTicks (10) at 20 TPS — wait slightly past. */
export const DigIdleAbortMs = 10 * 50 + 150;

/** FloorDropStore.DefaultPickupDelay (10 ticks). */
export const FloorPickupDelayMs = 10 * 50 + 100;

/** MoveActorAbsolute FLAG_ON_GROUND. */
export const FlagOnGround = 1;

/** Convert StartGame / MovePlayer eye Y → domain feet for AuthInput. */
export function eyesToFeetY(eyeY: number): number {
  return eyeY - Flat.EyeHeight;
}

/** Ensure session.pose uses domain feet (AuthInput / reach). */
export function normalizePoseToFeet(pose: Pose): Pose {
  // Heuristic: flat spawn eye ≈ -58.38; if Y looks like eyes near spawn, convert.
  if (pose.y > Flat.SpawnFeetY - 0.5 && pose.y < Flat.SpawnFeetY + 2.5) {
    return { ...pose, y: Flat.SpawnFeetY };
  }
  return { ...pose, y: eyesToFeetY(pose.y) };
}

export function placeCellAboveGrass(offsetZ: number, offsetX = 0): Vec3 {
  return { x: offsetX, y: Flat.GrassY + 1, z: offsetZ };
}

let placeSeq = 0;

/**
 * Flat cell with growing Z so leftover overlays from prior smokes rarely collide.
 * Caller should `approachCell` first — cells may be beyond spawn reach.
 */
export function uniquePlaceCell(salt: number): Vec3 {
  const n = placeSeq++ * 3 + salt;
  const x = (n % 7) - 3; // -3..3
  const z = 6 + Math.floor(n / 7); // 6,7,8… walks outward
  return placeCellAboveGrass(z, x);
}

/** Shared wire/session types (no imports — breaks client↔session cycles). */

export type Vec3 = { x: number; y: number; z: number };

export type WireItem = {
  network_id: number;
  count?: number;
  metadata?: number;
  block_runtime_id?: number;
  net_id_variant?: { type?: string; id?: number };
  extra_data?: Buffer;
};

export type Pose = {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
};

export type ConnectCapture = {
  pose: Pose;
  runtimeEntityId: bigint | number | string;
  inventory: WireItem[];
  /** StartGame player gamemode when present (0 survival / 1 creative). */
  gameMode?: number;
};

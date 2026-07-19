/** Classic 64×64 RGBA skin payload matching Zenith SerializedSkin / bedrock Skin type. */

export const SKIN_EDGE = 64;
export const SKIN_BYTES = SKIN_EDGE * SKIN_EDGE * 4;

/** Distinctive header so peer can assert relay fidelity (not placeholder zeros). */
export const SKIN_MAGIC = Buffer.from([0x5a, 0xe1, 0x17, 0xff, 0x51, 0x4e, 0x00, 0xaa]);

export function buildClassicRgba(): Buffer {
  const data = Buffer.alloc(SKIN_BYTES, 0x20);
  SKIN_MAGIC.copy(data, 0);
  // Fill rest with a solid-ish pattern (R=0xCC) so TryGetClassicRgba length checks pass.
  for (let i = SKIN_MAGIC.length; i < SKIN_BYTES; i += 4) {
    data[i] = 0xcc;
    data[i + 1] = 0x44;
    data[i + 2] = 0x11;
    data[i + 3] = 0xff;
  }
  return data;
}

export function buildPlayerSkinParams(uuid: string, skinName = "ZenithSmokeSkin") {
  const rgba = buildClassicRgba();
  return {
    uuid,
    skin: {
      skin_id: "zenith_smoke_classic",
      play_fab_id: "",
      skin_resource_pack:
        '{"geometry":{"default":"geometry.humanoid.custom"}}',
      skin_data: {
        width: SKIN_EDGE,
        height: SKIN_EDGE,
        data: rgba,
      },
      animations: [],
      cape_data: {
        width: 0,
        height: 0,
        data: Buffer.alloc(0),
      },
      geometry_data: "",
      geometry_data_version: "",
      animation_data: "",
      cape_id: "",
      full_skin_id: "zenith_smoke_classic",
      arm_size: "wide",
      skin_color: "#0",
      personal_pieces: [],
      piece_tint_colors: [],
      premium: false,
      persona: false,
      cape_on_classic: false,
      primary_user: true,
      overriding_player_appearance: true,
    },
    skin_name: skinName,
    old_skin_name: "",
    is_verified: true,
  };
}

export function assertSkinRelay(
  packet: {
    uuid?: string;
    skin?: {
      skin_id?: string;
      skin_data?: { width?: number; height?: number; data?: Buffer | number[] };
    };
  },
  expectedUuid: string,
): string | null {
  if (!packet?.uuid) return "missing uuid on player_skin";
  const gotUuid = String(packet.uuid).toLowerCase();
  const wantUuid = expectedUuid.toLowerCase();
  if (gotUuid !== wantUuid) return `uuid mismatch: got ${gotUuid} want ${wantUuid}`;

  const img = packet.skin?.skin_data;
  if (!img) return "missing skin.skin_data";
  if (img.width !== SKIN_EDGE || img.height !== SKIN_EDGE) {
    return `skin size ${img.width}x${img.height}, want ${SKIN_EDGE}x${SKIN_EDGE}`;
  }
  const data = Buffer.isBuffer(img.data)
    ? img.data
    : Buffer.from(img.data ?? []);
  if (data.length !== SKIN_BYTES) {
    return `skin data length ${data.length}, want ${SKIN_BYTES}`;
  }
  if (!data.subarray(0, SKIN_MAGIC.length).equals(SKIN_MAGIC)) {
    return "skin magic header mismatch — relay/encode corrupted RGBA";
  }
  if (packet.skin?.skin_id !== "zenith_smoke_classic") {
    return `skin_id mismatch: ${packet.skin?.skin_id}`;
  }
  return null;
}

/** Classic login ClientData skin overrides for join-skin smoke. */
import { SKIN_EDGE, buildClassicRgba } from "./skinPayload.ts";

/** bedrock-protocol merges this into ClientData JWT (`options.skinData`). */
export function buildJoinSkinData(skinId = "zenith_smoke_join_classic") {
  const rgba = buildClassicRgba();
  return {
    SkinId: skinId,
    SkinData: rgba.toString("base64"),
    SkinImageWidth: SKIN_EDGE,
    SkinImageHeight: SKIN_EDGE,
    CapeData: "",
    CapeImageWidth: 0,
    CapeImageHeight: 0,
    SkinResourcePatch: Buffer.from(
      '{"geometry":{"default":"geometry.humanoid.custom"}}',
    ).toString("base64"),
    PremiumSkin: false,
    PersonaSkin: false,
    CapeOnClassicSkin: false,
    ArmSize: "wide",
    SkinColor: "#0",
    AnimatedImageData: [],
    PersonaPieces: [],
    PieceTintColors: [],
  };
}

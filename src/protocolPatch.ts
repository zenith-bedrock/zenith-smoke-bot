/**
 * bedrock-protocol@3.61 (minecraft-data 1.26.60 schema) models InventoryTransaction's
 * `legacy_transactions` as an `option` (always a leading bool). The real wire — and Mojang's
 * schema — carries the legacy set-item-slots array ONLY when `legacy_request_id != 0`, with no
 * presence flag. Left as-is, every transaction this bot sends has one stray byte and a correct
 * server mis-parses it. Re-model the field so the bot writes the real wire.
 */
import minecraftData from "minecraft-data";

const legacy = [
  "container",
  [
    { name: "legacy_request_id", type: "zigzag32" },
    {
      name: "legacy_transactions",
      type: [
        "switch",
        {
          compareTo: "legacy_request_id",
          fields: { "0": "void" },
          default: [
            "array",
            {
              countType: "varint",
              type: [
                "container",
                [
                  { name: "container_id", type: "u8" },
                  {
                    name: "changed_slots",
                    type: ["array", { countType: "varint", type: ["container", [{ name: "slot_id", type: "u8" }]] }],
                  },
                ],
              ],
            },
          ],
        },
      ],
    },
  ],
];

export function patchBedrockProtocol(version: string): void {
  const data = minecraftData(`bedrock_${version}`);
  const types = (data.protocol as { types?: Record<string, unknown> } | undefined)?.types;
  if (types?.TransactionLegacy) types.TransactionLegacy = legacy;
}

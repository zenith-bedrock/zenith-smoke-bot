/**
 * Shared env for Zenith protocol smokes.
 *
 * Zenith bumped to protocol 2169 / VersionName 1.26.50 (ADR §79). No release of
 * `bedrock-protocol` (nor its `minecraft-data` dependency) has cataloged 2169 yet — the newest
 * available is 1.26.40 @ protocol 2168 (checked against bedrock-protocol@3.58.0 / minecraft-data
 * @3.113.0 directly, both current as of this note). Not a Zenith-specific gap: gophertunnel,
 * bedrock-v/protocol, and Endstone are all at 2168 too (zenith ADR §81) — nobody's caught up.
 *
 * `protocolVersion` is sent standalone (see `client.ts` / `join.ts`, which override
 * `client.options.protocolVersion` right after `createClient()`) so the handshake claims 2169
 * and passes Zenith's exact-match ProtocolGate, while `version` stays at the nearest real
 * supported build (1.26.40) so the packet serializer/deserializer schema bedrock-protocol
 * actually ships gets used. This is a deliberate mismatch: it validates everything NOT on
 * Zenith's Cereal-debt list (join, place, break, inventory, chests, dig timing, persist,
 * gravity, sound, …) but cannot validate packets ADR §79/§82 migrated to the 2169 Cereal shape
 * (AddPlayer, AddItemActor, SetActorData today; more as the debt list closes) — the bot's own
 * serializer for those still expects the pre-2168 shape. A decode error on one of those
 * specific packets is not proof of a Zenith bug; it may just be the bot's own staleness.
 */
export const config = {
  host: process.env.ZENITH_HOST ?? "127.0.0.1",
  port: Number(process.env.ZENITH_PORT ?? "19132"),
  username: process.env.ZENITH_BOT_USERNAME ?? "ZenithSmoke",
  /** Nearest bedrock-protocol-supported build — NOT what's claimed on the wire, see above. */
  version: process.env.ZENITH_BOT_VERSION ?? "1.26.40",
  /** What's actually sent as client_protocol / protocol_version — must match ServerIdentity.ProtocolVersion. */
  protocolVersion: Number(process.env.ZENITH_BOT_PROTOCOL_VERSION ?? "2169"),
  timeoutMs: Number(process.env.ZENITH_SMOKE_TIMEOUT_MS ?? "30000"),
} as const;

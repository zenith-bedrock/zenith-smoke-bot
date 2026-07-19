/**
 * Zenith BinaryStream WriteUuid/ReadUuid uses Bedrock wire layout:
 * RFC-ish bytes with each 8-byte half reversed (+ .NET Guid shuffle).
 *
 * prismarine `bedrock-protocol` writes plain RFC 4122 bytes for `uuid` fields.
 * To make Zenith's ReadUuid yield the logical player Guid, pass this transformed
 * string into `write('player_skin', { uuid })` (and similar).
 */
export function toZenithWireUuidString(logicalUuid: string): string {
  const mixed = netGuidBytes(logicalUuid);
  const rfc = Buffer.alloc(16);
  rfc[0] = mixed[3];
  rfc[1] = mixed[2];
  rfc[2] = mixed[1];
  rfc[3] = mixed[0];
  rfc[4] = mixed[5];
  rfc[5] = mixed[4];
  rfc[6] = mixed[7];
  rfc[7] = mixed[6];
  mixed.copy(rfc, 8, 8);
  rfc.subarray(0, 8).reverse();
  rfc.subarray(8, 16).reverse();
  return stringifyRfc(rfc);
}

/** .NET Guid.TryWriteBytes order from a D-format string. */
function netGuidBytes(d: string): Buffer {
  const hex = d.replace(/-/g, "").toLowerCase();
  if (hex.length !== 32) throw new Error(`bad uuid: ${d}`);
  const raw = Buffer.from(hex, "hex");
  // RFC layout → .NET mixed
  const mixed = Buffer.alloc(16);
  mixed[0] = raw[3];
  mixed[1] = raw[2];
  mixed[2] = raw[1];
  mixed[3] = raw[0];
  mixed[4] = raw[5];
  mixed[5] = raw[4];
  mixed[6] = raw[7];
  mixed[7] = raw[6];
  raw.copy(mixed, 8, 8);
  return mixed;
}

function stringifyRfc(bytes: Buffer): string {
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

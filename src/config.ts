/** Shared env for Zenith protocol smokes. */
export const config = {
  host: process.env.ZENITH_HOST ?? "127.0.0.1",
  port: Number(process.env.ZENITH_PORT ?? "19132"),
  username: process.env.ZENITH_BOT_USERNAME ?? "ZenithSmoke",
  /**
   * Closest bedrock-protocol / minecraft-data build for Zenith wire protocol 1001.
   * Zenith advertises VersionName 1.26.33; data pack is 1.26.30 @ protocol 1001 — same protocol id.
   */
  version: process.env.ZENITH_BOT_VERSION ?? "1.26.30",
  timeoutMs: Number(process.env.ZENITH_SMOKE_TIMEOUT_MS ?? "30000"),
} as const;

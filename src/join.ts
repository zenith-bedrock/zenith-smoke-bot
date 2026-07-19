/**
 * Join smoke — connect offline to a running Zenith, wait for spawn.
 * Exit 0 = success; 1 = fail.
 *
 * Prefers `raknet-native` (needs `bun pm trust raknet-native` + g++/cmake once).
 * Set ZENITH_RAKNET=jsp to force pure JS (may fail CRA address parse vs Zenith).
 *
 * Zenith must allow offline (or self-signed) in auth.accept.
 */
import bedrock from "bedrock-protocol";
import { config } from "./config.ts";

const backend =
  (process.env.ZENITH_RAKNET as "raknet-native" | "jsp-raknet" | undefined) ??
  "raknet-native";

let settled = false;
let client: ReturnType<typeof bedrock.createClient> | undefined;

function finish(code: number, message?: string) {
  if (settled) return;
  settled = true;
  if (message) {
    if (code === 0) console.log(message);
    else console.error(`FAIL: ${message}`);
  }
  try {
    client?.close?.();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

console.log(
  `smoke:join → ${config.host}:${config.port} user=${config.username} version=${config.version} raknet=${backend} timeout=${config.timeoutMs}ms`,
);

try {
  client = bedrock.createClient({
    host: config.host,
    port: config.port,
    username: config.username,
    offline: true,
    version: config.version,
    raknetBackend: backend,
    skipPing: true,
    connectTimeout: config.timeoutMs,
  });
} catch (err) {
  finish(
    1,
    `${err instanceof Error ? err.message : String(err)}\n` +
      `Hint: run \`bun pm trust raknet-native\` (needs g++/cmake) or ZENITH_RAKNET=jsp`,
  );
}

const timer = setTimeout(() => {
  finish(
    1,
    `timeout after ${config.timeoutMs}ms (is Zenith up? auth.accept include offline?)`,
  );
}, config.timeoutMs);

function ok(reason: string) {
  clearTimeout(timer);
  finish(0, `OK: ${reason}`);
}

client!.on("error", (err: Error) => {
  clearTimeout(timer);
  finish(1, err?.message ?? String(err));
});

client!.on("kick", (reason: unknown) => {
  clearTimeout(timer);
  finish(1, `kicked: ${typeof reason === "string" ? reason : JSON.stringify(reason)}`);
});

client!.on("join", () => console.log("event: join"));
client!.on("start_game", () => console.log("event: start_game"));
client!.on("spawn", () => {
  console.log("event: spawn");
  ok("spawn");
});

client!.on("close", () => {
  if (!settled) {
    clearTimeout(timer);
    finish(1, "connection closed before spawn");
  }
});

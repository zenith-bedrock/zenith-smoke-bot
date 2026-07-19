/**
 * Join smoke — connect offline to a running Zenith, wait for spawn.
 * Exit 0 = success; 1 = fail.
 *
 * Zenith must allow offline (or self-signed) in auth.accept.
 */
import bedrock from "bedrock-protocol";
import { config } from "./config.ts";

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
  `smoke:join → ${config.host}:${config.port} user=${config.username} version=${config.version} timeout=${config.timeoutMs}ms`,
);

client = bedrock.createClient({
  host: config.host,
  port: config.port,
  username: config.username,
  offline: true,
  version: config.version,
});

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

client.on("error", (err: Error) => {
  clearTimeout(timer);
  finish(1, err?.message ?? String(err));
});

client.on("kick", (reason: unknown) => {
  clearTimeout(timer);
  finish(1, `kicked: ${typeof reason === "string" ? reason : JSON.stringify(reason)}`);
});

client.on("join", () => console.log("event: join"));
client.on("start_game", () => console.log("event: start_game"));
client.on("spawn", () => {
  console.log("event: spawn");
  ok("spawn");
});

client.on("close", () => {
  if (!settled) {
    clearTimeout(timer);
    finish(1, "connection closed before spawn");
  }
});

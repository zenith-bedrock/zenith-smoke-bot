import bedrock from "bedrock-protocol";
import { config } from "./config.ts";

export type RakBackend = "raknet-native" | "jsp-raknet";

export function rakBackend(): RakBackend {
  return (
    (process.env.ZENITH_RAKNET as RakBackend | undefined) ?? "raknet-native"
  );
}

export type SmokeClient = ReturnType<typeof bedrock.createClient>;

/** Connect offline and resolve on spawn (rejects on timeout/error/kick). */
export function connectUntilSpawn(username: string): Promise<SmokeClient> {
  const backend = rakBackend();
  return new Promise((resolve, reject) => {
    let settled = false;
    let client: SmokeClient;

    const done = (err?: Error, c?: SmokeClient) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        try {
          client?.close?.();
        } catch {
          /* ignore */
        }
        reject(err);
      } else {
        resolve(c!);
      }
    };

    try {
      client = bedrock.createClient({
        host: config.host,
        port: config.port,
        username,
        offline: true,
        version: config.version,
        raknetBackend: backend,
        skipPing: true,
        connectTimeout: config.timeoutMs,
      });
    } catch (err) {
      reject(
        new Error(
          `${err instanceof Error ? err.message : String(err)}\n` +
            `Hint: bun pm trust raknet-native (needs g++/cmake)`,
        ),
      );
      return;
    }

    const timer = setTimeout(() => {
      done(
        new Error(
          `timeout spawn for ${username} after ${config.timeoutMs}ms`,
        ),
      );
    }, config.timeoutMs);

    client.on("error", (err: Error) => done(err));
    client.on("kick", (reason: unknown) =>
      done(
        new Error(
          `kicked ${username}: ${typeof reason === "string" ? reason : JSON.stringify(reason)}`,
        ),
      ),
    );
    client.on("close", () => {
      if (!settled) done(new Error(`connection closed before spawn (${username})`));
    });
    client.on("spawn", () => {
      console.log(`event: spawn (${username})`);
      done(undefined, client);
    });
  });
}

export function closeQuiet(client: SmokeClient | undefined) {
  try {
    client?.close?.();
  } catch {
    /* ignore */
  }
}

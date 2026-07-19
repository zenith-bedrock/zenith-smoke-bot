import bedrock from "bedrock-protocol";
import { config } from "./config.ts";
import type { ConnectCapture } from "./types.ts";

export type RakBackend = "raknet-native" | "jsp-raknet";

export function rakBackend(): RakBackend {
  return (
    (process.env.ZENITH_RAKNET as RakBackend | undefined) ?? "raknet-native"
  );
}

export type SmokeClient = ReturnType<typeof bedrock.createClient>;

export type ConnectOptions = {
  /** Merged into ClientData JWT (SkinData base64, SkinImageWidth, …). */
  skinData?: Record<string, unknown>;
};

/** Connect offline and resolve on spawn (rejects on timeout/error/kick). */
export function connectUntilSpawn(
  username: string,
  capture?: ConnectCapture,
  options?: ConnectOptions,
): Promise<SmokeClient> {
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
      const opts: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username,
        offline: true,
        version: config.version,
        raknetBackend: backend,
        skipPing: true,
        connectTimeout: config.timeoutMs,
      };
      if (options?.skinData) opts.skinData = options.skinData;
      client = bedrock.createClient(opts as Parameters<typeof bedrock.createClient>[0]);
    } catch (err) {
      reject(
        new Error(
          `${err instanceof Error ? err.message : String(err)}\n` +
            `Hint: bun pm trust raknet-native (needs g++/cmake)`,
        ),
      );
      return;
    }

    if (capture) {
      client.on("start_game", (p: any) => {
        if (p?.player_position) {
          capture.pose.x = p.player_position.x;
          capture.pose.y = p.player_position.y;
          capture.pose.z = p.player_position.z;
        }
        if (p?.rotation) {
          capture.pose.yaw = p.rotation.x ?? capture.pose.yaw;
          capture.pose.pitch = p.rotation.y ?? capture.pose.pitch;
        }
        if (p?.runtime_entity_id != null) {
          capture.runtimeEntityId = p.runtime_entity_id;
        }
        const raw = p?.player_gamemode ?? p?.player_game_type ?? p?.gamemode;
        if (raw != null) {
          if (typeof raw === "number") capture.gameMode = raw;
          else if (typeof raw === "string") {
            const s = raw.toLowerCase();
            if (s === "creative" || s === "1") capture.gameMode = 1;
            else if (s === "survival" || s === "0") capture.gameMode = 0;
            else {
              const n = Number(raw);
              if (!Number.isNaN(n)) capture.gameMode = n;
            }
          }
        }
      });
      client.on("inventory_content", (p: any) => {
        if (p?.window_id === "inventory" || p?.window_id === 0) {
          capture.inventory = Array.isArray(p.input) ? [...p.input] : [];
        }
      });
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

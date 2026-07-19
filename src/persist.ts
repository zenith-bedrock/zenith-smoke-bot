/**
 * #9 graceful-persist (S39) — overlay + bag + chest across LevelDB restart.
 *
 * Place stone cell + chest cell; note stone hotbar count; restart; same user rejoins:
 * cells occupied, bag stone count matches, chest opens with 27 slots.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Face, writeUseItemClickBlock } from "./actions.ts";
import { config } from "./config.ts";
import {
  Flat,
  Hotbar,
  finish,
  openSession,
  smokeBanner,
  uniquePlaceCell,
  waitForPacket,
  waitMs,
} from "./session.ts";
import { approachCell } from "./move.ts";
import { closeQuiet } from "./client.ts";

const user = process.env.ZENITH_BOT_USERNAME ?? "SmokePersist";
const phase = (process.env.ZENITH_SMOKE_PERSIST_PHASE ?? "auto").toLowerCase();
const marker =
  process.env.ZENITH_SMOKE_PERSIST_MARKER ??
  join("/tmp", "zenith-smoke-persist.json");
const stoneCell = uniquePlaceCell(9);
const chestCell = uniquePlaceCell(10);
const project = process.env.ZENITH_PROJECT;

smokeBanner(
  "graceful-persist",
  `user=${user} phase=${phase} stone=${stoneCell.x},${stoneCell.y},${stoneCell.z} chest=${chestCell.x},${chestCell.y},${chestCell.z}`,
);

type Marker = {
  stone: { x: number; y: number; z: number; rid: number };
  chest: { x: number; y: number; z: number; rid: number };
  stoneCount: number;
  username: string;
  at: string;
};

async function placeBlock(
  session: Awaited<ReturnType<typeof openSession>>,
  cell: { x: number; y: number; z: number },
  hotbar: number,
) {
  const support = { x: cell.x, y: Flat.GrassY, z: cell.z };
  await approachCell(session, cell);
  writeUseItemClickBlock(session.client, {
    block: support,
    face: Face.Up,
    hotbarSlot: hotbar,
    held: session.inventory[hotbar],
    pose: session.pose,
  });
  return waitForPacket<any>(
    session.client,
    "update_block",
    (p) =>
      p.position?.x === cell.x &&
      p.position?.y === cell.y &&
      p.position?.z === cell.z &&
      p.block_runtime_id !== Flat.AirRuntimeId,
    8_000,
  );
}

async function placePhase(): Promise<Marker> {
  const session = await openSession(user);
  const stoneUb = await placeBlock(session, stoneCell, Hotbar.Stone);
  const chestUb = await placeBlock(session, chestCell, Hotbar.Chest);
  await waitMs(200);
  const stoneCount = session.inventory[Hotbar.Stone]?.count ?? -1;
  await waitMs(500);
  const m: Marker = {
    stone: {
      x: stoneCell.x,
      y: stoneCell.y,
      z: stoneCell.z,
      rid: stoneUb.block_runtime_id,
    },
    chest: {
      x: chestCell.x,
      y: chestCell.y,
      z: chestCell.z,
      rid: chestUb.block_runtime_id,
    },
    stoneCount,
    username: user,
    at: new Date().toISOString(),
  };
  writeFileSync(marker, JSON.stringify(m, null, 2));
  closeQuiet(session.client);
  await waitMs(300);
  return m;
}

async function assertOccupied(
  session: Awaited<ReturnType<typeof openSession>>,
  cell: { x: number; y: number; z: number },
  wantRid: number,
  label: string,
) {
  await approachCell(session, cell);
  const support = { x: cell.x, y: Flat.GrassY, z: cell.z };
  writeUseItemClickBlock(session.client, {
    block: support,
    face: Face.Up,
    hotbarSlot: Hotbar.Dirt,
    held: session.inventory[Hotbar.Dirt],
    pose: session.pose,
  });
  const ub = await waitForPacket<any>(
    session.client,
    "update_block",
    (p) =>
      p.position?.x === cell.x &&
      p.position?.y === cell.y &&
      p.position?.z === cell.z,
    8_000,
  );
  if (ub.block_runtime_id === Flat.AirRuntimeId) {
    throw new Error(`${label} is air after restart — LevelDB overlay lost`);
  }
  if (ub.block_runtime_id !== wantRid) {
    throw new Error(
      `${label} rid ${ub.block_runtime_id} ≠ placed ${wantRid}`,
    );
  }
}

async function verifyPhase(m: Marker): Promise<void> {
  const session = await openSession(m.username);
  const bagStone = session.inventory[Hotbar.Stone]?.count ?? -1;
  if (m.stoneCount >= 0 && bagStone !== m.stoneCount) {
    throw new Error(
      `bag stone count ${bagStone} ≠ pre-restart ${m.stoneCount} (inv: persist)`,
    );
  }

  await assertOccupied(session, m.stone, m.stone.rid, "stone cell");
  await assertOccupied(session, m.chest, m.chest.rid, "chest cell");

  const contentWait = waitForPacket<any>(
    session.client,
    "inventory_content",
    (p) => {
      const wid = p.window_id;
      if (wid !== 2 && wid !== "chest" && wid !== "container") return false;
      return Array.isArray(p.input) && p.input.length === 27;
    },
    8_000,
  );
  writeUseItemClickBlock(session.client, {
    block: m.chest,
    face: Face.Up,
    hotbarSlot: Hotbar.Dirt,
    held: session.inventory[Hotbar.Dirt],
    pose: session.pose,
  });
  await contentWait;
  closeQuiet(session.client);
}

function restartZenith(): Promise<void> {
  if (!project) {
    return Promise.reject(
      new Error(
        `Marker written to ${marker}. Restart Zenith (LevelDB world.path), then:\n` +
          `  ZENITH_SMOKE_PERSIST_PHASE=verify bun run smoke:persist`,
      ),
    );
  }

  const out = join(project, "src/zenith/bin/Release/net10.0");
  const yml = join(out, "zenith.yml");
  if (!existsSync(yml)) {
    mkdirSync(out, { recursive: true });
    writeFileSync(
      yml,
      `server:
  port: ${config.port}
  motd: Zenith Smoke
  max-players: 10
  max-players-per-ip: 10
  gamemode: Survival
world:
  name: smoke
  path: worlds/smoke
  spawn-chunk-radius: 2
auth:
  accept: [offline, self-signed]
chat:
  max-length: 512
  rate-capacity: 8
  rate-refill-per-second: 4
network:
  compression-threshold: 256
log:
  server: info
  raknet: warn
`,
    );
  }

  return new Promise((resolve) => {
    console.log("restart: stopping Zenith listeners on", config.port);
    spawn("pkill", ["-f", "dotnet.*zenith.csproj"], { stdio: "ignore" });
    spawn("pkill", ["-f", "zenith.dll"], { stdio: "ignore" });
    setTimeout(() => {
      console.log("restart: starting Zenith from", project);
      const child = spawn(
        "dotnet",
        ["run", "-c", "Release", "--project", "src/zenith/zenith.csproj", "--no-build"],
        {
          cwd: project,
          stdio: "ignore",
          detached: true,
        },
      );
      child.unref();
      setTimeout(() => resolve(), 6000);
    }, 1500);
  });
}

try {
  if (phase === "verify") {
    if (!existsSync(marker)) {
      finish(1, `no marker at ${marker} — run place phase first`);
    }
    const m = JSON.parse(readFileSync(marker, "utf8")) as Marker;
    await verifyPhase(m);
    finish(
      0,
      `OK: S39 persist verify bag=${m.stoneCount} stone+chest cells + chest UI 27`,
    );
  }

  const m = await placePhase();
  console.log(
    `placed stone rid=${m.stone.rid} chest rid=${m.chest.rid} bagStone=${m.stoneCount} marker=${marker}`,
  );

  if (phase === "place") {
    finish(
      0,
      `OK: place phase done — restart Zenith, then ZENITH_SMOKE_PERSIST_PHASE=verify bun run smoke:persist`,
    );
  }

  try {
    await restartZenith();
  } catch (err) {
    finish(0, err instanceof Error ? err.message : String(err));
  }

  await verifyPhase(m);
  finish(
    0,
    `OK: S39 LevelDB kept overlay+bag+chest (stoneCount=${m.stoneCount})`,
  );
} catch (err) {
  finish(1, err instanceof Error ? err.message : String(err));
}

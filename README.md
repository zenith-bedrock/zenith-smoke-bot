# zenith-smoke-bot

Protocol smoke client for **[Zenith](https://github.com/zenith-bedrock/zenith)** — separate repo so the C# server stays C#-only (ADR §58).

**Runtime:** [Bun](https://bun.sh) + [`bedrock-protocol`](https://github.com/PrismarineJS/bedrock-protocol).

## Why not inside `zenith/`

Mixing Node/TS into the server tree blurs leaf boundaries and review surface. This repo tracks Zenith’s wire pin (`protocol 1001` / game ~`1.26.33`) without living under `src/zenith`.

## Version pin

| Zenith (`ServerIdentity`) | Bot default |
|---------------------------|-------------|
| Protocol **1001** / VersionName **1.26.33** | `1.26.30` (minecraft-data; same protocol **1001**) |

Override with `ZENITH_BOT_VERSION` if needed.

## Prerequisites

1. Bun ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)
2. System C++ toolchain once (`g++` / `cmake`) so `raknet-native` can build
3. Zenith listening (UDP `19132`) with `auth.accept` including `offline`
4. For `smoke:persist` LevelDB path: `world.path` non-empty in `zenith.yml` (not InMemory)
5. In this repo:

```bash
bun install
bun pm trust raknet-native   # run native install script (blocked by default)
bun run smoke:join
```

Default RakNet backend is **`raknet-native`**. Pure JS (`ZENITH_RAKNET=jsp-raknet`) currently fails CRA address parse against Zenith’s RakNet — do not use for smoke until fixed.

**UUID note:** Zenith `BinaryStream` UUID wire ≠ plain RFC bytes that `bedrock-protocol` writes. Skin smoke uses `toZenithWireUuidString()` so inbound `PlayerSkin` UUID matches `Player.Uuid` (§49).

**Pose note:** Zenith `StartGame` Y is eye-space (`feet + 1.62`). Smokes normalize to domain feet for AuthInput / reach (`MaxBlockReach = 6`).

## Commands

```bash
# terminal A — from zenith checkout (LevelDB for persist)
dotnet run -c Release --project src/zenith/zenith.csproj

# terminal B
bun install
bun run smoke:join
bun run smoke:first10          # 1–8 + 10 (skips persist restart)
ZENITH_SMOKE_INCLUDE_PERSIST=1 ZENITH_PROJECT=/path/to/zenith bun run smoke:first10
bun run smoke:wave2            # peer/dig-idle/gamemode/floor/skin/sound
ZENITH_SMOKE_INCLUDE_PERSIST=1 ZENITH_PROJECT=/path/to/zenith bun run smoke:wave2
```

| Script | Id |
|--------|-----|
| `smoke:join` | #1 join → spawn |
| `smoke:place` | #2 place |
| `smoke:break` | #3 break |
| `smoke:inv-hotbar` | #4 inv-hotbar |
| `smoke:respawn` | #5 respawn |
| `smoke:chest-open` | #6 chest-open |
| `smoke:double-chest` | #7 double-chest |
| `smoke:dig-timing` | #8 dig-timing |
| `smoke:persist` | #9 graceful-persist (S39 bag+chest) |
| `smoke:two-client` | #10 two-client |
| `smoke:peer-ground` | wave-2 — parked Absolute `FLAG_ON_GROUND` |
| `smoke:dig-idle` | wave-2 — start crack → idle → `block_stop_break` |
| `smoke:gamemode-peer` | wave-2 — `/gamemode` → RemoveActor + AddPlayer |
| `smoke:floor-pickup` | wave-2 — full bag floor drop + delayed take |
| `smoke:join-skin` | wave-2 — login ClientData skin on PlayerList ADD |
| `smoke:sound` | wave-2 — peer `level_sound_event` place |
| `smoke:skin` | bonus — mid-game PlayerSkin relay (§49) |
| `smoke:first10` | sequential first wave |
| `smoke:wave2` | sequential wave-2 (persist opt-in) |

| Env | Default |
|-----|---------|
| `ZENITH_HOST` | `127.0.0.1` |
| `ZENITH_PORT` | `19132` |
| `ZENITH_BOT_USERNAME` | per-smoke default |
| `ZENITH_BOT_A` / `ZENITH_BOT_B` | two-client / skin |
| `ZENITH_BOT_VERSION` | `1.26.30` |
| `ZENITH_SMOKE_TIMEOUT_MS` | `30000` |
| `ZENITH_PROJECT` | (optional) zenith checkout for persist auto-restart |
| `ZENITH_SMOKE_PERSIST_PHASE` | `auto` \| `place` \| `verify` |
| `ZENITH_SMOKE_INCLUDE_PERSIST` | set `1` to include persist in `first10` / `wave2` |

Exit **0** = success. Exit **1** = timeout / kick / assert fail.

### Persist (#9)

Requires LevelDB (`world.path` set). Modes:

- **auto** (default): place stone+chest → note bag stone count → `pkill`/restart via `ZENITH_PROJECT` → verify cells + bag + chest UI 27
- **place**: write `/tmp/zenith-smoke-persist.json`, exit; restart Zenith yourself
- **verify**: `ZENITH_SMOKE_PERSIST_PHASE=verify bun run smoke:persist`

## Priority smokes (first wave)

Wire-level only. Human Gate A still owns UI mesh / crack feel / lid visuals.

| # | Id | Assert (bot) | Status |
|---|----|--------------|--------|
| 1 | `join` | Offline connect → `start_game` → `spawn` | **Implemented** |
| 2 | `place` | Place allowlisted block → `update_block` | **Implemented** |
| 3 | `break` | Dig auth + elapsed → cell air | **Implemented** |
| 4 | `inv-hotbar` | Stack count drops after place | **Implemented** |
| 5 | `respawn` | Void → death/respawn; bag intact | **Implemented** |
| 6 | `chest-open` | Single chest → 27 content | **Implemented** |
| 7 | `double-chest` | Pair → **54** slots on wire | **Implemented** |
| 8 | `dig-timing` | Early break rejected (resync keeps block) | **Implemented** |
| 9 | `graceful-persist` | Place → LevelDB restart → overlay+bag+chest | **Implemented** |
| 10 | `two-client` | B sees A's `update_block` | **Implemented** |

## Wave-2 (extremes / peer fidelity)

| Script | Assert (bot) | Status |
|--------|--------------|--------|
| `peer-ground` | Parked peer Absolute `flags & 1` (ON_GROUND) | **Implemented** |
| `dig-idle` | `block_start_break` then idle → `block_stop_break` | **Implemented** |
| `gamemode-peer` | Creative command → B `remove_entity` + `add_player` | **Implemented** |
| `floor-pickup` | Full bag dig → `add_item_entity` → delay → `take_item_entity` | **Implemented** |
| `join-skin` | Login skin MAGIC on peer PlayerList ADD | **Implemented** |
| `sound` | Peer hears `level_sound_event` `"place"` | **Implemented** |

**Bonus:** `smoke:skin` — two bots mid-game PlayerSkin relay (§49).

**Out of bot scope:** SoftCap grief, Xbox auth, launcher UI, persona-complete skins beyond MAGIC.

**Debt rule:** when Zenith bumps `ServerIdentity.ProtocolVersion` / `VersionName`, bump this repo’s `ZENITH_BOT_VERSION` / minecraft-data pin in the **same** change window — do not let the bot lag silently.

## Scope

- **Now:** first-wave #1–#10 + wave-2 extremes + skin bonus.
- **Not this repo:** Bedrock Launcher mods; Xbox CI auth; replacing human Gate A for tags.

## CI

Opt-in later (boot Zenith + this bot). Zenith PR gate remains `dotnet test` only.

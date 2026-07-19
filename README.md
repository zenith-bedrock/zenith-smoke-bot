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
4. In this repo:

```bash
bun install
bun pm trust raknet-native   # run native install script (blocked by default)
bun run smoke:join
bun run smoke:skin
```

Default RakNet backend is **`raknet-native`**. Pure JS (`ZENITH_RAKNET=jsp-raknet`) currently fails CRA address parse against Zenith’s RakNet — do not use for smoke until fixed.

**UUID note:** Zenith `BinaryStream` UUID wire ≠ plain RFC bytes that `bedrock-protocol` writes. Skin smoke uses `toZenithWireUuidString()` so inbound `PlayerSkin` UUID matches `Player.Uuid` (§49).

## Commands

```bash
# terminal A — from zenith checkout
dotnet run -c Release --project src/zenith/zenith.csproj

# terminal B
bun install
bun run smoke:join
bun run smoke:skin   # two clients; A→server→B PlayerSkin relay
```

| Env | Default |
|-----|---------|
| `ZENITH_HOST` | `127.0.0.1` |
| `ZENITH_PORT` | `19132` |
| `ZENITH_BOT_USERNAME` | `ZenithSmoke` (join only) |
| `ZENITH_BOT_A` / `ZENITH_BOT_B` | `SmokeSkinA` / `SmokeSkinB` (skin only) |
| `ZENITH_BOT_VERSION` | `1.26.30` |
| `ZENITH_SMOKE_TIMEOUT_MS` | `30000` |

Exit **0** = success. Exit **1** = timeout / kick / assert fail.

## Priority smokes (first wave — do not expand early)

Wire-level only. Human Gate A still owns UI mesh / crack feel / lid visuals.

| # | Id | Assert (bot) | Status |
|---|----|--------------|--------|
| 1 | `join` | Offline connect → `start_game` → `spawn` | **Implemented** (`bun run smoke:join`) |
| 2 | `skin-relay` | Two bots: A `player_skin` → B receives same classic RGBA (§49) | **Implemented** (`bun run smoke:skin`) |
| 3 | `place` | Place allowlisted block → `update_block` | Planned |
| 4 | `break` | Break → inventory or floor-drop; cell air | Planned |
| 5 | `inv-hotbar` | Stack count drops after place | Planned |
| 6 | `respawn` | Void → death/respawn → spawn; bag intact | Planned |
| 7 | `chest-open` | Single chest → 27 content | Planned |
| 8 | `double-chest` | Pair → **54** slots on wire | Planned |
| 9 | `dig-timing` | Survival dig rejects early break | Planned |
| 10 | `graceful-persist` / peer place | LevelDB flush **or** B sees A's place | Planned |

**Out of first wave:** persona-complete join skins, SoftCap grief, Xbox auth, launcher UI.

**Debt rule:** when Zenith bumps `ServerIdentity.ProtocolVersion` / `VersionName`, bump this repo’s `ZENITH_BOT_VERSION` / minecraft-data pin in the **same** change window — do not let the bot lag silently.

## Scope

- **Now:** #1 `join`, #2 `skin-relay`.
- **Next:** #3–#5 (place/break/inv), then chest / dig / persist.
- **Not this repo:** Bedrock Launcher mods; Xbox CI auth; replacing human Gate A for tags.

## CI

Opt-in later (boot Zenith + this bot). Zenith PR gate remains `dotnet test` only.

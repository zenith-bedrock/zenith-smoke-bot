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
```

Default RakNet backend is **`raknet-native`**. Pure JS (`ZENITH_RAKNET=jsp-raknet`) currently fails CRA address parse against Zenith’s RakNet — do not use for smoke until fixed.

## Commands

```bash
# terminal A — from zenith checkout
dotnet run -c Release --project src/zenith/zenith.csproj

# terminal B
bun install
bun run smoke:join
```

| Env | Default |
|-----|---------|
| `ZENITH_HOST` | `127.0.0.1` |
| `ZENITH_PORT` | `19132` |
| `ZENITH_BOT_USERNAME` | `ZenithSmoke` |
| `ZENITH_BOT_VERSION` | `1.26.30` |
| `ZENITH_SMOKE_TIMEOUT_MS` | `30000` |

Exit **0** = spawn reached. Exit **1** = timeout / kick / error.

## Priority smokes (first 10 — do not expand early)

Wire-level only. Human Gate A still owns UI mesh / crack feel / lid visuals.

| # | Id | Assert (bot) | Status |
|---|----|--------------|--------|
| 1 | `join` | Offline connect → `start_game` → `spawn` | **Implemented** (`bun run smoke:join`) |
| 2 | `place` | Place allowlisted block on air cell → see server `update_block` (or world truth via inventory consume) | Planned |
| 3 | `break` | Break stone/dirt → inventory or floor-drop path; cell becomes air | Planned |
| 4 | `inv-hotbar` | Hotbar/content sync after place consume (stack count drops) | Planned |
| 5 | `respawn` | Move below void → death/respawn handshake → back at spawn; bag intact | Planned |
| 6 | `chest-open` | Open single chest → container open + 27 content | Planned |
| 7 | `double-chest` | Pair present → open either half → **54** slots on wire | Planned |
| 8 | `dig-timing` | Survival dig with tool → break only after required ticks (reject early) | Planned |
| 9 | `graceful-persist` | Place + chest write → SIGTERM flush → reconnect → overlays/`ct:` still there | Planned (needs LevelDB `world.path`) |
| 10 | `two-client` | Bot A places → Bot B (second client) receives `update_block` | Planned |

**Out of first 10:** skin, emote, soft entity edge cases, SoftCap grief, Xbox auth, launcher UI.

**Debt rule:** when Zenith bumps `ServerIdentity.ProtocolVersion` / `VersionName`, bump this repo’s `ZENITH_BOT_VERSION` / minecraft-data pin in the **same** change window — do not let the bot lag silently.

## Scope

- **Now:** #1 `join`.
- **Next:** #2–#4 (place/break/inv), then chest / dig / persist / two-client.
- **Not this repo:** Bedrock Launcher mods; Xbox CI auth; replacing human Gate A for tags.


## CI

Opt-in later (boot Zenith + this bot). Zenith PR gate remains `dotnet test` only.

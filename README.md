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

## Scope

- **Now:** `smoke:join` — login path.
- **Next:** place / dig / chest open (wire steps mirroring Zenith Gate A; not UI mesh).
- **Not this repo:** Bedrock Launcher mods; Xbox CI auth; replacing human Gate A for tags.

## CI

Opt-in later (boot Zenith + this bot). Zenith PR gate remains `dotnet test` only.

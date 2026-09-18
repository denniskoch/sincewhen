<h1 align="center">SinceWhen</h1>

<p align="center">
  The IT wall of shame — a big screen counting how long since each thing last went wrong.
</p>

<p align="center">
  <a href="https://github.com/denniskoch/sincewhen/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/denniskoch/sincewhen/actions/workflows/ci.yml/badge.svg">
  </a>
  <a href="https://github.com/denniskoch/sincewhen/pkgs/container/sincewhen">
    <img alt="GHCR" src="https://img.shields.io/badge/ghcr.io-denniskoch%2Fsincewhen-blue?logo=docker&logoColor=white">
  </a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

![The wall display](docs/screenshots/display.jpg)

Put it on the TV nobody was using. It scrolls your counters like film credits,
counts up from the last time each thing happened, and refreshes itself. When
something goes wrong again, somebody hits **Reset** — or your monitoring does
it for you.

- **`/`** — the wall display. Meant to be left running for weeks.
- **`/admin`** — password-protected CRUD for the counters.
- **`POST /api/events`** — so Nagios, CI, or a shell script can trip a counter.

## Quick start

No checkout needed — the published image is on GHCR.

```bash
curl -O https://raw.githubusercontent.com/denniskoch/sincewhen/main/docker-compose.ghcr.yml
curl -o .env https://raw.githubusercontent.com/denniskoch/sincewhen/main/.env.example
```

Edit `.env`. At minimum set `ADMIN_PASSWORD`, and generate `SESSION_SECRET`:

```bash
openssl rand -base64 32
```

Paste the whole output, including the trailing `=` — it is part of the value,
and the parser splits on the first `=` only. Then:

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

The board is at <http://localhost:8080>, the admin at
<http://localhost:8080/admin>. Counters live in a named volume, so they survive
`docker compose down`.

Set `SEED_DEMO_DATA=true` on a first run if you want a few example counters to
look at.

### Say what you're counting

`PAGE_TITLE` sets the heading on the wall and the browser tab title:

```bash
PAGE_TITLE="Days Since We Last Broke Production"
```

It is read at runtime, not baked in at build time, so the same published image
works for everyone. Up to 60 characters; longer titles wrap rather than
overflow.

## Screenshots

|                                             |                                                   |
| ------------------------------------------- | ------------------------------------------------- |
| ![Admin](docs/screenshots/admin.png)        | The admin: add, edit, reset and delete counters.  |
| ![Editing](docs/screenshots/admin-edit.png) | Editing a counter, including when it happened.    |
| ![Sign in](docs/screenshots/login.png)      | The admin is behind a password. The board is not. |

## Stack

| Layer    | Choice                                                                    |
| -------- | ------------------------------------------------------------------------- |
| Backend  | TypeScript, [Fastify 5](https://fastify.dev), [Kysely](https://kysely.dev) |
| Database | SQLite **or** Postgres — same schema, picked with one env var              |
| Frontend | TypeScript, React 19, Vite, Tailwind v4, shadcn/ui                         |
| Shared   | `@sincewhen/shared` — zod schemas used by both sides                       |
| Runtime  | One Docker image serving the API and the built frontend                    |

## Running it

Three compose files, mix as needed:

| File                          | What it does                                            |
| ----------------------------- | ------------------------------------------------------- |
| `docker-compose.ghcr.yml`     | Pulls the published image. No source checkout needed.   |
| `docker-compose.yml`          | Builds from source instead. For development.            |
| `docker-compose.postgres.yml` | An **override**: swaps SQLite for a Postgres service.   |

```bash
# Published image, SQLite
docker compose -f docker-compose.ghcr.yml up -d

# Published image, Postgres
docker compose -f docker-compose.ghcr.yml -f docker-compose.postgres.yml up -d

# Build from source, SQLite
docker compose up --build
```

On macOS this was developed against [Colima](https://github.com/abiosoft/colima)
(`colima start`). The image is published for `linux/amd64` and `linux/arm64`.

## Local development

Requires Node 22+ and pnpm.

```bash
pnpm install
cp .env.example .env     # set ADMIN_PASSWORD and SESSION_SECRET
pnpm dev
```

`pnpm dev` runs three things in parallel:

| Package  | What it does                                | Port   |
| -------- | ------------------------------------------- | ------ |
| `shared` | `tsc --watch`, rebuilding shared types      | —      |
| `server` | Fastify with `tsx watch`                    | `3000` |
| `web`    | Vite dev server, proxying `/api` to `:3000` | `5173` |

Open <http://localhost:5173>. The API port is pinned to 3000 so the Vite proxy
can find it; override with `API_PORT`.

```bash
pnpm build       # build all three packages
pnpm typecheck   # tsc across the workspace
pnpm test        # 27 tests against a real database
```

Tests run against a real temporary SQLite database, not mocks. Point
`TEST_DATABASE_URL` at a Postgres instance to run the identical suite against
Postgres instead — CI does both on every push:

```bash
TEST_DATABASE_URL=postgres://test:test@localhost:5432/test pnpm test
```

## Configuration

See [`.env.example`](.env.example) for the annotated list. The ones that matter:

| Variable            | Default              | Notes                                                                        |
| ------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `PAGE_TITLE`        | `Time Passed Since`  | Heading on the wall and the tab title                                          |
| `DB_CLIENT`         | `sqlite`             | `sqlite` or `postgres`                                                         |
| `SQLITE_PATH`       | `./data/sincewhen.db`| SQLite only; `/data/sincewhen.db` in Docker                                    |
| `DATABASE_URL`      | —                    | Required when `DB_CLIENT=postgres`                                             |
| `ADMIN_PASSWORD`    | —                    | **Required.** Unlocks `/admin`                                                 |
| `SESSION_SECRET`    | —                    | **Required.** Min 32 chars; signs the cookie                                   |
| `SESSION_TTL_HOURS` | `12`                 | How long a login lasts                                                         |
| `API_TOKENS`        | *(none)*             | Tokens for external tools; see below                                           |
| `COOKIE_SECURE`     | `false`              | Set `true` when serving over HTTPS                                             |
| `SEED_DEMO_DATA`    | `false`              | Inserts example counters into an *empty* database                              |
| `APP_PORT`          | `8080`               | Host port published by compose                                                 |

The server refuses to start if `ADMIN_PASSWORD` or `SESSION_SECRET` is missing
or too short, rather than coming up insecure.

## API

| Method   | Path                      | Auth  |                                     |
| -------- | ------------------------- | ----- | ----------------------------------- |
| `GET`    | `/api/health`             | —     | Status and active DB backend        |
| `GET`    | `/api/config`             | —     | Runtime settings for the frontend   |
| `GET`    | `/api/counters`           | —     | All counters, newest incident first |
| `GET`    | `/api/counters/:id`       | —     | One counter                         |
| `POST`   | `/api/events`             | token | Record an incident by counter name  |
| `POST`   | `/api/counters/:id/reset` | token | Set the incident time to now        |
| `POST`   | `/api/counters`           | admin | Create                              |
| `PATCH`  | `/api/counters/:id`       | admin | Update any subset of fields         |
| `DELETE` | `/api/counters/:id`       | admin | Delete                              |
| `POST`   | `/api/auth/login`         | —     | Sets the session cookie             |
| `POST`   | `/api/auth/logout`        | —     | Clears it                           |
| `GET`    | `/api/auth/me`            | —     | Whether the caller is signed in     |

Errors are always `{ "error": { "message", "code", "fields"? } }`. Validation
failures include per-field messages, which the admin form renders next to the
offending input.

Two levels of access:

- **admin** — the browser session cookie from `/admin`. Full control.
- **token** — an API token, *or* an admin session. May record incidents and
  nothing else: a monitoring script cannot rename or delete a counter.

## Recording incidents from other tools

Set `API_TOKENS` and external tools can trip a counter without a browser.
Generate the tokens in a shell:

```bash
openssl rand -hex 24    # one per tool
```

then paste the results into `.env`, as `label:token` pairs:

```dotenv
API_TOKENS=nagios:1ed2c59397efd829da5922d5e661d0499275a026c4a0b1c0,ci:9f3b...
```

> `.env` is **not** a shell script. Writing `$(openssl rand -hex 24)` in it
> stores that text literally rather than running it — and the result is long
> enough to pass validation, so you would get a published string as your token
> and no error. Always run the command yourself and paste the output.

The label is what shows up in the log, so you can tell which tool reported an
incident. Tokens must be at least 16 characters or the server refuses to start.
Leave `API_TOKENS` unset and machine access is off entirely.

Counters are addressed by `name` — the stable key a script can hard-code —
rather than by numeric id:

```bash
curl -X POST http://localhost:8080/api/events \
  -H "Authorization: Bearer $SINCEWHEN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"counter": "prod-outage"}'
```

```json
{ "counter": { "id": 1, "name": "prod-outage", "lastIncidentAt": "..." },
  "created": false, "updated": true }
```

| Field         | Required | Meaning                                        |
| ------------- | -------- | ---------------------------------------------- |
| `counter`     | yes      | The counter's `name`                           |
| `occurredAt`  | no       | ISO-8601 timestamp; defaults to now            |
| `description` | no       | Only used when creating a counter              |
| `create`      | no       | Create the counter if missing. Default `false` |

Two behaviours worth knowing, both there because machines retry:

- **Events only move a counter forward.** An `occurredAt` older than the
  incident already recorded returns `200` with `"updated": false` and changes
  nothing. A board that says "days since" has to show the *most recent*
  incident, so a replayed or late-delivered alert must not rewind the clock.
  Sending the same event twice is therefore a no-op.
- **An unknown `counter` is a 404 unless you pass `"create": true`.** A typo in
  a monitoring config fails loudly instead of quietly littering the board with
  near-duplicate counters. When creating, `description` is required.

`/api/events` is rate-limited to 120 requests per minute.

### A helper for cron or CI

```bash
sincewhen_event() {
  curl -fsS -X POST "$SINCEWHEN_URL/api/events" \
    -H "Authorization: Bearer $SINCEWHEN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"counter\": \"$1\"}" > /dev/null
}

sincewhen_event prod-outage
```

## Database

One table, `counters`:

| Column             | Type                        | Notes                            |
| ------------------ | --------------------------- | -------------------------------- |
| `id`               | serial / integer PK         |                                  |
| `name`             | varchar(80), unique         | Short key, not shown on the board |
| `description`      | varchar(200)                | The line the board displays      |
| `last_incident_at` | timestamptz / ISO-8601 text | What the counter counts from     |
| `created_at`       | timestamptz / ISO-8601 text |                                  |
| `updated_at`       | timestamptz / ISO-8601 text |                                  |

Migrations live in [`packages/server/src/db/migrate.ts`](packages/server/src/db/migrate.ts)
and run automatically on boot, inside a transaction, recorded in a `migrations`
table. Running them twice is a no-op, so restarting a container is safe.

Timestamps come back as `Date` from Postgres and as strings from SQLite; the
repository layer normalises both to ISO-8601 UTC so the API response is
identical whichever backend is in use.

## Security notes

- The admin password is compared with a timing-safe hash comparison, never `===`.
- The session cookie is `httpOnly`, `SameSite=Lax`, and signed with
  `SESSION_SECRET`; an unsigned or expired cookie is rejected.
- API tokens are compared the same way, and every configured token is checked
  even after a match so the work done does not reveal which one matched.
- Login is rate-limited to 10 attempts per 5 minutes per IP; the rest of the API
  allows 300 requests/minute, with the display's polling exempt so a wall screen
  can never lock itself out.
- All queries go through Kysely's parameter binding.

## Releases

Pushing to `main` publishes `ghcr.io/denniskoch/sincewhen:latest` and a
`sha-<commit>` tag. Tagging `v1.2.3` also publishes `1.2.3`, `1.2` and `1`.
Images are multi-arch and carry a signed build provenance attestation.

Pin a version in production:

```bash
SINCEWHEN_TAG=1.2.3 docker compose -f docker-compose.ghcr.yml up -d
```

## History

This replaces a PHP/Apache app that ran against MySQL. The original is kept in
[`legacy/`](legacy/) for reference. Differences worth knowing:

- **The admin is no longer open to the world.** It previously had no
  authentication at all — anyone who could reach the URL could delete counters.
- **SQL injection is gone.** The old admin interpolated `$_POST` straight into
  queries.
- **`setup.php` is gone.** It never worked (it quoted identifiers with `'` and
  executed the wrong variable); migrations run automatically now.
- **Counters are addressed by `id`, not `name`.** Renaming used to orphan them.
- **MySQL is no longer supported**, in favour of SQLite for simple deployments
  and Postgres for shared ones.

The display is deliberately unchanged in spirit: same credits scroll, same
condensed type, same crimson numbers. It now scrolls at a constant speed
regardless of how many counters there are, restarts with no blank gap, pauses on
hover so you can read an entry, and respects `prefers-reduced-motion`.

## License

MIT

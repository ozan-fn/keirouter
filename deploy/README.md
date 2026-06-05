# Deploy KeiRouter

KeiRouter can run as a local binary, a single Docker container with SQLite, or a
container plus Postgres for team/VPS deployments.

## Local Development (One-Liner)

Run this single command — it clones, installs deps, and starts everything:

```bash
curl -fsSL https://raw.githubusercontent.com/mydisha/keirouter/main/scripts/quickstart.sh | bash
```

No `.env`, no config, no manual steps. It will:
- Check Go 1.24+ and Node.js 20+ are installed
- Clone the repo to `~/keirouter` (or use existing checkout)
- Install frontend dependencies (npm ci)
- Download Go modules
- Start backend (:20180) and dashboard (:5180) with hot reload

Dashboard: http://localhost:5180 (password: `keirouter`)

> **Already have the repo?** Just run `make setup` from the project root.

## Local Install (Binary)

Build and install the binary + dashboard assets system-wide:

```bash
curl -fsSL https://raw.githubusercontent.com/mydisha/keirouter/main/scripts/install.sh | bash
keirouter
```

If you prefer Docker and do not want Go/Node.js on the machine:

```bash
curl -fsSL https://raw.githubusercontent.com/mydisha/keirouter/main/scripts/install.sh | bash -s -- --docker
```

## VPS With Docker Compose

```bash
git clone https://github.com/mydisha/keirouter.git
cd keirouter
cp .env.example .env
```

Edit `.env` and set a stable `KEIROUTER_MASTER_KEY`:

```bash
openssl rand -base64 32
```

Start the default SQLite deployment:

```bash
docker compose up -d --build
docker compose logs -f keirouter
```

Open `http://YOUR_SERVER_IP:20180` or put it behind your reverse proxy.

## VPS With Postgres

Set `POSTGRES_PASSWORD` in `.env`, then run:

```bash
docker compose -f compose.yaml -f deploy/compose.postgres.yaml up -d --build
```

The app container still stores runtime secrets and generated files in `/data`,
while request/account data is stored in Postgres.

## Coolify And Similar Platforms

Use one of these deployment styles:

- Docker Compose app: use `compose.yaml`.
- Dockerfile app: use `deploy/Dockerfile`, expose port `20180`, and mount
  persistent storage at `/data`.

Recommended environment variables:

```bash
KEIROUTER_DATA__DIR=/data
KEIROUTER_SERVER__HOST=0.0.0.0
KEIROUTER_SERVER__PORT=20180
KEIROUTER_SECURITY__BIND_LOOPBACK_ONLY=false
KEIROUTER_SECURITY__MASTER_KEY=<base64 32-byte key>
KEIROUTER_LOG__FORMAT=json
```

If you install dashboard assets to a custom path, set
`KEIROUTER_FRONTEND_DIR=/path/to/frontend/dist`.

For a managed Postgres database, also set:

```bash
KEIROUTER_DATABASE__DRIVER=postgres
KEIROUTER_DATABASE__DSN=postgres://USER:PASSWORD@HOST:5432/DB?sslmode=require
```

## Updates

```bash
git pull
docker compose up -d --build
```

For the local source installer, rerun the install command.

## Security Notes

- Keep `KEIROUTER_SECURITY__MASTER_KEY` stable and backed up.
- Use HTTPS when exposing the dashboard outside localhost.
- The dashboard has session auth, but production deployments should still sit
  behind a reverse proxy, firewall, or platform access control.
- The default dashboard password is `keirouter`; change it on first login.

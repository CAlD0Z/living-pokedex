# Living Pokédex

A self-hosted **Living Pokédex** tracker — keep tabs on every Pokémon you've caught
across every mainline game, from Red & Blue all the way to Scarlet & Violet and
Legends: Z-A. Browse per-game dexes, see where each species can be caught, track
shiny progress, and manage multiple trainers — all from one tidy web app.

**🐙 GitHub:** https://github.com/CAlD0Z/living-pokedex  
**🐳 Docker Hub:** https://hub.docker.com/r/caldoz/living-pokedex

![pokeball](https://raw.githubusercontent.com/CAlD0Z/living-pokedex/main/web/public/favicon.svg)

## Features

- **Per-game dexes** for every generation, including DLC dexes (Isle of Armor,
  Crown Tundra, Kitakami, Blueberry) and the HOME / shiny dexes.
- **Wild & static encounter data** for every game — where to catch each species,
  with methods, levels, conditions and requirements.
- **Location browser & filters** — filter the grid by location, hide caught, split
  two games side by side, and more.
- **Multiple trainers** with individual progress, plus a shared leaderboard.
- **Stats & suggestions** — completion rings, recommended next catches, shiny hunts.
- **Admin tools** — built-in encounter scrapers and a Static & Special Encounters
  viewer.

All encounter data is sourced from and references
[Bulbapedia](https://bulbapedia.bulbagarden.net/) (content under
[CC BY-NC-SA 2.5](https://creativecommons.org/licenses/by-nc-sa/2.5/)).

## Quick start (fresh install)

You need [Docker](https://docs.docker.com/get-docker/) with the Compose plugin.

1. Create a folder and drop in this [`compose.yaml`](compose.yaml).
2. Start it:

   ```bash
   docker compose up -d
   ```

   On first boot the app creates the database, restores the bundled Pokémon
   reference data, and creates a starter admin account. This takes a minute or so
   — watch progress with `docker compose logs -f living-pokedex`.

3. Open **http://localhost:3000** and sign in with the bootstrap admin:

   | Username | Password |
   | -------- | -------- |
   | `admin`  | `admin`  |

4. **Change the admin password immediately** (Settings → Account), then add your
   trainers under Settings → Admin → Accounts.

That's it — no SSO, no identity provider, nothing to configure. The app is ready
to use out of the box.

## Authentication

Sign-in is **local username/password by default**, and **OIDC / SSO is turned
OFF**. A fresh install ships with no identity-provider configuration whatsoever —
you never have to think about it.

If you *want* SSO later, it's entirely optional and configured in-app:

> Settings → Admin → Authentication → enable & fill in your OIDC provider
> (issuer, client ID, secret, redirect URI), then test and save.

You can also seed the defaults via environment variables (see below) if you'd
rather configure it declaratively.

## Configuration

All settings are optional — the defaults give you a working, local-only install.

| Variable | Default | What it does |
| --- | --- | --- |
| `SESSION_SECRET` | dev secret | Cookie-signing secret. **Set a long random value in production.** |
| `SESSION_TTL_DAYS` | `30` | How long a login lasts. |
| `SESSION_SECURE` | `false` | Set `true` when serving over HTTPS. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin` | Bootstrap admin created when the users table is empty. |
| `AUTH_ENABLED` | `true` | Master login switch. `false` = no login wall (single-user / home-lab mode). |
| `AUTH_LOCAL_ENABLED` | `true` | Default for username/password sign-in. Editable in Admin. |
| `AUTH_OIDC_ENABLED` | `false` | Default for OIDC sign-in. Editable in Admin. |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` / `OIDC_LABEL` | empty | Optional default OIDC connection settings. Editable in Admin. |
| `DATABASE_URL` (+ `PG*`) | see compose | PostgreSQL connection. |
| `PORT` | `3000` | Port the app listens on inside the container. |

Runtime auth changes made in the Admin panel are persisted in the database and
re-applied on the next boot.

## Upgrading

```bash
docker compose pull
docker compose up -d
```

Your data lives in the `pgdata` volume and is preserved across upgrades.

## Resetting / starting over

The database (including your trainers and caught progress) persists in the
`pgdata` Docker volume. To wipe everything and start from a clean, freshly-seeded
database:

```bash
docker compose down -v   # ⚠️ deletes the pgdata volume — all progress is lost
docker compose up -d
```

## Building from source

```bash
git clone <this repo>
cd living-pokedex
docker build -t caldoz/living-pokedex:latest --target prod .
```

The repository is laid out as:

- `web/` — the Node/Express app (server + client assets)
- `db/` — schema (`init.sql`), migrations, and the bundled reference-data seed
- `scripts/` — encounter scraper / seed utilities

## Credits

Encounter and species data is sourced from and references
[Bulbapedia](https://bulbapedia.bulbagarden.net/), the community-driven Pokémon
encyclopedia. Pokémon and all related names are trademarks of Nintendo, Game Freak
and The Pokémon Company. This project is a fan-made tool and is not affiliated
with any of them.

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not (yet) use versioned releases: `main` is the only
release line, and the Unreleased section accumulates the next wave of
changes until they are tagged. History prior to the first entry below is
recorded in the git log (`git log --oneline`).

## [Unreleased]

### Added

- `SECURITY.md`, `CONTRIBUTING.md`, `pull_request_template.md`, and
  issue templates — the front door for contributors and operators.
- Continuous integration (`.github/workflows/ci.yml`): shellcheck,
  app unit tests, and the 53-assertion smoke test on every push.
- TLS on port 443 via `configs/nginx/conf.d/default.conf`, a shared
  `configs/nginx/snippets/server.conf`, and `gen-dev-cert.sh`
  (idempotent, `FORCE=1`, `CERT_DAYS=3650`).
- Real healthchecks on every service and `depends_on: condition: service_healthy`.
- Per-service security hardening: `no-new-privileges`, dropped capabilities,
  read-only root filesystems with `tmpfs`, CPU/memory limits.
- `.github/dependabot.yml` tracking the SHA-pinned actions and image tags,
  grouping minor/patch updates and surfacing majors separately.
- `smoke-test.sh`, `app/.dockerignore`, and 27 app unit tests.
- `LICENSE` (MIT).

### Changed

- Published ports bound to `127.0.0.1`; application port no longer published.
- `POSTGRES_PASSWORD` and `REDIS_PASSWORD` are required (`${VAR:?msg}`);
  Redis runs with `requirepass`.
- Ollama moved behind the `ai` profile so it doesn't start by default.
- `start.sh` reads real container ports instead of guessing from `.env`.
- The application is built from `app/Dockerfile` (Node 25, non-root user)
  instead of an inline heredoc.
- `volumes/app` renamed to `app/`; `volumes/` now holds only nginx content.
- `container_name` removed for parallel-safe, project-scoped stacks.
- Images pinned to explicit tags.
- Base images bumped by Dependabot: `node:24-alpine` → `node:25-alpine` and
  `postgres:17-alpine` → `postgres:18-alpine`. To support the PostgreSQL 18
  image, the `postgres-data` volume is now mounted at `/var/lib/postgresql`
  instead of `/var/lib/postgresql/data` — the image puts PGDATA in a
  major-version-specific subdirectory and refuses to start from the old
  mount point. Existing volumes from PostgreSQL 17 must be re-initialized.
- Renamed to Spectre Server Layer, including the Compose project name, the
  `spectre-server-layer-app:local` image tag, the `spectre-server-layer-app`
  package name, and the Redis cache key prefix. The stack had never been
  started under the old name, so no volumes or containers were left behind.

### Fixed

- Bind mounts use `:z` for SELinux, and `app/package.json` / the landing
  page corrected from mode `100755` to `100644`.
- Canned nginx `/health` removed; nginx config mount failure that prevented
  startup fixed.
- Corpus of obsolete nginx configs/configs files deleted.
- TLS assertion made independent of OpenSSL's human-readable subject formatting.
- Inert `configs/logging.json` and `configs/logrotate.conf` removed.

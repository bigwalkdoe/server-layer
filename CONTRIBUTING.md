# Contributing

Thanks for considering a contribution. This repo is a small, opinionated
stack — nginx, a Node service, PostgreSQL, Redis, and an optional Ollama
profile — built to run in a specific way. The fixes that get merged are
the ones that don't break that way.

## Before you start

- **Linux is the supported host.** macOS works for most things, but
  SELinux matters: bind mounts carry `:z` because the host may be
  enforcing, and `/home` being mode `0710` is a plausible reason a
  container can't read a mount. If you run into "permission denied" on a
  Linux host, `ls -Z` and the container logs usually tell you why.
- You need: Docker (Engine or Desktop) with Compose, `openssl`, and
  `shellcheck`.
- Copy the environment template first: `cp configs/.env.example configs/.env`.
- Host ports `8081`/`8443` are assumed free. Override `NGINX_HTTP_PORT`
  and `NGINX_HTTPS_PORT` in `configs/.env` if they clash.

## Running it

```sh
./start.sh            # env check, cert generation, docker compose up, smoke test
./status.sh           # health, resources, port mappings
./logs.sh nginx       # nginx | app | postgres | redis  +  -f to follow
./stop.sh             # keeps volumes
./stop.sh -v          # also removes volumes
```

## Making a change

1. Fork and branch off `main`. Keep changes focused — one topic per PR.
2. Make your change.
3. Run the checks the CI runs (see below).
4. Open a pull request using the template and fill in every section.

Don't mix behaviour changes with unrelated reformatting; reviewers can't
tell what's deliberate.

## Checks

The CI runs three jobs, and a change should pass all of them locally:

```sh
# unit tests (hermetic — no network)
make -C app test      # or:  cd app && npm test

# shell syntax + style on the scripts
shellcheck -S style start.sh stop.sh status.sh logs.sh smoke-test.sh

# end-to-end (needs a free port; CI uses 8081/8443)
./smoke-test.sh
```

If a script changes, the smoke test must still pass; an assertion that
needs `FORCE=1` or `CERT_DAYS=3650` knobs should be updated with rationale
in the PR.

## What makes a PR land

- The PR template checklist is complete and accurate.
- New behaviour has a test (unit for `app/lib/`, a smoke assertion for
  runtime behaviour).
- New env vars are documented in `configs/.env.example` and the "Env vars"
  table in `README.md`.
- README stays truthful — "No TLS is configured"-style claims that have
  gone stale are the single most common bug in this repo.
- No secrets, generated keys, or generated certs are committed
  (`configs/nginx/certs/*` is gitignored except `.gitkeep`).

## Commit style

Short, imperative subject line; body explains the *why*, not the diff.
Follow the style of the existing log (`git log --oneline`). `ci:` prefixes
the automated action bumps that Dependabot proposes.

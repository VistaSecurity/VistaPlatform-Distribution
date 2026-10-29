# Installing Vista Platform Core

Two ways in. Both pull the same signed images from `ghcr.io/vistasecurity` and
apply the same database schema from the release's `schema` image; neither needs
the source code, a local build, a licence key or an account with us.

| | What you get | Needs |
| --- | --- | --- |
| [Docker Compose](#docker-compose-one-host) | The whole platform on one host, to evaluate it | Docker Engine with Compose v2.24 or later, 4 CPU, 8 GB of memory, 20 GB of disk, linux/amd64 |
| [Helm](#helm-kubernetes) | A Kubernetes deployment you can run for real | A cluster with the prerequisites in [deploy/helm/README.md](deploy/helm/README.md) |

Every release on this repository's Releases page is named `vX.Y.Z` and attaches
the files below; take them all from the **same** release. The commands use
`v5.3.0` as an example: substitute the release you are installing.

> **Provided "as is", used at your own risk.** Before you deploy an agent, read
> [DISCLAIMER.md](DISCLAIMER.md), in particular
> [authorized use](DISCLAIMER.md#authorized-use-only): scan only what you own
> or are authorized to assess, and take care with OT/ICS networks.

## Docker Compose (one host)

### Install

```bash
VERSION=v5.3.0
mkdir vista && cd vista
for f in compose.yaml env.example SHA256SUMS SHA256SUMS.sigstore.json; do
  curl -fsSLO "https://github.com/VistaSecurity/VistaPlatform-Distribution/releases/download/${VERSION}/${f}"
done
```

Verify the two files before you run them, with `cosign` v3 (`VERIFY.md` of the
release explains the identity, and what to add for cosign v2):

```bash
cosign verify-blob SHA256SUMS --bundle SHA256SUMS.sigstore.json \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
sha256sum --ignore-missing -c SHA256SUMS
```

Generate the secrets, one random value each, into `.env`:

```bash
umask 077
for v in POSTGRES_PASSWORD REDIS_PASSWORD NATS_PASSWORD JWT_SECRET INTERNAL_AUTH_SECRET ENCRYPTION_MASTER_KEY; do
  echo "$v=$(openssl rand -hex 32)"; done > .env
```

`env.example` lists every variable `compose.yaml` reads, with the optional
ones commented. Do not copy it to `.env` as it is: its secrets are empty on
purpose, and compose refuses to start until each one is set. Keep `.env` and
back it up: `ENCRYPTION_MASTER_KEY` encrypts the device and integration
credentials you store, and a different key makes them unreadable.

Start it:

```bash
docker compose up -d
docker compose ps -a
```

The first start pulls the images and applies the database schema. The `schema`
and `db-migrate` containers run once and exit with code 0; that is their
normal state. If `db-migrate` exits otherwise, `docker compose logs db-migrate`
says why. Every other container should be `running`.

Then open **<http://localhost:3000>** and sign up. The first account you create
becomes the administrator of a new organization, and that first sign-up closes
self-service sign-up: everyone else joins your organization by invitation (an
operator can reopen it in the admin console under **Settings → Access &
Sign-up**).

### What this install is, and is not

- **One host, plain HTTP, bound to 127.0.0.1.** The web UI (`:3000`), the
  admin console (`:3006`) and the API gateway (`:8080`) answer on this host
  only. To reach them from elsewhere, put a TLS-terminating proxy in front and
  set `VISTA_BIND_ADDRESS` and `COOKIE_SECURE=true` in `.env`; for anything
  beyond an evaluation, use Helm.
- **Agents on this host only.** Agent mTLS is always on: sensors and device
  agents enroll through the gateway and then talk to the agent listeners on
  `:8444` (sensors) and `:8446` (device agents) with the client certificate
  they were issued. The listeners' certificates name `localhost`, so an agent
  on another machine cannot connect to this install.
- **No service mesh.** The services talk to each other over compose's private
  network with HMAC-signed requests. The Helm chart adds mutual TLS between
  every service (and, by default, to PostgreSQL and NATS); compose has no
  certificate authority to issue those certificates.
- **No high availability and no rolling upgrade.** Everything shares one host.

### The admin console

Signing up at the web UI makes you an administrator of *an organization*. The
**platform** admin console (organizations, plans, platform-wide settings) is a
separate UI with separate accounts, at **<http://localhost:3006>**.

Every install seeds two platform administrators with the same password:

| Email | Role |
| --- | --- |
| `su_admin@vistaplatform.invalid` | super admin |
| `admin@vistaplatform.invalid` | platform admin |

Password: `PlatformAdm!n2026`

**These are published defaults, the same on every install.** Both accounts are
seeded "must change password": a session signed in with the default can set a
new password and do nothing else, and the services enforce that, not just the
UI. The `.invalid` domain (RFC 6761) never resolves, so password-reset mail to
them goes nowhere: rotate on first sign-in, then create your own platform
administrator under a real address (**Staff & Access → Staff**).

### Upgrade

[Back up](#back-up-and-restore) first, then replace `compose.yaml` with the next
release's (verified as above) and start again; keep `.env`:

```bash
docker compose up -d
```

`db-migrate` applies the new release's schema to the existing database. A
schema statement that fails against your data stops it, compose then starts
none of the services, and restoring the backup is the way back (see
[Back up and restore](#back-up-and-restore)). Read the release notes before
every upgrade.

### Back up and restore

**A database dump alone is not a backup of this install.** The two agent
listeners (`:8444` for sensors, `:8446` for device agents) run their own
certificate authority, created on first start and kept in two Docker volumes,
`sensor_manager_agent_tls` and `device_interrogation_agent_tls`. Every enrolled
agent pins that authority. The database does not contain it: restore only the
database and the platform mints a new authority on its next start, your tenants,
users, assets and certificates come back, and **every enrolled sensor and
device agent is locked out** (`x509: certificate signed by unknown authority`)
until it is enrolled again.

Keep, together, from the same moment:

| What | Why |
| --- | --- |
| `pg_dump -Fc` of `crypto_inventory` | Tenants, users, inventory, agents, the per-tenant certificates agents present. |
| `pg_dumpall --globals-only` | The database roles the schema grants to. |
| The two volumes above, as tar archives | The agent listener authority, its key and certificate. |
| `.env` | Above all `ENCRYPTION_MASTER_KEY`: a different one makes every stored credential unreadable. |

The backup holds private keys and the secrets of `.env`. Keep it off this host,
readable by you alone.

Redis, NATS and the upload, report and PCAP volumes are not in the list. The
recovery below was proven without them: tenants, users, agents, certificates
and assets all came back. Files the services wrote to those volumes (uploads,
generated reports, uploaded captures) are not restored; archive those volumes
the same way if you depend on them.

**With the helper scripts.** `backup.sh` and `restore.sh` do exactly the steps
below. They are plain shell: read them before you run them, they are not
covered by `SHA256SUMS`, and the manual commands do the same. Fetch them at the
release you installed:

```bash
for f in backup.sh restore.sh; do
  curl -fsSLO "https://raw.githubusercontent.com/VistaSecurity/VistaPlatform-Distribution/${VERSION}/scripts/${f}"
done
chmod +x backup.sh restore.sh

./backup.sh --dry-run        # prints what it would do, changes nothing
./backup.sh                  # writes ./vista-backup-<date>/, with the install running
```

To restore, on the host that will run the install, in the directory holding
that release's `compose.yaml` (the backup's `env` becomes `.env`):

```bash
cp vista-backup-<date>/env .env
./restore.sh --from vista-backup-<date> --dry-run
./restore.sh --from vista-backup-<date>
```

`restore.sh` refuses a backup that lacks any file, whose checksums do not
match, or whose `ENCRYPTION_MASTER_KEY` differs from `.env`. It also refuses to
restore into a project that already has containers or volumes. `--force`
removes that project's containers and **all** its volumes first, so use it only
when replacing the install is what you want.

**By hand.** Backup, with the install running, from the directory holding
`compose.yaml` and `.env` (`PROJECT` is the compose project name, the directory
name unless you set `COMPOSE_PROJECT_NAME`; `docker volume ls` shows it as the
prefix of `sensor_manager_agent_tls`):

```bash
umask 077
PROJECT=vista
B="vista-backup-$(date -u +%Y%m%d-%H%M%S)"; mkdir "$B"
IMG=$(docker inspect -f '{{.Config.Image}}' "$(docker compose ps -q postgres)")

docker compose exec -T postgres pg_dump -U crypto_user -d crypto_inventory -Fc > "$B/database.dump"
docker compose exec -T postgres pg_dumpall -U crypto_user --globals-only > "$B/globals.sql"
for v in sensor_manager_agent_tls device_interrogation_agent_tls; do
  docker run --rm -v "${PROJECT}_${v}:/v:ro" "$IMG" tar -C /v -czf - . > "$B/${v}.tgz"
done
cp .env "$B/env"
```

Restore, in this order. Start from a host with no volumes of this project (a
new host, or after `docker compose down -v` on the old install), `compose.yaml`
of the release and `.env` from the backup in place:

```bash
B=vista-backup-<date>; PROJECT=vista

# 1. Postgres alone, on a fresh volume.
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U crypto_user -d crypto_inventory; do sleep 2; done

# 2. Roles. The bootstrap role already exists, so leave it out.
grep -v -E '^(CREATE|ALTER) ROLE crypto_user( |;)' "$B/globals.sql" \
  | docker compose exec -T postgres psql -U crypto_user -d postgres -q -v ON_ERROR_STOP=1

# 3. The database. Stop at the first error rather than restore half of it.
docker compose exec -T postgres pg_restore -U crypto_user -d crypto_inventory --exit-on-error < "$B/database.dump"

# 4. The two agent listener volumes, before the listeners start.
IMG=$(docker inspect -f '{{.Config.Image}}' "$(docker compose ps -q postgres)")
for v in sensor_manager_agent_tls device_interrogation_agent_tls; do
  docker volume create \
    --label "com.docker.compose.project=${PROJECT}" --label "com.docker.compose.volume=${v}" \
    --label "com.docker.compose.version=$(docker compose version --short)" "${PROJECT}_${v}"
  docker run --rm -i -v "${PROJECT}_${v}:/v" "$IMG" tar -C /v -xzf - < "$B/${v}.tgz"
done

# 5. Everything else. db-migrate re-applies the schema over the restored data.
docker compose up -d
docker compose ps -a
```

`schema` and `db-migrate` exit with code 0 and everything else is `running`.
Sign in, and an agent that was enrolled before the backup reconnects on its
stored certificate without enrolling again. Step 4 must come before step 5: if
the listeners start first they create a new authority in the empty volumes, and
restoring the archives afterwards needs the listeners stopped
(`docker compose stop sensor-manager device-interrogation-service`).

Try a restore on a spare host before you need one. A backup you have never
restored is a guess.

To remove the install and its data: `docker compose down -v`.

## Helm (Kubernetes)

[deploy/helm/README.md](deploy/helm/README.md) is the full procedure: the
prerequisites the chart does not install, a values file to start from
(`values-core.example.yaml`), the install command at an exact chart version,
the chart's signature, and the upgrade rule (`pg_dump` first). In short:

```bash
helm install vista oci://ghcr.io/vistasecurity/vistaplatform --version 5.3.0 \
  --namespace vista --create-namespace --values values-core.yaml
```

The published chart pins every image by digest, so `--version` decides
exactly which bytes run.

## The agents

The sensor and the device interrogation agent are not part of this repository.
They are open source (Apache-2.0) and released, signed, by
[VistaSecurity/VistaPlatform-Agents](https://github.com/VistaSecurity/VistaPlatform-Agents).

- **From the console:** **Discovery → Sensors & Agents** offers the exact
  agent release your platform version was tested with, for each supported
  operating system, with its digest. If your version has no tested agent
  release, the page says so rather than offering a guess.
- **By hand:** `AGENTS.md` of your platform release names that agent release
  (tag, channel and compatibility record). Download it from the agents
  repository's release of that exact tag and verify it as that repository's
  `docs/verify-release.md` describes before you run it.

The sensor needs libpcap on Linux and macOS, and Npcap on Windows, which you
install yourself under Npcap's own licence. Windows binaries are not
Authenticode-signed and macOS binaries are not notarized; the Sigstore
signature is what proves where a file came from.

## Verify what you run

[VERIFY.md](VERIFY.md) has the identities and commands for the images, the
chart, the release files and the agents. Verify before you install, and again
when you upgrade.

## After it is up

1. **Sign up** at the web UI and invite the rest of your team from **Settings →
   Members**.
2. **Deploy a sensor** (see [The agents](#the-agents)) so there is something to
   inventory.
3. **Look at Infrastructure** once discovery has run, then **generate a CBOM**
   from Risk & Compliance.

## Before anyone else uses it

**Replace the Terms of Service and Privacy Policy.** An install ships with
templates (real structure with blanks to fill and a banner saying they are not
legally binding), and every user is asked to accept them at sign-up. You run
the instance, so those are your terms with your users; only you can write them.
Edit and publish them in the admin console under **Settings → Legal**; each
acceptance is recorded against the version and its content hash. Have counsel
review them first.

## When something does not come up

Compose:

- **A container exits with `address already in use`**: another program owns
  that port. Set the matching `*_HOST_PORT` variable in `.env` (see
  `env.example`) and run `docker compose up -d` again.
- **`db-migrate` exits non-zero**: `docker compose logs db-migrate`. "the schema
  image carries schema …, this compose file was stamped for …" means
  `compose.yaml` and the `schema` image come from different releases.
- **Sign-up succeeds but sign-in says "Email not verified"**: you set
  `SMTP_HOST` but mail is not delivered. Fix delivery or unset it; with no
  mail server configured, verification is not required.

Helm: see [deploy/helm/README.md](deploy/helm/README.md#when-something-does-not-come-up).

#!/usr/bin/env bash
# Restore a Vista Platform Core Docker Compose install from a backup.sh directory.
#
#   restore.sh --from BACKUP_DIR [--file COMPOSE_FILE] [--env-file ENV_FILE]
#              [--project NAME] [--force] [--dry-run]
#
# Run it in the directory that holds this release's compose.yaml, on the host
# that will run the install. Put the backup's `env` file there as .env first
# (cp BACKUP_DIR/env .env): ENCRYPTION_MASTER_KEY must be the one the backup
# was taken with, or every stored credential is unreadable.
#
# The order matters, and is the order this script runs:
#
#   1. start postgres alone, on a fresh volume
#   2. restore the roles (globals.sql)
#   3. pg_restore --exit-on-error the database
#   4. restore the two agent-listener TLS volumes
#   5. docker compose up -d, which lets db-migrate re-apply the schema
#
# Step 4 is not optional. Enrolled agents pin the listener CA that lives in
# those volumes; a database-only restore makes the platform mint a new CA and
# locks out every enrolled agent.
#
# It refuses to restore into a project whose containers or volumes already
# exist. --force removes them first (docker compose down -v: the project's
# containers and ALL of its volumes, including its database); without --force
# nothing is touched. --dry-run prints what would run and changes nothing.
set -euo pipefail

DB_USER=crypto_user
DB_NAME=crypto_inventory
TLS_VOLUMES=(sensor_manager_agent_tls device_interrogation_agent_tls)
# Every named volume of the compose file; any of them existing means an install
# is already here.
ALL_VOLUMES=(postgres_data redis_data nats_data uploads_data report_storage pcap_uploads sensor_manager_agent_tls device_interrogation_agent_tls)

FROM=""
FILE=compose.yaml
ENV_FILE=.env
PROJECT=""
FORCE=0
DRY=0

die() { echo "restore: $*" >&2; exit 1; }
usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --from) [ $# -ge 2 ] || die "--from needs a directory"; FROM=$2; shift 2 ;;
    --file) [ $# -ge 2 ] || die "--file needs a path"; FILE=$2; shift 2 ;;
    --env-file) [ $# -ge 2 ] || die "--env-file needs a path"; ENV_FILE=$2; shift 2 ;;
    --project) [ $# -ge 2 ] || die "--project needs a name"; PROJECT=$2; shift 2 ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker is not on PATH"
[ -n "$FROM" ] || die "--from BACKUP_DIR is required"
[ -d "$FROM" ] || die "$FROM is not a directory"
[ -f "$FILE" ] || die "$FILE not found: run this in the directory that holds compose.yaml, or pass --file"
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found: copy the backup's env file to .env first (cp $FROM/env .env)"

# --- the backup must be whole, and intact, before anything is touched --------
FROM=$(cd "$FROM" && pwd)
NEEDED=(database.dump globals.sql "${TLS_VOLUMES[0]}.tgz" "${TLS_VOLUMES[1]}.tgz" env SHA256SUMS)
for f in "${NEEDED[@]}"; do
  [ -s "$FROM/$f" ] || die "$FROM/$f is missing or empty: this is not a complete backup. Without the two agent TLS archives a restore locks out every enrolled agent"
done
( cd "$FROM" && sha256sum -c --quiet SHA256SUMS ) >/dev/null 2>&1 \
  || die "the checksums in $FROM/SHA256SUMS do not match its files: the backup is damaged or was changed"

key_of() { sed -n 's/^ENCRYPTION_MASTER_KEY=//p' "$1" | head -n 1; }
[ -n "$(key_of "$FROM/env")" ] || die "$FROM/env has no ENCRYPTION_MASTER_KEY"
[ "$(key_of "$FROM/env")" = "$(key_of "$ENV_FILE")" ] \
  || die "ENCRYPTION_MASTER_KEY in $ENV_FILE differs from the backup's: restoring with another key makes every stored credential unreadable. Use the backup's env file as .env"

if [ -z "$PROJECT" ]; then
  PROJECT=$(docker compose -f "$FILE" --env-file "$ENV_FILE" config 2>/dev/null | sed -n 's/^name: *//p' | head -n 1)
  [ -n "$PROJECT" ] || die "cannot tell the compose project name: pass --project"
fi
dc() { docker compose -f "$FILE" --env-file "$ENV_FILE" -p "$PROJECT" "$@"; }

# --- refuse to restore over an install -----------------------------------------
EXISTING=()
for v in "${ALL_VOLUMES[@]}"; do
  if docker volume inspect "${PROJECT}_${v}" >/dev/null 2>&1; then EXISTING+=("${PROJECT}_${v}"); fi
done
if [ -n "$(dc ps -aq 2>/dev/null | head -n 1)" ]; then EXISTING+=("(containers of project $PROJECT)"); fi
if [ ${#EXISTING[@]} -gt 0 ] && [ "$FORCE" != 1 ]; then
  echo "restore: project '$PROJECT' already has: ${EXISTING[*]}" >&2
  die "refusing to restore over an existing install. Restore into a new project (--project, or another directory), or pass --force to delete the existing containers and volumes first"
fi

if [ "$DRY" = 1 ]; then
  echo "restore (dry run): project $PROJECT from $FROM; nothing is changed"
  [ ${#EXISTING[@]} -eq 0 ] || echo "  docker compose -p $PROJECT down -v        (--force: removes ${EXISTING[*]})"
  echo "  docker compose -p $PROJECT up -d postgres"
  echo "  (wait for pg_isready)"
  echo "  psql -U $DB_USER -d postgres < globals.sql (without the $DB_USER lines)"
  echo "  pg_restore -U $DB_USER -d $DB_NAME --exit-on-error < $FROM/database.dump"
  for v in "${TLS_VOLUMES[@]}"; do
    echo "  docker volume create ${PROJECT}_${v}; docker run --rm -i ... <postgres image> tar -C /v -xzf - < $FROM/${v}.tgz"
  done
  echo "  docker compose -p $PROJECT up -d"
  exit 0
fi

if [ ${#EXISTING[@]} -gt 0 ]; then
  echo "restore: --force: removing the project's containers and volumes: ${EXISTING[*]}"
  dc down -v
fi

echo "restore: 1/5 postgres, on a fresh volume"
dc up -d postgres
ready=0
for _ in $(seq 1 90); do
  if dc exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || die "postgres did not become ready in three minutes: docker compose logs postgres"

echo "restore: 2/5 roles"
# The bootstrap role already exists in the new database; re-creating it fails.
grep -v -E "^(CREATE|ALTER) ROLE ${DB_USER}( |;)" "$FROM/globals.sql" \
  | dc exec -T postgres psql -U "$DB_USER" -d postgres -q -v ON_ERROR_STOP=1

echo "restore: 3/5 database"
dc exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --exit-on-error < "$FROM/database.dump"

echo "restore: 4/5 agent listener TLS volumes"
VERSION=$(docker compose version --short)
PGIMG=$(docker inspect -f '{{.Config.Image}}' "$(dc ps -q postgres | head -n 1)")
[ -n "$PGIMG" ] || die "cannot read the postgres image"
for v in "${TLS_VOLUMES[@]}"; do
  docker volume create \
    --label "com.docker.compose.project=${PROJECT}" \
    --label "com.docker.compose.volume=${v}" \
    --label "com.docker.compose.version=${VERSION}" \
    "${PROJECT}_${v}" >/dev/null
  docker run --rm -i -v "${PROJECT}_${v}:/v" "$PGIMG" tar -C /v -xzf - < "$FROM/${v}.tgz"
done

echo "restore: 5/5 the whole install (db-migrate re-applies the schema)"
dc up -d
echo "restore: done. Check: docker compose ps -a  (schema and db-migrate exit 0; everything else running)"

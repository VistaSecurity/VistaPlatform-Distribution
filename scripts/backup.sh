#!/usr/bin/env bash
# Back up a Vista Platform Core Docker Compose install.
#
#   backup.sh [--out DIR] [--file COMPOSE_FILE] [--env-file ENV_FILE]
#             [--project NAME] [--dry-run]
#
# Run it in the directory that holds compose.yaml and .env, on the host that
# runs the install, with the install up (the database must be running).
#
# It writes one directory (default ./vista-backup-<UTC date and time>) holding
# everything a restore needs, and nothing less is a backup:
#
#   database.dump                     pg_dump -Fc of crypto_inventory
#   globals.sql                       pg_dumpall --globals-only (the roles)
#   sensor_manager_agent_tls.tgz      the sensor listener's CA, key and certificate
#   device_interrogation_agent_tls.tgz  the device-agent listener's, likewise
#   env                               a copy of .env
#   SHA256SUMS                        checksums of the above
#
# The two archives matter as much as the dump. Enrolled agents pin the CA that
# lives in those volumes, and a database dump does not contain it: a restore
# without them locks out every enrolled agent. The directory holds private keys
# and the secrets of .env: it is created readable by you alone; keep it
# somewhere only you can reach, and off this host.
#
# --dry-run prints what would run and changes nothing.
# Restore with restore.sh from the same directory this script is in.
set -euo pipefail

DB_USER=crypto_user
DB_NAME=crypto_inventory
TLS_VOLUMES=(sensor_manager_agent_tls device_interrogation_agent_tls)

OUT=""
FILE=compose.yaml
ENV_FILE=.env
PROJECT=""
DRY=0

die() { echo "backup: $*" >&2; exit 1; }
usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --out) [ $# -ge 2 ] || die "--out needs a directory"; OUT=$2; shift 2 ;;
    --file) [ $# -ge 2 ] || die "--file needs a path"; FILE=$2; shift 2 ;;
    --env-file) [ $# -ge 2 ] || die "--env-file needs a path"; ENV_FILE=$2; shift 2 ;;
    --project) [ $# -ge 2 ] || die "--project needs a name"; PROJECT=$2; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker is not on PATH"
[ -f "$FILE" ] || die "$FILE not found: run this in the directory that holds compose.yaml, or pass --file"
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found: it holds the install's secrets and is part of the backup"

if [ -z "$PROJECT" ]; then
  PROJECT=$(docker compose -f "$FILE" --env-file "$ENV_FILE" config 2>/dev/null | sed -n 's/^name: *//p' | head -n 1)
  [ -n "$PROJECT" ] || die "cannot tell the compose project name: pass --project"
fi
dc() { docker compose -f "$FILE" --env-file "$ENV_FILE" -p "$PROJECT" "$@"; }

[ -n "$OUT" ] || OUT="vista-backup-$(date -u +%Y%m%d-%H%M%S)"
[ ! -e "$OUT" ] || die "$OUT already exists: a backup never overwrites another"

# Everything is checked before anything is written, so a refusal leaves nothing
# behind that looks like a backup.
PG=$(dc ps -q postgres 2>/dev/null | head -n 1)
[ -n "$PG" ] || die "the postgres service of project '$PROJECT' is not running: start the install (docker compose up -d) and run this again"
for v in "${TLS_VOLUMES[@]}"; do
  docker volume inspect "${PROJECT}_${v}" >/dev/null 2>&1 \
    || die "volume ${PROJECT}_${v} does not exist: without it a backup cannot keep the agent listener CA, and a restore would lock out every enrolled agent. Is --project right?"
done
IMAGE=$(docker inspect -f '{{.Config.Image}}' "$PG")
[ -n "$IMAGE" ] || die "cannot read the postgres image of $PG"

if [ "$DRY" = 1 ]; then
  echo "backup (dry run): project $PROJECT, into $OUT/; nothing is changed"
  echo "  mkdir -m 700 $OUT"
  echo "  docker compose -p $PROJECT exec -T postgres pg_dump -U $DB_USER -d $DB_NAME -Fc > $OUT/database.dump"
  echo "  docker compose -p $PROJECT exec -T postgres pg_dumpall -U $DB_USER --globals-only > $OUT/globals.sql"
  for v in "${TLS_VOLUMES[@]}"; do
    echo "  docker run --rm -v ${PROJECT}_${v}:/v:ro $IMAGE tar -C /v -czf - . > $OUT/${v}.tgz"
  done
  echo "  cp $ENV_FILE $OUT/env"
  echo "  sha256sum database.dump globals.sql ${TLS_VOLUMES[*]/%/.tgz} env > $OUT/SHA256SUMS"
  exit 0
fi

umask 077
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
trap 'rc=$?; if [ $rc -ne 0 ]; then echo "backup: FAILED (exit $rc): $OUT is incomplete, do not use it" >&2; fi' EXIT

echo "backup: database"
dc exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$OUT/database.dump"
[ -s "$OUT/database.dump" ] || die "pg_dump wrote nothing"
echo "backup: roles"
dc exec -T postgres pg_dumpall -U "$DB_USER" --globals-only > "$OUT/globals.sql"
[ -s "$OUT/globals.sql" ] || die "pg_dumpall wrote nothing"
for v in "${TLS_VOLUMES[@]}"; do
  echo "backup: volume $v"
  # Streamed out, so the archive is a file of yours (mode 600), not root's.
  docker run --rm -v "${PROJECT}_${v}:/v:ro" "$IMAGE" tar -C /v -czf - . > "$OUT/${v}.tgz"
  [ -s "$OUT/${v}.tgz" ] || die "the archive of $v is empty"
done
cp "$ENV_FILE" "$OUT/env"

( cd "$OUT" && sha256sum database.dump globals.sql "${TLS_VOLUMES[0]}.tgz" "${TLS_VOLUMES[1]}.tgz" env > SHA256SUMS )
echo "backup: done: $OUT"
echo "  keep it off this host and out of reach of anyone but you: it holds the agent listener keys and your .env"

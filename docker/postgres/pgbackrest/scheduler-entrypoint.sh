#!/bin/sh
set -eu

. /usr/local/bin/ehealth-pgbackrest-write-config
write_pgbackrest_config

config=/tmp/ehealth-pgbackrest.conf
stanza=ehealth

until pg_isready -h /var/run/postgresql -p 5432 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-ehealth_db}" >/dev/null 2>&1; do
  sleep 2
done

pgbackrest --config="$config" --stanza="$stanza" stanza-create
pgbackrest --config="$config" --stanza="$stanza" check

run_full_backup() {
  attempt=1
  while [ "$attempt" -le 3 ]; do
    if pgbackrest --config="$config" --stanza="$stanza" --type=full backup; then
      pgbackrest --config="$config" --stanza="$stanza" info
      return 0
    fi
    echo "Full backup attempt $attempt failed" >&2
    attempt=$((attempt + 1))
    sleep 300
  done
  echo "Full backup failed after 3 attempts; operator alert required" >&2
  return 1
}

if [ "${EHEALTH_BACKUP_RUN_FULL_ON_START:-false}" = "true" ]; then
  run_full_backup
fi

while :; do
  now_epoch=$(date +%s)
  today=$(date +%F)
  target_epoch=$(date -d "$today ${EHEALTH_BACKUP_FULL_TIME:-02:00}:00" +%s)
  if [ "$target_epoch" -le "$now_epoch" ]; then
    target_epoch=$(date -d "tomorrow ${EHEALTH_BACKUP_FULL_TIME:-02:00}:00" +%s)
  fi
  while [ "$(date +%s)" -lt "$target_epoch" ]; do
    sleep 60
  done
  run_full_backup || true
done

#!/bin/sh
set -eu

write_pgbackrest_config() {
  if [ -z "${PGBACKREST_REPO_CIPHER_PASS:-}" ]; then
    echo "PGBACKREST_REPO_CIPHER_PASS is required" >&2
    return 1
  fi
  case "$PGBACKREST_REPO_CIPHER_PASS" in
    *"
"*|*""*)
      echo "PGBACKREST_REPO_CIPHER_PASS must not contain line breaks" >&2
      return 1
      ;;
  esac
  if [ "${#PGBACKREST_REPO_CIPHER_PASS}" -lt 32 ]; then
    echo "PGBACKREST_REPO_CIPHER_PASS must contain at least 32 characters" >&2
    return 1
  fi

  umask 077
  mkdir -p /tmp/ehealth-pgbackrest-log /tmp/ehealth-pgbackrest-lock
  cat > /tmp/ehealth-pgbackrest.conf <<EOF
[global]
repo1-path=/var/lib/pgbackrest
repo1-retention-full=${PGBACKREST_RETENTION_FULL:-7}
repo1-retention-archive-type=full
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=${PGBACKREST_REPO_CIPHER_PASS}
start-fast=y
process-max=${PGBACKREST_PROCESS_MAX:-2}
compress-type=zst
archive-timeout=60
log-level-console=info
log-path=/tmp/ehealth-pgbackrest-log
lock-path=/tmp/ehealth-pgbackrest-lock

[ehealth]
pg1-path=/var/lib/postgresql/data
pg1-port=5432
pg1-socket-path=/var/run/postgresql
pg1-user=${POSTGRES_USER:-postgres}
EOF
  chmod 0600 /tmp/ehealth-pgbackrest.conf
}

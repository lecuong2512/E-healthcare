#!/bin/sh
set -eu

. /usr/local/bin/ehealth-pgbackrest-write-config
write_pgbackrest_config
chown postgres:postgres /tmp/ehealth-pgbackrest.conf /tmp/ehealth-pgbackrest-log /tmp/ehealth-pgbackrest-lock
if [ "${EHEALTH_BACKUP_REPO_READ_ONLY:-false}" != "true" ]; then
  mkdir -p /var/lib/pgbackrest
  chown postgres:postgres /var/lib/pgbackrest
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"

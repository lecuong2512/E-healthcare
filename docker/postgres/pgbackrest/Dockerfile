FROM postgres:16-bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends pgbackrest tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY write-config.sh /usr/local/bin/ehealth-pgbackrest-write-config
COPY postgres-entrypoint.sh /usr/local/bin/ehealth-postgres-entrypoint
COPY scheduler-entrypoint.sh /usr/local/bin/ehealth-pgbackrest-scheduler

RUN chmod 0755 \
    /usr/local/bin/ehealth-pgbackrest-write-config \
    /usr/local/bin/ehealth-postgres-entrypoint \
    /usr/local/bin/ehealth-pgbackrest-scheduler

ENTRYPOINT ["ehealth-postgres-entrypoint"]
CMD ["postgres"]

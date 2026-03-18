#!/usr/bin/env bash
# Open SSH tunnel for local dev: forwards localhost:5432 → server PostgreSQL
exec ssh -N -L 5432:localhost:5432 root@128.140.7.97 -i .ssh/id_ed25519

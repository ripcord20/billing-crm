# Base image for the FLAYNET / ISP NetOps Cloud Agent environment.
# Node 22 (repo requires >=18) plus a local MariaDB server so the app can run
# its Sequelize `sync()` against a real MySQL-compatible database.
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        mariadb-server \
        mariadb-client \
        ca-certificates \
        git \
    && rm -rf /var/lib/apt/lists/*

# Enable Corepack so yarn (pinned by the repo) is available.
RUN corepack enable || true

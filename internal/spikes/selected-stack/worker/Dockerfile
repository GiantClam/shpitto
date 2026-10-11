FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install --no-install-recommends --yes ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /fixture
COPY worker-probe.sh /usr/local/bin/worker-probe
RUN chmod 0755 /usr/local/bin/worker-probe

ENTRYPOINT ["/usr/local/bin/worker-probe"]

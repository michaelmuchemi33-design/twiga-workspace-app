FROM devlikeapro/waha:latest

USER root
ARG TIGRISFS_VERSION=1.2.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl fuse mount util-linux \
    && ARCH="$(dpkg --print-architecture)" \
    && case "$ARCH" in amd64) TIGRIS_ARCH=amd64 ;; arm64) TIGRIS_ARCH=arm64 ;; *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;; esac \
    && curl -fL "https://github.com/tigrisdata/tigrisfs/releases/download/v${TIGRISFS_VERSION}/tigrisfs_${TIGRISFS_VERSION}_linux_${TIGRIS_ARCH}.tar.gz" -o /tmp/tigrisfs.tar.gz \
    && tar -xzf /tmp/tigrisfs.tar.gz -C /usr/local/bin/ \
    && chmod +x /usr/local/bin/tigrisfs \
    && rm -f /tmp/tigrisfs.tar.gz \
    && rm -rf /var/lib/apt/lists/*

COPY twiga-entrypoint.sh /twiga-entrypoint.sh
RUN chmod 0755 /twiga-entrypoint.sh

ENV WHATSAPP_DEFAULT_ENGINE=GOWS
ENV WAHA_LOCAL_STORE_BASE_DIR=/app/.sessions
ENV USE_XVFB=false

WORKDIR /app
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/twiga-entrypoint.sh"]

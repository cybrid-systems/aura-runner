# syntax=docker/dockerfile:1
# Lumen Run. Aura is the prebuilt nightly tarball ./run.sh already
# downloads (sha256-checked). Node is the official linux tarball, not an
# npm install. The only apt step is CA certificates, because Aura's
# OpenSSL reads /usr/lib/ssl/certs. linux/amd64 and linux/arm64.

ARG BUILDPLATFORM
ARG TARGETARCH
ARG NODE_VERSION=22.23.5

FROM --platform=$BUILDPLATFORM debian:bookworm-slim AS fetch-amd64
ARG AURA_SHA_AMD64=
ARG NODE_VERSION
ADD https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-x86_64.tar.gz /tmp/aura.tar.gz
ADD https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-x86_64.tar.gz.sha256 /tmp/aura.sha256
ADD https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz /tmp/node.tar.gz
RUN set -eu; \
    got="$(sha256sum /tmp/aura.tar.gz | awk '{print $1}')"; \
    want="$(awk 'NF { print $1; exit }' /tmp/aura.sha256)"; \
    test -n "$want"; \
    test "$got" = "$want"; \
    if [ -n "$AURA_SHA_AMD64" ] && [ "$AURA_SHA_AMD64" != "$want" ]; then \
      echo "the published Aura checksum changed during the build" >&2; \
      exit 1; \
    fi; \
    mkdir -p /opt/aura /out; \
    tar -xzf /tmp/aura.tar.gz -C /opt/aura --strip-components=1; \
    tar -xzf /tmp/node.tar.gz -C /out --strip-components=1 node-v${NODE_VERSION}-linux-x64/bin/node; \
    rm -f /tmp/aura.tar.gz /tmp/aura.sha256 /tmp/node.tar.gz; \
    test -x /opt/aura/bin/aura; \
    test -x /opt/aura/rt/ld.so; \
    test -x /out/bin/node

FROM --platform=$BUILDPLATFORM debian:bookworm-slim AS fetch-arm64
ARG AURA_SHA_ARM64=
ARG NODE_VERSION
ADD https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-arm64.tar.gz /tmp/aura.tar.gz
ADD https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-arm64.tar.gz.sha256 /tmp/aura.sha256
ADD https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.gz /tmp/node.tar.gz
RUN set -eu; \
    got="$(sha256sum /tmp/aura.tar.gz | awk '{print $1}')"; \
    want="$(awk 'NF { print $1; exit }' /tmp/aura.sha256)"; \
    test -n "$want"; \
    test "$got" = "$want"; \
    if [ -n "$AURA_SHA_ARM64" ] && [ "$AURA_SHA_ARM64" != "$want" ]; then \
      echo "the published Aura checksum changed during the build" >&2; \
      exit 1; \
    fi; \
    mkdir -p /opt/aura /out; \
    tar -xzf /tmp/aura.tar.gz -C /opt/aura --strip-components=1; \
    tar -xzf /tmp/node.tar.gz -C /out --strip-components=1 node-v${NODE_VERSION}-linux-arm64/bin/node; \
    rm -f /tmp/aura.tar.gz /tmp/aura.sha256 /tmp/node.tar.gz; \
    test -x /opt/aura/bin/aura; \
    test -x /opt/aura/rt/ld.so; \
    test -x /out/bin/node

FROM fetch-${TARGETARCH} AS fetched

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=fetched /out/bin/node /usr/local/bin/node
COPY --from=fetched /opt/aura /opt/aura
ENV PATH="/opt/aura/bin:/usr/local/bin:${PATH}" \
    AURA_SANDBOX=off \
    AURA_RUNNER_BIND=0.0.0.0 \
    AURA_RUNNER_WEB=8080 \
    AURA_RUNNER_PORT=8765 \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
LABEL org.opencontainers.image.title="Lumen Run" \
      org.opencontainers.image.source="https://github.com/cybrid-systems/aura-runner" \
      org.opencontainers.image.description="Lumen Run, using the prebuilt Aura nightly."
WORKDIR /opt/lumen-run
COPY docker/entrypoint.sh /usr/local/bin/lumen-entrypoint
COPY aura.toml ./aura.toml
COPY core ./core
COPY lib ./lib
COPY web ./web
COPY bridge ./bridge
RUN chmod 755 /usr/local/bin/lumen-entrypoint /usr/local/bin/node
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/lumen-entrypoint"]

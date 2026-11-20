# syntax=docker/dockerfile:1
# Lumen Run in one image. Aura is the prebuilt nightly tarball ./run.sh
# already downloads (sha256-checked). Nothing here compiles Aura.
# linux/amd64 and linux/arm64: the fetch stage runs on the builder and
# only the matching bundle is unpacked into the target image.

ARG BUILDPLATFORM
FROM --platform=$BUILDPLATFORM debian:bookworm-slim AS aura
ARG TARGETARCH
ARG AURA_VERSION=nightly
# These two change when the nightly checksum changes, so the download
# layer is reused until then. Empty means "trust the published .sha256".
ARG AURA_SHA_AMD64=
ARG AURA_SHA_ARM64=
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x86_64; note="$AURA_SHA_AMD64" ;; \
      arm64) arch=arm64; note="$AURA_SHA_ARM64" ;; \
      *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    echo "aura ${AURA_VERSION} ${arch} checksum ${note:-published}"; \
    slug="$AURA_VERSION"; \
    if [ "$AURA_VERSION" != nightly ]; then slug="${AURA_VERSION#v}"; fi; \
    base="https://github.com/cybrid-systems/aura/releases/download/${AURA_VERSION}"; \
    name="aura-${slug}-linux-${arch}.tar.gz"; \
    curl -fL --retry 5 --retry-delay 2 --max-time 300 -o "/tmp/${name}.sha256" "${base}/${name}.sha256"; \
    curl -fL --retry 5 --retry-delay 2 --max-time 300 -o "/tmp/${name}" "${base}/${name}"; \
    got="$(sha256sum "/tmp/${name}" | awk '{print $1}')"; \
    want="$(awk 'NF { print $1; exit }' "/tmp/${name}.sha256")"; \
    if [ -z "$want" ] || [ "$got" != "$want" ]; then \
      echo "sha256 mismatch for ${name}" >&2; \
      exit 1; \
    fi; \
    if [ -n "$note" ] && [ "$note" != "$want" ]; then \
      echo "the published Aura checksum changed during the build" >&2; \
      exit 1; \
    fi; \
    mkdir -p /opt/aura; \
    tar -xzf "/tmp/${name}" -C /opt/aura --strip-components=1; \
    rm -f "/tmp/${name}" "/tmp/${name}.sha256"; \
    test -x /opt/aura/bin/aura; \
    test -x /opt/aura/rt/ld.so

FROM node:22-bookworm-slim AS node

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=aura /opt/aura /opt/aura
ENV PATH="/opt/aura/bin:${PATH}" \
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
RUN chmod 755 /usr/local/bin/lumen-entrypoint
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/lumen-entrypoint"]

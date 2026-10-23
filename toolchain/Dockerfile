# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS bootstrap
ARG SAFE_CHAIN_VERSION
ARG SAFE_CHAIN_SHA256
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/safe-chain /opt/shadow /opt/wrappers \
    && curl --fail --location --retry 3 "https://github.com/AikidoSec/safe-chain/releases/download/${SAFE_CHAIN_VERSION}/safe-chain-linuxstatic-x64" -o /opt/safe-chain/safe-chain \
    && echo "${SAFE_CHAIN_SHA256}  /opt/safe-chain/safe-chain" | sha256sum -c - \
    && chmod 755 /opt/safe-chain/safe-chain \
    && ln -s /usr/local/bin/npm /opt/shadow/npm \
    && ln -s /usr/local/bin/npx /opt/shadow/npx
COPY npm-wrapper /opt/wrappers/npm
RUN chmod 755 /opt/wrappers/npm && ln -s npm /opt/wrappers/npx
ENV PATH="/opt/wrappers:${PATH}"
WORKDIR /opt/pxt

FROM bootstrap AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python-is-python3 cmake make gcc-arm-none-eabi libnewlib-arm-none-eabi libstdc++-arm-none-eabi-newlib \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Install via safe-chain. No dependency lifecycle scripts execute implicitly.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY system-lock.mjs system-lock.json ./
RUN node system-lock.mjs
COPY native-lock.json native.mjs ./
RUN node native.mjs
COPY versions.json sources.mjs configure.mjs entry.mjs local-only.cjs ./
RUN node sources.mjs && node configure.mjs
ENV PXT_NODOCKER=1 PXT_FORCE_LOCAL=1 KS_FORCE_CLOUD=no HOME=/tmp/home
ENTRYPOINT ["node", "/opt/pxt/entry.mjs"]

FROM toolchain AS browser
RUN apt-get update && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*
COPY editor-test.mjs /opt/pxt/editor-test.mjs

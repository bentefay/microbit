# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 cmake ninja-build gcc libc6-dev \
    device-tree-compiler python3-yaml python3-pyelftools python3-packaging \
    python3-pykwalify python3-psutil python3-anytree python3-jsonschema \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/bluepad
COPY bluepad/sources.json bluepad/fetch.py ./
RUN python3 fetch.py
COPY bluepad/sdk.json ./
RUN python3 fetch.py sdk
COPY bluepad/system-lock.json /opt/pxt/system-lock.json
COPY system-lock.mjs /opt/pxt/system-lock.mjs
RUN node /opt/pxt/system-lock.mjs
ENV ZEPHYR_BASE=/opt/bluepad/zephyr ZEPHYR_TOOLCHAIN_VARIANT=zephyr ZEPHYR_SDK_INSTALL_DIR=/opt/zephyr-sdk
WORKDIR /build
CMD ["/opt/zephyr-sdk/gnu/arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc", "--version"]

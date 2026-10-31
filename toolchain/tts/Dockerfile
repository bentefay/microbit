# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
ARG PYTHON_IMAGE
FROM ${PYTHON_IMAGE} AS bootstrap
ARG SAFE_CHAIN_VERSION
ARG SAFE_CHAIN_SHA256
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/safe-chain \
    && curl --fail --location --retry 3 "https://github.com/AikidoSec/safe-chain/releases/download/${SAFE_CHAIN_VERSION}/safe-chain-linuxstatic-x64" -o /opt/safe-chain/safe-chain \
    && echo "${SAFE_CHAIN_SHA256}  /opt/safe-chain/safe-chain" | sha256sum -c - \
    && chmod 755 /opt/safe-chain/safe-chain
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/tts

FROM bootstrap AS tts
COPY requirements.lock ./
# Hash-locked direct URLs only; safe-chain screens each package as it installs.
RUN /opt/safe-chain/safe-chain pip install --no-deps --require-hashes -r requirements.lock
COPY assets.json fetch.py ./
RUN python3 fetch.py
COPY synthesize.py ./
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HOME=/tmp/hf
CMD ["python3", "/opt/tts/synthesize.py", "/prompts/prompts.json", "/out"]

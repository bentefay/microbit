# Bluepad container integration validation

Validated locally on 2026-10-25. The imported report-only Bluepad32/BTstack/Zephyr
application is experimental; successful compilation and programming do not prove
Bluetooth operation. See the [project workflow](../workspace/projects/bluepad/README.md).

## Reproduction

```sh
run image bluepad
run test
run bluepad test
run build bluepad
run build bluepad --nezha-compile-only
```

- Host CLI tests: 42 passed, 0 failed, 535 assertions.
- Packet tests passed inside the offline container with AddressSanitizer and
  UndefinedBehaviorSanitizer.
- Both native builds passed symbol, unresolved-reference, motor-call and HEX
  address checks. Default firmware has no motor adapter. The optional adapter
  build is a separate compile/link check and cannot be selected by `run flash`.
- Report-only Zephyr memory report: 242240 bytes flash, 36016 bytes RAM.
  These are static build figures, not measured runtime peaks.

The image fetches source and SDK archives using pinned hashes and sizes; its
Debian package manifest is checked against the committed lock. Compilation runs
offline, as the host UID/GID, with read-only source and root filesystem, dropped
capabilities and no hardware or Docker socket mounted. Bun/TypeScript orchestration
and the Docker service remain on the host. Safe-chain protects npm installation
in the existing MakeCode pipeline; it is not a runtime sandbox.

Image ID:
`sha256:23c9d3babae7eed1db1a717bee8b2ef3b6441f086c692bb523be6adf2cf416c4`

Report-only HEX SHA-256:
`edddf4e0787dec9813392edd60d19b82c935b3b3e0166ca4a08645c827410369`

## Programming and remaining hardware checks

With explicit user authorization, `run flash bluepad --confirm` programmed the
attached micro:bit at 2026-10-25 06:10:13 UTC. The same DAPLink device remounted,
and no `FAIL.TXT` was present. The existing MakeCode sources and build artifacts
were retained. No motor commands were issued.

The subsequent ten-second serial capture contained no lines. Startup output may
have preceded opening the capture; this does not establish successful boot or
failure. Boot output, controller pairing, input, disconnect/reconnect and bond
persistence remain to be observed with motors disconnected. Transfer verification
is recorded separately from hardware behavior in the generated flash receipt.

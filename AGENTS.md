# Working agreements

- Run tooling through `run` (or `cli/bin/run` before direnv is allowed).
- Host orchestration, diagnostics and tests belong in the TypeScript CLI.
- No ad hoc /tmp scripts, downloaded executable helpers, or unmanaged installs.
- npm dependencies are installed only through the image's pinned safe-chain wrapper.
- Dependency changes, troubleshooting commands and patches must be checked in.
- Builds must not flash. Flash only on explicit authorization. Motor activation
  additionally requires controlled bench readiness and measured steering limits.
- Never claim controller radio-loss detection from receiver readiness alone.
- Never call vendor PS2 reads in a timing-critical loop: their readiness loops
  have no timeout. Keep commissioning firmware motionless until calibration.
- The user pushes to GitHub. Do not create remote repos or push automatically.

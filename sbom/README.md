# Committed SBOM baselines

`npm-sbom.json` and `cargo-sbom.json` are the baselines the `sbom.yml`
workflow diffs each PR against (read from `main` via `git show`). They
start empty here; the first run of the SBOM workflow after this PR merges
to `main` should be used to populate them for real (open a follow-up PR
with the generated output, or wire an auto-commit step on merge — left as
a follow-up so this PR doesn't silently commit an unreviewed dependency
snapshot).

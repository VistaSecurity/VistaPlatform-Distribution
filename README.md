# Vista Platform distribution

> **Private staging repository.** Nothing here is released, supported or
> public yet. This repository is being prepared to become the public home of
> Vista Platform Core for its users. The work is tracked in the private epic
> VistaSecurity/VistaPlatform#2765; this README is replaced before the
> repository is made public.

## What this repository is for

The public home for people who run Vista Platform Core:

- **Issues**: bug reports and questions about Core.
- **Security advisories**: private vulnerability reports about the platform,
  and the advisories that follow them (see `SECURITY.md`). Reports about the
  sensor or the device interrogation agent go to the agents repository.
- **Release collateral**: per-release notes, deployment material for the
  container images and Helm chart, verification instructions and the platform
  terms. No platform source code is published here.
- **Compatibility references**: which signed builds of the public agents each
  platform release was tested with. The agents' binaries and installers are
  published by the agents repository; this repository points at those exact
  artefacts and never carries copies of its own.

## What moves here later

These are served from the old public Core repository today and move here
before it becomes private, so that a visibility change does not take them down:

- the documentation site;
- the release-status feed that the website reads;
- the image scan reports and the README badges that read them.

## Checks

`.github/workflows/ci.yml` runs on GitHub-hosted runners with a read-only
token: Markdown lint, a check that every relative link resolves, a check that
every JSON file parses and that every compatibility document validates against
its schema under `schemas/`, and `scripts/check-workflows.mjs`, which keeps
every workflow here on GitHub-hosted runners, SHA-pinned actions and read-only
pull-request permissions. Locally: `npm ci --ignore-scripts && npm run check &&
npm test`.

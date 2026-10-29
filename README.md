# Vista Platform

<!-- staging:begin. Remove from here to staging:end when the repository is made public. -->
> **Private staging repository.** Nothing here is released, supported or
> public yet. This repository is being prepared to become the public home of
> Vista Platform Core for its users. Before it is made public: remove this
> block and pin the [clean-cut notice](NOTICE-2026-10.md) as an issue.
<!-- staging:end -->

**Find every piece of cryptography in your estate, and prove what it is.**

Vista Platform discovers cryptographic assets across your network, builds an
inventory of the certificates, keys, algorithms and configurations actually in
use, tells you which of them a quantum computer will break, and generates a
CycloneDX Cryptographic Bill of Materials you can hand to an auditor. It is
self-hosted: your inventory never leaves your infrastructure.

This repository is the public home for people who run **Vista Platform Core**,
the free edition: how to install it, the files each release ships, how to
verify them, the issue tracker and the security-advisory intake. The platform's
source code is not published; Core is distributed as signed container images
and a signed Helm chart.

> **Provided "as is", used at your own risk.** There is no service-level
> agreement and no support commitment. Back up before every upgrade, and read
> [DISCLAIMER.md](DISCLAIMER.md) before you point the platform or its agents at
> anything.

## What changed

Releases after 5.2.1 are published here, not in the former public source
repository, which is no longer public. Download buttons in consoles of 5.2.1
and earlier point at files that no longer exist: upgrade. See the
[clean-cut notice](NOTICE-2026-10.md).

## Install

| | What you get | Needs |
| --- | --- | --- |
| [Docker Compose](INSTALL.md#docker-compose-one-host) | The whole platform on one host, to evaluate it | Docker Engine with Compose v2.24 or later |
| [Helm](deploy/helm/README.md) | A Kubernetes deployment | A cluster with cert-manager, Stakater Reloader, Traefik and a StorageClass |

Both pull signed images from `ghcr.io/vistasecurity`; neither needs the source
code, a local build or an account with us. [INSTALL.md](INSTALL.md) walks
through both. An air-gapped install starts from [deploy/OFFLINE.md](deploy/OFFLINE.md).

## What each release here carries

Each release `vX.Y.Z` on this repository's Releases page attaches:

| File | What it is |
| --- | --- |
| `compose.yaml`, `env.example` | the Docker Compose install, every image pinned to this release by tag and digest |
| `values-core.example.yaml` | a starting values file for the Helm chart |
| `IMAGES.txt` | every image of the release with its digest |
| `VERIFY.md` | how to verify the images, the chart and these files, for this release |
| `AGENTS.md` | the release of the public agents this platform version was tested with |
| `feature-status.json` | the capabilities the release ships and where each stands |
| `SHA256SUMS`, `SHA256SUMS.sigstore.json` | the digest of every file above, signed |

Use the files of one release together; never mix versions.

## The agents

The passive sensor and the device interrogation agent you run inside your own
network are open source under the Apache License 2.0, developed and released in
[VistaSecurity/VistaPlatform-Agents](https://github.com/VistaSecurity/VistaPlatform-Agents).
The platform's console (**Discovery → Sensors & Agents**) offers exactly the
agent release your platform version was tested with, and each release here
names it in `AGENTS.md`. This repository never carries copies of the agents'
binaries. Their security reports go to the agents repository.

## Editions

Vista Platform ships in three editions: **Vista Platform Core** (free),
**Vista Platform Enterprise** and **Vista Platform MSP** (sold direct, under
separate agreements). Core is a complete product for a single organization,
security included: tenant isolation, service-mesh mTLS, agent mTLS, RBAC and
audit logging are all in Core.

## Verify, terms, security

- [VERIFY.md](VERIFY.md): the signing identities and the commands that check
  what you pull.
- [TERMS.md](TERMS.md): the terms each thing you download carries.
- [LICENSE.md](LICENSE.md): the Vista Platform License, version 1.0, under which the platform releases are published.
- [SECURITY.md](SECURITY.md): report a vulnerability privately; never in a
  public issue.

Issues about Core (bugs, questions, documentation corrections) are welcome in
this repository's issue tracker. Code is not accepted here: there is no
platform source to change.

Vista Platform is made by Vista Security, the trading name of Lakeshore Labs
LLC.

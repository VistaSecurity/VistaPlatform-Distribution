# Terms

Each thing you can download for Vista Platform carries its own terms. There is
no blanket licence over all of them: this page lists what each one is and which
terms apply to it.

<!-- staging:begin. Remove from here to staging:end when the repository is made public. -->
> **Before this repository is made public, and before the first release is
> published here:** the platform licence that the rows below refer to does not
> exist as approved text yet (only its term sheet has been decided). Its text,
> name, version and SHA-256 are added to this repository and linked from this
> table first; until then this page states nothing about its terms beyond what
> is decided: the platform is proprietary and Core is free of charge.
<!-- staging:end -->

| What you download | From | Terms |
| --- | --- | --- |
| Vista Platform Core container images (`ghcr.io/vistasecurity/<image>`), including the `schema` image that carries the database SQL | GitHub Container Registry | The Vista Platform licence of that release: proprietary, and free of charge for Core. Third-party components inside each image keep their own licences. |
| The Helm chart (`oci://ghcr.io/vistasecurity/vistaplatform`) | GitHub Container Registry | The Vista Platform licence of that release, as above. |
| The files attached to a release in this repository (`compose.yaml`, `env.example`, `values-core.example.yaml`, `IMAGES.txt`, `VERIFY.md`, `AGENTS.md`, `feature-status.json`, `SHA256SUMS`) | This repository's Releases | The Vista Platform licence of the release they belong to. |
| The documentation in this repository | This repository | Copyright Lakeshore Labs LLC (d/b/a Vista Security). |
| The sensor and the device interrogation agent: binaries, installers, packages, SBOMs, release metadata and compatibility records | [VistaSecurity/VistaPlatform-Agents](https://github.com/VistaSecurity/VistaPlatform-Agents) releases | Apache License 2.0, with the `NOTICE` and `THIRD_PARTY_LICENSES` each release carries. Npcap, which the sensor uses on Windows, is not distributed with it and has its own licence. |
| Third-party images the compose install pulls: `postgres`, `valkey/valkey`, `nats`, `traefik` | Docker Hub | Their own licences: the PostgreSQL License, BSD-3-Clause, Apache License 2.0 and MIT respectively. |
| Vista Platform Core releases up to and including 5.2.1 | Wherever you obtained them | The Functional Source License 1.1 with the Apache 2.0 future licence (FSL-1.1-ALv2) they were published under, unchanged. Each converts to Apache 2.0 two years after it shipped. Later releases do not change those terms. |

Vista Platform Enterprise and Vista Platform MSP are licensed under separate
agreements and are not distributed here.

The software is provided "as is", without warranty of any kind, and used at
your own risk: [DISCLAIMER.md](DISCLAIMER.md) restates what that means in
practice. The licensor is Lakeshore Labs LLC, which does business as Vista
Security.

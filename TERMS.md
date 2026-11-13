# Terms

Each thing you can download for Vista Platform carries its own terms. There is
no blanket licence over all of them: this page lists what each one is and which
terms apply to it.

The platform licence is the **Vista Platform License, version 1.0** (29 October
2026): [LICENSE.md](LICENSE.md), SHA-256
`bf182dc284c6c9bc814ba5e4ac0ed7f9a97a70f66baeb00e92f5ce642f33d93e`. Every platform
release published here carries the text of the licence version it is published
under, inside each image at `/usr/share/doc/vista/LICENSE.md`, and names it in
the image's `org.opencontainers.image.licenses` label
(`LicenseRef-Vista-Platform-License-1.0`).

| What you download | From | Terms |
| --- | --- | --- |
| Vista Platform container images (`docker.io/vistasecurity/<image>`; Core is an install without a licence), including the `schema` image that carries the database SQL and the `tools` image that carries the operator tools | Docker Hub | The [Vista Platform License](LICENSE.md) of that release: proprietary, and free of charge for Core. Third-party components inside each image keep their own licences. |
| The Helm chart (`oci://docker.io/vistasecurity/vistaplatform`) | Docker Hub | The [Vista Platform License](LICENSE.md) of that release, as above. |
| The files attached to a release in this repository (`compose.yaml`, `env.example`, `values-core.example.yaml`, `IMAGES.txt`, `VERIFY.md`, `AGENTS.md`, `feature-status.json`, the operator tools `bundle-decrypt-<os>-<arch>` and `catalog-bundle-<os>-<arch>`, `SHA256SUMS`) | This repository's Releases | The [Vista Platform License](LICENSE.md) of the release they belong to. |
| The documentation in this repository | This repository | Copyright Lakeshore Labs LLC (d/b/a Vista Security). |
| The sensor and the device interrogation agent: binaries, installers, packages, SBOMs, release metadata and compatibility records | [VistaSecurity/VistaPlatform-Agents](https://github.com/VistaSecurity/VistaPlatform-Agents) releases | Apache License 2.0, with the `NOTICE` and `THIRD_PARTY_LICENSES` each release carries. Npcap, which the sensor uses on Windows, is not distributed with it and has its own licence. |
| Third-party images the compose install pulls: `postgres`, `valkey/valkey`, `nats`, `traefik` | Docker Hub | Their own licences: the PostgreSQL License, BSD-3-Clause, Apache License 2.0 and MIT respectively. |
| Vista Platform Core releases up to and including 5.2.1 | Wherever you obtained them | The Functional Source License 1.1 with the Apache 2.0 future licence (FSL-1.1-ALv2) they were published under, unchanged. Each converts to Apache 2.0 two years after it shipped. Later releases do not change those terms. |

Vista Platform Starter, Pro, Enterprise and MSP are licensed under separate
agreements and are not distributed here. They are the same images as Core: a
licence selects the edition.

The software is provided "as is", without warranty of any kind, and used at
your own risk: [DISCLAIMER.md](DISCLAIMER.md) restates what that means in
practice. The licensor is Lakeshore Labs LLC, which does business as Vista
Security.

## Privacy notice

This notice covers what a Vista Platform install tells the Vista Security
licensing service. The service is run by Lakeshore Labs LLC, which does
business as Vista Security. An install that has no licence and has never
started a trial sends no usage report and makes no call to the licensing
service: Vista Platform Core on its own does not report to us. Our documentation
page "What is reported to Vista Security" lists the same facts from the
operator's side.

### The 30-day trial

Notice version 2026-11-11.

The trial is free. In exchange, we ask the person starting it who they are and
for permission to contact them about the product. A platform admin starts the
trial from the card on the admin console by giving their **name**, **work email
address** and **company name**, and optionally a **phone number**, and by
ticking "I agree that Vista Security may contact me about Vista Platform". The
trial does not start without that agreement. The install sends these details to
our licensing service (`licensing.vistasecurity.io`) together with the install's
id, the public half of the key the install signs its reports with, the
database's system identifier and, where the install can read it, the
`kube-system` namespace UID, the platform version, and whether it runs on
Kubernetes or Docker Compose. The install itself does not keep the name,
company or phone: they are not written to its database, its audit log or its
logs.

- **What we use the details for:** to issue the trial licence; to send the
  welcome email and notices about the trial and any licence that follows; and,
  because you agreed to it in exchange for the trial, to contact you by email or
  phone about your evaluation and about Vista Platform. We record that you
  agreed, when, and under which version of this notice. We use the
  identifiers to refuse a second trial for the same installation and to
  recognise the install when it asks for its licence again. The trial licence
  itself carries only the domain of the address, not the address.
- **Domains we do not accept:** free-mail and disposable domains. A work domain
  can have at most two unexpired trials and three in a year.
- **We do not sell your details** or give them to anyone else to market to you.
- **How long we keep them:** the name, company and phone for two years after the
  trial ends, or for as long as you hold a licence from us if that is longer,
  and then we delete them. The email address is kept with the install id for as
  long as that installation's trial or licence record exists, because that
  record is what refuses a repeat trial.
- **To stop contact or have your details deleted:** write to
  `sales@vistasecurity.io`. We stop contacting you about the product, and we
  delete your name, company and phone, and your email address unless a licence
  you hold or a legal duty needs it. Stopping contact does not end a trial that
  is running.

### The usage report

Every licensed install, a trial included, prepares one signed usage report a
month. **An install without a licence (Core) collects and prepares nothing.** A
report holds:

- the install's id, platform version, the id of its signing key and the cluster
  fingerprint named above;
- the licence's subject, edition, licensee name, expiry, tenant cap if any, a
  hash of the licence token (not the token), the id of the key that signed it,
  and the install's role under it;
- for each tenant, a random identifier, when it was created and deleted, the
  days it was present, its lifecycle events, and its peak counts of customer
  sensors, device agents, assets, users and pending invitations;
- the names of the capabilities each tenant used from a short list, and the
  install-wide high-water mark of the counts above;
- how many daily snapshots were taken, and which days are missing.

It holds **no** tenant names, user names, email addresses, hostnames, IP
addresses, credentials, key material or inventory contents.

- **Purpose:** to true up the licence. We compare the high-water mark with what
  the licence allows and move a customer to the next edition when it has
  outgrown the one it holds. For an MSP it is also the monthly billing record.
  There is no per-unit overage billing at 6.0.
- **Cadence:** a daily snapshot of the counts on the install, and one report per
  calendar month, built on the first day of the next. The report is sent to
  our licensing service (`licensing.vistasecurity.io`, or the licensing
  endpoint set on the install) automatically, with the install's id, a
  timestamp and a signature made with the install's key. An install marked
  air-gapped sends nothing: the report is stored on the install, you can read
  and download it from Settings, License & Usage, and sending it is up to you.
- **Opting out:** an Enterprise licence can carry an opt-out, agreed in the
  contract with a manual true-up. The install then collects, builds and sends
  nothing, and the console says "Reporting disabled by licence".
- **See it first:** Settings, License & Usage, has a **Preview report** button
  that shows this month so far exactly as a report built now would carry it.

### The licence refresh

An install that holds a trial or a licence bound to its id asks the licensing
service for its current licence once a day. The request carries the install
id, a timestamp and a signature made with the install's key. It carries no
tenant, user or inventory data. An install marked air-gapped does not make the
request.

### Contact

Write to `sales@vistasecurity.io` about a trial or a licence, to stop us
contacting you, or to have your contact details removed. Report a security problem as [SECURITY.md](SECURITY.md)
describes.

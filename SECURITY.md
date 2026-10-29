# Security policy

Vista Platform holds an inventory of the networks, devices and cryptography of
the organizations that run it, and the credentials it uses to interrogate their
devices. We treat reports about it accordingly.

## Reporting a vulnerability

**Do not open a public issue or pull request.**

Report privately through either channel:

- **GitHub private vulnerability reporting** on this repository (Security tab,
  "Report a vulnerability"). Preferred: the report, the fix and any CVE stay in
  one place.
- **E-mail**: <security@vistasecurity.io>. If you want to encrypt the report,
  ask for a key in a first message with no details in it.

Enterprise and MSP customers may also report through their support contact.

**Is it the platform or the agents?** This repository covers Vista Platform:
its services, user interfaces, Helm chart, container images and the platform's
side of the managed-mode protocol, in every edition. A vulnerability in the
passive sensor, the device interrogation agent, their installers or their
release binaries goes to the agents repository's intake at
<https://github.com/VistaSecurity/VistaPlatform-Agents/security/advisories/new>.
If you are not sure which, send it to either; we will move it, and we will tell
you we did.

## What to include

- The platform version and edition, and how it is deployed (Helm chart or
  Docker Compose, and on what).
- Reproduction steps, ideally the smallest case that shows the problem.
- What an attacker gains, and what position they need to start from (an
  unauthenticated network client, a user of one tenant, a tenant administrator,
  an enrolled agent, and so on).

## What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | within 3 business days |
| Initial assessment | within 10 business days |
| Fix or mitigation plan | communicated with the assessment |

We will tell you plainly if we think a report is not a vulnerability, and why.
We ask for 90 days before public disclosure, or until a fixed release ships if
that is sooner, and we will say so if a fix needs longer. Reporters are
credited in the advisory and release notes unless they ask not to be. There is
no paid bounty.

## Scope

**Findings we especially want:**

- One tenant reading or changing another tenant's data.
- Authentication, session or authorization weaknesses, including a user
  exceeding their role.
- A path by which the platform stores or discloses key material, device
  credentials or other secrets it should not hold. The platform is built to
  record cryptographic posture, never key material.
- Automatic active probing of an address the tenant did not declare as their
  own.
- Tampering with release images, the Helm chart, their signatures or the
  compatibility references the platform uses to choose an agent version.
- Server-side request forgery, injection or parser bugs reachable from an
  agent, an import file or a connected system.

**Out of scope:**

- Attacks that require administrative control of the cluster or hosts the
  platform runs on.
- Vulnerabilities in third-party components with no demonstrated impact on
  the platform (report those upstream; tell us if the platform is affected).
- Automated scanner output with no demonstrated impact.

## Known design tradeoffs

These are deliberate. We would rather state them here than have you spend an
afternoon rediscovering them. If you can show impact beyond what is described,
we want the report.

- **Token revocation fails open.** The revocation denylist is held in Redis. If
  Redis is unreachable, the check is skipped and the request proceeds, with a
  warning logged, so a revoked token stays usable for the length of a Redis
  outage. Failing closed would turn a cache outage into a total authentication
  outage, which we judged worse for self-hosted operators.
- **Service-to-service requests have a replay window.** Internal calls are
  signed with HMAC-SHA256 over the method, path, query, body hash, timestamp
  and tenant. The nonce is signed entropy, not a deduplication key, so an exact
  replay of a captured internal request succeeds until its timestamp leaves the
  five-minute clock-skew window. The Helm chart puts every service-to-service
  call behind mutual TLS, which closes that path; the single-host Docker Compose
  install relies on its private network instead.

## Supported versions

Security fixes land in the latest release. Earlier releases do not receive
backported fixes: upgrade to the latest release. This is our current
practice, stated so you can plan around it; it is not a service commitment.

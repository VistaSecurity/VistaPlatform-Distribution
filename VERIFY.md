# Verifying a Vista Platform release

Every image, the Helm chart and the files attached to a release are signed
keylessly with Sigstore (`cosign`): each signature is made by a GitHub Actions
workflow with a short-lived certificate that names the workflow and the tag it
ran on, and is recorded in the public Rekor transparency log. There is no
long-lived key to trust: you check the certificate's identity, never only that
"a" signature verifies.

Needs `cosign` v3, `jq` and `sha256sum` (`shasum -a 256` on macOS). With cosign
v2.4 or later, add `--new-bundle-format` to each `verify-blob`: the release
files' signature is in the Sigstore bundle format cosign v3 reads by default.
Set the release once:

```bash
VERSION=v6.0.0   # the release you verify
```

## Who signs what

Issuer, for every signature below: `https://token.actions.githubusercontent.com`

| Signs | Identity (exact) |
| --- | --- |
| the images, the chart, `SHA256SUMS` of the release files | `https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-customer.yml@refs/tags/<version>` |
| a stable agents release `<tag>` | `https://github.com/VistaSecurity/VistaPlatform-Agents/.github/workflows/release.yml@refs/tags/<tag>` |
| a nightly agents build | `https://github.com/VistaSecurity/VistaPlatform-Agents/.github/workflows/nightly.yml@refs/heads/main` |
| an agents compatibility record that says `tested` | `https://github.com/VistaSecurity/VistaPlatform-Agents/.github/workflows/compatibility.yml@refs/heads/main` |

Every install runs the same images: without a licence an install runs as
Vista Platform Core, and a licence lifts it to its edition, so there is one
set of images, one chart and one identity per release. From 6.0 that set is
published in two registries, `docker.io/vistasecurity` and its mirror
`ghcr.io/vistasecurity`, with the same digests; each registry holds its own
copy of every signature and attestation, made by the same identity, so every
command below verifies either registry's reference. The platform's workflow
lives in a private repository; its identity is still a plain string the
certificate carries, and the transparency log records every signature it
made. The release `vX.Y.Z` is signed from the tag `vX.Y.Z`. As a regular
expression, for tools that check every release from 6.0 onward rather than
one:

```text
^https://github\.com/VistaSecurity/VistaPlatform/\.github/workflows/release-customer\.yml@refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$
```

### Releases before 6.0 (dated note, 2026-11-09)

Until 6.0 Core had an image line of its own on GitHub Container Registry.
Those releases stay where they were, under their own tags, and verify with the
identities they were signed with (the 6.0 mirror on GHCR is the release
above, not this line):

- Core 5.3.0 to 5.4.x (`ghcr.io/vistasecurity/<image>:vX.Y.Z`, chart
  `oci://ghcr.io/vistasecurity/vistaplatform`): signed from the tag
  `core-vX.Y.Z`, identity
  `https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-vX.Y.Z`;
- Core releases up to and including 5.2.1: signed by the former Core
  repository's own release workflow, and not covered here;
- licensed releases before 6.0: no longer published on `docker.io/vistasecurity`.

## 1. The release files

`SHA256SUMS` lists the digest of every other file attached to the release, and
is itself signed:

```bash
cosign verify-blob SHA256SUMS --bundle SHA256SUMS.sigstore.json \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-customer.yml@refs/tags/${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
sha256sum --ignore-missing -c SHA256SUMS
```

## 2. The images

`IMAGES.txt` names every image of the release by digest, one per line: first
on `docker.io/vistasecurity`, then the same digests on `ghcr.io/vistasecurity`.
Verify each by its digest (a tag can be moved, a digest cannot). The loop
checks both registries; to check only the one you pull from, filter first, for
example `grep '^ghcr.io/' IMAGES.txt` in place of `grep -v '^#' IMAGES.txt`
(reading Docker Hub counts against its anonymous pull limit):

```bash
grep -v '^#' IMAGES.txt | while read -r ref; do
  cosign verify "$ref" \
    --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-customer.yml@refs/tags/${VERSION}" \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com > /dev/null && echo "verified $ref"
done
```

Each image also carries a CycloneDX SBOM as a signed attestation:

```bash
cosign verify-attestation --type cyclonedx "<image>@sha256:<digest>" \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-customer.yml@refs/tags/${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  | jq -r '.payload | @base64d | fromjson | .predicate.components | length'
```

The `compose.yaml` of the release names every image by the same digests, so
what you verified is what compose pulls.

## 3. The chart

```bash
cosign verify "docker.io/vistasecurity/vistaplatform:${VERSION#v}" \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-customer.yml@refs/tags/${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The mirror's chart, `ghcr.io/vistasecurity/vistaplatform:${VERSION#v}`, has the
same digest and verifies with the same command.

The chart pins every image by digest; `helm template` of it at this version
shows the same digests `IMAGES.txt` lists.

## 4. The agents

`AGENTS.md` of the release names the agents release this platform version was
tested with. Verify its files as the agents repository's
`docs/verify-release.md` describes, with the identity of its channel from the
table above. For a nightly, also pin the commit
(`--certificate-github-workflow-sha`), since every nightly shares one identity.

## 5. The operator tools

`bundle-decrypt-<os>-<arch>` (opens a passphrase-encrypted backup for a
restore) and `catalog-bundle-<os>-<arch>` (exports the catalogues for an
air-gapped install) are files of the release like any other: section 1
verifies them, since `SHA256SUMS` lists each of the ten (Linux amd64 and
arm64, macOS amd64 and arm64, Windows amd64, the Windows ones `.exe`). After
`sha256sum -c`, make the one you downloaded executable:

```bash
chmod +x bundle-decrypt-linux-amd64
```

They carry no native code signature (no Authenticode on Windows, no
notarization on macOS), so Windows SmartScreen or macOS Gatekeeper may ask
before running one; the signed `SHA256SUMS` is their verification. The same
ten binaries are inside the release's `tools` image, which `IMAGES.txt` names
by digest and section 2 verifies, at `/usr/share/vista/tools` with their own
`SHA256SUMS` of the same digests:

```bash
docker run --rm "docker.io/vistasecurity/tools:${VERSION}"
```

## Without network access

`cosign` needs the Sigstore trust root to check a certificate and a Rekor
inclusion proof. [deploy/OFFLINE.md](deploy/OFFLINE.md) lists what to fetch
while you are online and how to verify with it on an isolated host.

## If a check fails

Do not install or run what failed. Download it again from the exact release;
if it still fails, report it privately as [SECURITY.md](SECURITY.md) describes.

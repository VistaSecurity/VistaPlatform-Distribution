# Verifying a Vista Platform Core release

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
VERSION=v5.3.0   # the release you verify
```

## Who signs what

Issuer, for every signature below: `https://token.actions.githubusercontent.com`

| Signs | Identity (exact) |
| --- | --- |
| Core images, the chart, `SHA256SUMS` of the release files | `https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-<version>` |
| a stable agents release `<tag>` | `https://github.com/VistaSecurity/VistaPlatform-Agents/.github/workflows/release.yml@refs/tags/<tag>` |
| a nightly agents build | `https://github.com/VistaSecurity/VistaPlatform-Agents/.github/workflows/nightly.yml@refs/heads/main` |
| an agents compatibility record that says `tested` | `https://github.com/VistaSecurity/VistaPlatform-Agents/.github/workflows/compatibility.yml@refs/heads/main` |

The platform's workflow lives in a private repository; its identity is still a
plain string the certificate carries, and the transparency log records every
signature it made. The platform release `vX.Y.Z` is signed from the tag
`core-vX.Y.Z`. As a regular expression, for tools that check every Core
release rather than one:

```text
^https://github\.com/VistaSecurity/VistaPlatform/\.github/workflows/release-core\.yml@refs/tags/core-v[0-9]+\.[0-9]+\.[0-9]+$
```

Releases up to and including 5.2.1 were published before this repository
existed, were signed by another workflow, and are not covered here.

## 1. The release files

`SHA256SUMS` lists the digest of every other file attached to the release, and
is itself signed:

```bash
cosign verify-blob SHA256SUMS --bundle SHA256SUMS.sigstore.json \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
sha256sum --ignore-missing -c SHA256SUMS
```

## 2. The images

`IMAGES.txt` names every image of the release by digest, one per line.
Verify each by its digest (a tag can be moved, a digest cannot):

```bash
grep -v '^#' IMAGES.txt | while read -r ref; do
  cosign verify "$ref" \
    --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-${VERSION}" \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com > /dev/null && echo "verified $ref"
done
```

Each image also carries a CycloneDX SBOM as a signed attestation:

```bash
cosign verify-attestation --type cyclonedx "<image>@sha256:<digest>" \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  | jq -r '.payload | @base64d | fromjson | .predicate.components | length'
```

The `compose.yaml` of the release names every image by the same digests, so
what you verified is what compose pulls.

## 3. The chart

```bash
cosign verify "ghcr.io/vistasecurity/vistaplatform:${VERSION#v}" \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The chart pins every image by digest; `helm template` of it at this version
shows the same digests `IMAGES.txt` lists.

## 4. The agents

`AGENTS.md` of the release names the agents release this platform version was
tested with. Verify its files as the agents repository's
`docs/verify-release.md` describes, with the identity of its channel from the
table above. For a nightly, also pin the commit
(`--certificate-github-workflow-sha`), since every nightly shares one identity.

## Without network access

`cosign` needs the Sigstore trust root to check a certificate and a Rekor
inclusion proof. [deploy/OFFLINE.md](deploy/OFFLINE.md) lists what to fetch
while you are online and how to verify with it on an isolated host.

## If a check fails

Do not install or run what failed. Download it again from the exact release;
if it still fails, report it privately as [SECURITY.md](SECURITY.md) describes.

# Installing without network access

Vista Platform runs without any outbound connection: nothing it needs at
runtime calls home, and there is no licence activation. What needs a network is
**acquiring** the release and **checking its signatures** for the first time.
This page lists everything an isolated install needs, how to verify each piece
while you still have network access, and what to check again on the isolated
side.

There is no bundle generator: you fetch the pieces below yourself, verify them,
and carry them across with your own transfer process. Take every piece from
**one** platform release (`v5.3.0` in the examples) and the one agents release
its `AGENTS.md` names.

## 1. On a connected machine: fetch

| Piece | Where from | Command |
| --- | --- | --- |
| `cosign`, pinned | [sigstore/cosign releases](https://github.com/sigstore/cosign/releases/tag/v3.1.3) | download `cosign-linux-amd64` (or `-arm64`) of v3.1.3 and check its digest: `4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71` (amd64), `c5d324e091826b0d7a78eb16fef316450b4eb9aaec045611c08ba06f5e73220a` (arm64) |
| The Sigstore trust root | Sigstore's public TUF repository, through cosign | `cosign initialize`, then keep `~/.sigstore/root/tuf-repo-cdn.sigstore.dev/targets/trusted_root.json` |
| The release files | this repository's release `v5.3.0` | `compose.yaml`, `env.example`, `values-core.example.yaml`, `IMAGES.txt`, `VERIFY.md`, `AGENTS.md`, `SHA256SUMS`, `SHA256SUMS.sigstore.json` |
| The platform images, with their signatures and SBOM attestations | `ghcr.io/vistasecurity` | for every line of `IMAGES.txt`: `cosign save "$ref" --dir "images/$(basename "${ref%@*}")"` |
| The chart, with its signature | `oci://ghcr.io/vistasecurity/vistaplatform` | `helm pull oci://ghcr.io/vistasecurity/vistaplatform --version 5.3.0` and `cosign save ghcr.io/vistasecurity/vistaplatform:5.3.0 --dir chart-sig` |
| Third-party images | Docker Hub | Compose: the `postgres`, `valkey/valkey`, `nats` and `traefik` images `compose.yaml` names. Helm: every image `helm template` of the chart names that is not under `ghcr.io/vistasecurity` (the datastores and the `helm test` client). Copy each by digest (`docker buildx imagetools inspect <image>` shows it) |
| The agents | the agents release `AGENTS.md` names, in [VistaSecurity/VistaPlatform-Agents](https://github.com/VistaSecurity/VistaPlatform-Agents) | the binaries or packages for your operating systems, the installers you use, `SHA256SUMS` and every `.sigstore.json` bundle, `agents-release.json`, the compatibility record, `THIRD_PARTY_LICENSES`; and `scripts/verify-release.sh` from that tag |
| Agent host prerequisites | your operating system's packages; Npcap from its publisher | libpcap on Linux and macOS (`apt install libpcap0.8`, `dnf install libpcap`), Npcap on Windows under its own licence |

## 2. On the connected machine: verify

Verify everything **before** you carry it across; this is the strongest check,
because cosign can consult the transparency log.

1. The release files, the images and the chart: run every command of
   `VERIFY.md` of the release.
2. The agents: `scripts/verify-release.sh --repo VistaSecurity/VistaPlatform-Agents --tag <agents tag> --dir <download dir>`
   from that same agents tag (its `docs/verify-release.md` explains each
   check).
3. Record the digests you verified (`IMAGES.txt` already lists the platform's;
   add the third-party images').

## 3. Carry across and load

- Images: `cosign load --dir images/<name> <your-registry>/<prefix>/<name>`
  copies the image **with** its signatures and attestations into your
  registry. The digest does not change: check it against `IMAGES.txt`.
- Compose: point `compose.yaml` at your registry by replacing
  `ghcr.io/vistasecurity` with it; keep the `@sha256:` digests as they are.
- Helm: install from the pulled `vistaplatform-5.3.0.tgz` and set
  `image.registry` and `image.repoPrefix` to your registry. The chart's digest
  pins stay valid because the bytes are the same.
- Agents: copy the verified files to the hosts that run them.

## 4. On the isolated side: verify again

With the pinned `cosign` and the `trusted_root.json` you fetched:

```bash
cosign verify --trusted-root trusted_root.json "<your-registry>/<prefix>/auth-service@sha256:<digest>" \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-v5.3.0" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
cosign verify-blob --trusted-root trusted_root.json SHA256SUMS --bundle SHA256SUMS.sigstore.json \
  --certificate-identity "https://github.com/VistaSecurity/VistaPlatform/.github/workflows/release-core.yml@refs/tags/core-v5.3.0" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Given `--trusted-root`, cosign reads the trust root from that file instead of
fetching it, checks the certificate chain against it, and checks the
transparency-log proof each signature carries; it cannot ask the log whether
anything changed since. That is why the connected check comes first.
Digests need no network: `sha256sum -c` and the digests in `IMAGES.txt` hold
everywhere.

## 5. At runtime

- **Nothing calls out.** The platform needs no connection to us. Features that
  reach outside your network do so only when you configure them (mail, cloud
  accounts, integrations, a model provider).
- **The admin console's update check** asks the chart registry for newer
  versions once a day. On an isolated Helm install set
  `maintenance.updateCheck.enabled=false` (or point
  `maintenance.chartSource` at your mirror), and upgrade by repeating this page
  for the new release.
- **Time.** Keep the hosts' clocks right: agent certificates and the platform's
  sessions are time-bound.
- **The agents** reach the platform only (enrollment through the web host or
  gateway, then the agent mTLS listener); they need no internet access.

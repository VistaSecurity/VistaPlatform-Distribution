# Installing Vista Platform Core with Helm

The chart is published as an OCI artifact at
`oci://ghcr.io/vistasecurity/vistaplatform`, one version per release (the
release `v5.3.0` is chart version `5.3.0`). It is anonymous to pull, signed, and
pins every image it deploys by digest: the chart version you install decides
exactly which bytes run. Nothing here needs the source code, a build or a
`make` target.

The commands use chart version `5.3.0` as an example: substitute the release
you install, and take every file from that one release.

## Prerequisites the chart does not install

The chart refuses to install when a required one is missing, with an error
naming it.

- **Kubernetes 1.27 or later** (the chart refuses an older one) and `helm` 3.16 or later.
- **cert-manager**, with its CRDs. The chart provisions a private Platform CA
  through it and issues every service its mesh certificate: traffic between
  services is mutual TLS, always, and so, by default, are the connections to
  PostgreSQL and NATS (`datastores.postgres.tls.enabled`,
  `datastores.nats.tls.enabled`). It is also what issues the browser-facing
  certificate when `tls.mode` is `certManager`.
- **Stakater Reloader**. It restarts a pod when its certificate rotates.
  Nothing fails at install time without it; internal mTLS breaks at the first
  renewal, about 60 days in.
- **Traefik v3.4 or later** with its CRDs (`IngressRoute`, `Middleware`,
  `IngressRouteTCP`). The chart creates those resources; it does not install
  the controller. (The mesh's `ServersTransport` uses a field older Traefik
  releases do not know.)
- **A TLS-passthrough entrypoint for the agents**, `agent-mtls` on port `8444`
  by default (`agentMtls.entryPoint`, `agentMtls.port`). Sensors and device
  agents present their client certificate on every call after enrollment, so
  Traefik must pass this traffic through untouched; if it terminates TLS, the
  certificate never reaches the platform and every agent is refused. For the
  upstream `traefik/traefik` chart, an entrypoint is a few values:

  ```yaml
  ports:
    agent-mtls:
      port: 8444
      exposedPort: 8444
      protocol: TCP
      expose:
        default: true
  ```

- **DNS** for four names, all different: the web UI and API (`tls.dnsName`),
  the admin console (`tls.adminDnsName`), and one per agent service
  (`agentMtls.backends.*.dnsName`) pointing at the passthrough entrypoint.
- **A StorageClass** for the PostgreSQL, Redis, NATS and upload volumes (the
  cluster default unless `datastores.storageClassName` names one).

Agent mTLS and the service mesh are always on. A values file that sets
`agentMtls.enabled` or `serviceMtls.enabled` to false is refused.

## Install

1. **Verify the chart** before you install it (the identity is explained in
   `VERIFY.md` of the release):

   ```bash
   cosign verify ghcr.io/vistasecurity/vistaplatform:5.3.0 \
     --certificate-identity-regexp '^https://github\.com/VistaSecurity/VistaPlatform/\.github/workflows/release-core\.yml@refs/tags/core-v[0-9]+\.[0-9]+\.[0-9]+$' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   ```

2. **Write your values.** Start from `values-core.example.yaml` (attached to
   every release and kept beside this page): replace the hostnames and the
   cert-manager issuer. `helm show values oci://ghcr.io/vistasecurity/vistaplatform --version 5.3.0`
   lists every setting with its default.

3. **Install at the exact version:**

   ```bash
   helm install vista oci://ghcr.io/vistasecurity/vistaplatform --version 5.3.0 \
     --namespace vista --create-namespace --values values-core.yaml --wait --timeout 15m
   ```

   The chart generates the platform secrets on first install and keeps them.
   It prints how to watch the schema migration, run `helm test`, and verify
   the images it pinned.

4. **Sign up** at `https://<tls.dnsName>`: the first account creates the
   organization. The admin console is at `https://<tls.adminDnsName>`; its
   seeded administrators and their must-change password are described in
   [INSTALL.md](../../INSTALL.md#the-admin-console).

5. **Enroll an agent** from **Discovery → Sensors & Agents**. The agent enrolls
   through `tls.dnsName` with a registration key and then switches to its
   service's passthrough hostname, which it keeps using.

Each image the chart deploys is named by digest, so a mirror or an air-gapped
registry must serve the same digests; set `image.registry` and
`image.repoPrefix` to it ([OFFLINE.md](../OFFLINE.md)).

## Back up and restore

The database dump is not the whole backup. On Kubernetes the agent listeners
present each service's mesh certificate, issued by the **Platform CA**, and an
agent is handed that CA at enrollment and keeps trusting it. A restore into a
cluster whose Platform CA is a new one locks out every enrolled sensor and
device agent (`x509: certificate signed by unknown authority`), even though the
tenants, users, inventory and agent certificates all come back from the dump.
(The per-tenant certificates agents present to the platform are in the
database; the per-service certificates are re-issued by cert-manager from the
Platform CA, so they need no backup.)

Keep, from the same moment:

| What | Where | Why |
| --- | --- | --- |
| The database | `pg_dump -Fc` (the command under [Upgrade](#upgrade)), or **Maintenance → Backups** | Tenants, users, inventory, agents, per-tenant certificates. |
| **The Platform CA Secret** | `platform-ca-secret` in the release namespace (the name you gave to `serviceMtls.platformCa.externalCaSecretName`, if you set it): keys `tls.crt`, `tls.key`, `ca.crt` | The trust root agents pin. **Maintenance → Backups does not include it.** |
| The chart's generated Secrets | `kubectl -n vista get secret`: the `-platform` (JWT, internal-auth and `encryption-master-key`), `-generated` (datastore passwords), `-install`, `-jwt-signing` and `-cbom-signing` Secrets of the release | `encryption-master-key` decrypts every stored credential. **Maintenance → Backups** can carry these, encrypted under a passphrase you give it, when the backup is taken with the install's Secrets included. |
| Your `values-core.yaml` | wherever you keep it | Above all the four hostnames: the agents connect to the two `agentMtls.backends.*.dnsName` names, which must be the same after a restore. |

Export the Platform CA Secret into a file only you can read, and keep it with
the dump:

```bash
(umask 077; kubectl -n vista get secret platform-ca-secret -o yaml > platform-ca-secret.yaml)
```

To restore into a new cluster, create the CA Secret **before** the chart is
installed, under a name of your own, and point the chart at it so that
cert-manager does not mint another:

```bash
# platform-ca-secret.yaml with metadata.name changed to vista-platform-ca,
# and without metadata.uid, resourceVersion, creationTimestamp and namespace.
kubectl create namespace vista
kubectl -n vista apply -f platform-ca-secret.yaml
helm install vista oci://ghcr.io/vistasecurity/vistaplatform --version 5.3.0 \
  --namespace vista --values values-core.yaml \
  --set serviceMtls.platformCa.externalCaSecretName=vista-platform-ca
```

Restore the platform Secrets before the install too, so the chart reuses them
instead of generating new ones (`platform.existingSecretName`,
`platform.existingDatastoreSecretName` and the `existingSecretName` settings of
`install`, `jwtSigning` and `cbomSigning` name Secrets you created), then
restore the database dump into the new PostgreSQL with
`pg_restore --exit-on-error`. Restoring only the database into a new cluster, with a
new Platform CA, gives you a working platform and no working agents.

A `helm uninstall` followed by an install into the same namespace keeps the
chart's generated Secrets (they carry `helm.sh/resource-policy: keep`). The
Platform CA Secret is created by cert-manager, not by Helm, so whether it
survives depends on how cert-manager is configured in your cluster: keep your
own copy.

This restore path is read from the chart's templates, not run end to end.
Rehearse it on a spare cluster before you rely on it.

## Upgrade

**Back up the database first, every time.** The chart ships no backup tooling.
A schema statement that fails against your data stops the migration
half-applied, and restoring the backup is the way back (see [Back up and
restore](#back-up-and-restore) for everything a restore into a new cluster needs besides the dump):

```bash
kubectl -n vista exec postgres-0 -- pg_dump -U crypto_user -d crypto_inventory -Fc > "vista-$(date +%F).dump"
```

(Or use **Maintenance → Backups** in the admin console.) Then read the release
notes, verify the new chart as above, and upgrade at its exact version:

```bash
helm upgrade vista oci://ghcr.io/vistasecurity/vistaplatform --version 5.4.0 \
  --namespace vista --reset-then-reuse-values --values values-core.yaml --wait --timeout 20m
```

- Use `--reset-then-reuse-values`, not `--reuse-values`, across chart versions:
  `--reuse-values` carries every earlier value forward verbatim, including any
  per-service image override, and silently pins that service to old bytes.
- New backend pods wait for the new schema migration to finish before they
  start (`kubectl -n vista logs <pod> -c wait-for-schema` says which schema they
  wait for). Give `--timeout` enough room for the migration and the rollout.
- On a single node, a rolling upgrade can need about twice the steady-state CPU
  requests. Size the node for it, or set `strategy: Recreate` on the backends
  that can afford a short outage.

## When something does not come up

```bash
kubectl -n vista get pods
kubectl -n vista logs deploy/auth-service
```

- **`helm install` fails at once naming cert-manager, Reloader or an
  `agentMtls` hostname**: a prerequisite above is missing.
- **The UI answers 404**: you reached Traefik, but not by the hostname it routes
  on. `kubectl -n vista get ingressroute -o yaml | grep match:` shows it.
- **Pods stay `Pending`**: no StorageClass, or the nodes are too small;
  `kubectl -n vista describe pod <name>` says which.
- **Backends stay in `Init`**: they are waiting for the schema migration; find
  its Job with `kubectl -n vista get job -l app.kubernetes.io/component=schema-migration`.
- **Agents enroll but are then refused**: the passthrough entrypoint terminates
  TLS, or an agent hostname does not resolve to it.

# Migrating Deployments from Wrangler to Terraform

This document explains the concrete differences between deploying this repo
with `wrangler` (today) and with the `cloudflare/cloudflare` Terraform provider,
and enumerates the changes that the switch would require.

It is a reference for when we actually make the switch.

## 1. What stays the same

Switching the deploy tool does **not** change the runtime shape of the project:

- **Library build** (`socket.io-serverless/build.mjs`, `make lib-build`).
  esbuild still bundles `dist/cf.js`; Terraform uploads those same bytes.
- **Worker source** (`demo-server/src/cf/main.ts`).
  The default-exported `fetch` handler, the `EngineActor` / `SocketActor`
  factory calls, and the `WorkerBindings` interface are unchanged.
- **Durable Object code** (`src/cf/eio/EngineActorBase.ts`,
  `src/cf/sio/SocketActorBase.ts`).
  Hibernatable WebSocket API, `state.storage` persistence, and `AlarmTimer`
  are runtime APIs — independent of the deploy tool.
- **Integration tests** (`demo-server/test/*.spec.ts`).
  `@cloudflare/vitest-pool-workers` runs the Worker in `workerd` via
  Miniflare. It reads `wrangler.toml` at test time, but that is a Miniflare
  convention — the tests never invoke `wrangler` or Terraform.
- **Submodule patching** (`make patch-upstream`).
  Operating on the `socket.io` submodule is orthogonal to deployment.

## 2. Where the two paths diverge

Both `wrangler deploy` and `terraform apply` end at the same Cloudflare REST
endpoint:

```
PUT /accounts/{account_id}/workers/scripts/{script_name}
Content-Type: multipart/form-data; boundary=…
```

The multipart body has two parts:

1. `metadata` — JSON containing `compatibility_date`, `compatibility_flags`,
   `bindings`, `migrations`, `main_module`, `observability`, etc.
2. One or more JS modules (`application/javascript+module`) referenced by
   `main_module`.

Wrangler assembles that multipart in Rust after bundling `src/cf/main.ts`
with esbuild. The Terraform provider assembles it in Go
([`WorkersScriptModel.MarshalMultipart`](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.22.0/internal/services/workers_script/model.go))
**from bytes you supply**. Terraform does not bundle.

That single difference — *who runs the bundler* — is the root of every other
divergence below.

## 3. Concrete field mapping

Every key currently in `demo-server/wrangler.toml` has a counterpart on the
`cloudflare_workers_script` resource. The table is exhaustive for this repo.

| `wrangler.toml` | `cloudflare_workers_script` (HCL) | Notes |
|---|---|---|
| `name = "sio-serverless-demo"` | `script_name = "sio-serverless-demo"` | |
| `main = "src/cf/main.ts"` | `main_module = "cf.js"` + `content = file("${path.module}/dist/cf.js")` | TF does not bundle; you point `content` at the **already-built** `dist/cf.js` from `make lib-build`. |
| `compatibility_date = "2024-08-21"` | `compatibility_date = "2024-08-21"` | Same value. |
| `compatibility_flags = ["nodejs_compat_v2"]` | `compatibility_flags = ["nodejs_compat_v2"]` | Same list. |
| `workers_dev = true` | (delete, or add `cloudflare_workers_subdomain` separately) | TF does not model `workers.dev` subdomain on the script resource. |
| `[observability] enabled = true` | `observability = { enabled = true }` | Nested block. |
| `[dev] port = 18787` | — | No local-dev server in TF. See §5. |
| `[durable_objects] bindings = [{name="engineActor", class_name="EngineActor"}, ...]` | `bindings = [{name="engineActor", type="durable_object_namespace", class_name="EngineActor"}, ...]` | Same data; TF requires the explicit `type`. |
| `[vars]` | `bindings = [{name="MY_VAR", type="plain_text", text="…"}]` | Plain vars become `plain_text` bindings in TF. |
| `[[migrations]] tag="v1" new_classes=["EngineActor","SocketActor"]` | `migrations = { old_tag="v1", new_tag="v1", new_classes=["EngineActor","SocketActor"] }` | TF requires **both** `old_tag` and `new_tag`. See §6. |

## 4. Required changes to the repo

### 4.1 New files

- `demo-server/infra/main.tf` — the `cloudflare_workers_script` resource,
  `terraform { required_providers { cloudflare = … } }`, and any
  `variable` declarations (`account_id`, `api_token`).
- `demo-server/infra/terraform.tfvars` — or pull `account_id` /
  `api_token` from the `CLOUDFLARE_API_TOKEN` / `CLOUDflare_ACCOUNT_ID`
  environment variables (recommended).
- `demo-server/infra/.gitignore` — ignore `.terraform/`, `*.tfstate`,
  `*.tfstate.backup`, `.terraform.lock.hcl`.

### 4.2 Makefile

Add targets that wrap Terraform through `make` so the invocation stays
consistent with the rest of the repo:

```make
tf-init:
	cd demo-server/infra && terraform init

tf-plan:
	make lib-build
	cd demo-server/infra && terraform plan

tf-apply:
	make lib-build
	cd demo-server/infra && terraform apply -auto-approve

tf-destroy:
	cd demo-server/infra && terraform destroy
```

`tf-apply` and `tf-plan` both depend on `make lib-build` so the
`dist/cf.js` they read via `file("${path.module}/../socket.io-serverless/dist/cf.js")`
is always fresh. This mirrors the current contract where
`make lib-build` must run before `wrangler deploy`.

### 4.3 `demo-server/package.json`

| Script | Current | After the switch |
|---|---|---|
| `deploy:cf` | `wrangler deploy` | `make tf-apply` (or `cd infra && terraform apply`) |
| `build:cf` | `wrangler deploy --dry-run --outdir ./build` | `make tf-plan` (validates config; does NOT bundle — bundling is now `make lib-build`'s job) |
| `dev:cf` | `wrangler dev` | **Unchanged** — keep `wrangler dev` for local dev (see §5) |

`wrangler` would remain a `devDependency` for `wrangler dev` and `wrangler types`
even after the switch. The deploy-script would no longer call it.

### 4.4 `.github/workflows/check.yaml`

The "Build demo-server Worker (wrangler dry-run)" step would be replaced:

```yaml
- name: Build demo-server Worker (terraform plan)
  run: make tf-plan
```

…with the caveat that `terraform plan` calls the Cloudflare API to fetch
current remote state. Unlike `wrangler deploy --dry-run` which bundles and
validates locally without a network call, `terraform plan` requires
`CLOUDFLARE_API_TOKEN` to be present in CI secrets. A purely-local alternative
is `terraform validate` (does not hit the API, but also does not compare
against the deployed version).

### 4.5 `wrangler.toml`

Two options:

- **(a)** Delete it and lose `wrangler dev` (not recommended — local dev
  ergonomics are valuable).
- **(b)** Keep it for `wrangler dev` and `wrangler types` only. Accept that
  `wrangler.toml` and `main.tf` describe the same Worker and must be kept in
  sync by hand.

Option (b) is the path the Cloudflare docs recommend for mixed setups. The
duplicated surface is small for this repo (2 DO bindings, 1 migration, 2
compat flags) so the maintenance cost is low.

## 5. Local development

Terraform is deploy-only — it has no `wrangler dev` equivalent. Three ways
to keep local dev working:

1. **Keep `wrangler dev`** (recommended). `wrangler dev` reads `wrangler.toml`
   which you keep in the repo for this purpose. The Terraform path is used
   only for `prod` / `staging` deploys. This is the cheapest option: no
   duplication of effort, and the two configs only need to agree on bindings
   and migrations (a small surface).

2. **Use Miniflare directly** via a small `dev.mjs` script that imports
   `@miniflare/core`. This drops the `wrangler` dependency entirely but
   requires re-implementing what `wrangler dev` does (reload on file change,
   bind the DO classes, honour the `[dev] port`). Not worth the effort for
   this project.

3. **Rely on the integration tests** (`pnpm run --filter ./demo-server test`).
   The tests already run inside `workerd` via Miniflare and exercise the
   full Worker → EngineActor → SocketActor pipeline. For pure code work
   (not interactive debugging) this is sufficient. `wrangler dev` is still
   useful for ad-hoc manual testing against a real WebSocket client.

## 6. Durable Object migrations

Wrangler's migration model is forgiving: you declare a `[[migrations]]` block
once, and `wrangler deploy` applies it idempotently. Removing the block (once
the DO classes exist on the account) has no effect.

Terraform's `migrations` block is stricter:

```hcl
migrations = {
  old_tag     = "v1"
  new_tag     = "v2"
  new_classes = ["EngineActor", "SocketActor"]
}
```

- `old_tag` **must** match the remote current tag, or the upload is rejected.
- Bumping `old_tag → new_tag` is how you signal a new migration step.
- `class_name` renames require explicit `renamed_classes { from = "…"
  to = "…" }` entries.
- Removing `migrations` from HCL is not harmful (the remote keeps its state),
  but adding the block back with the wrong `old_tag` will fail the next
  `terraform apply`.

For this repo's current single `v1` migration with two classes, the overhead
is negligible. It becomes more meaningful when you introduce class renames
or SQLite-backed DOs (`new_sqlite_classes`).

## 7. Things Terraform gives you that wrangler does not

- **State drift detection.** `terraform plan` shows a diff if the deployed
  Worker's bindings / compat flags / migrations have drifted from the HCL
  (e.g. someone changed them via the dashboard).
- **Reasoned dependency ordering.** If you later add a KV namespace, R2
  bucket, or D1 database, those become separate `cloudflare_*` resources
  that Terraform creates before the Worker in the same `apply`. With
  `wrangler.toml` you create them out-of-band and paste IDs into the config.
- **Reusable modules.** The HCL can be packaged as a `module` and reused
  across prod / staging / preview environments with different `var.*`
  values. `wrangler.toml` has `--env` sections but no module system.
- **Reviewable deploys.** `terraform plan` output in a PR is a concrete
  diff that a reviewer can read; `wrangler deploy --dry-run` output is
  a bundle-size summary, not a config diff.

## 8. Things you lose

- **Zero-config bundling.** Wrangler reads `main = "src/cf/main.ts"`,
  runs esbuild, and uploads. Terraform expects you to run `make lib-build`
  first. (We already do this in CI — the `check.yaml` workflow runs
  `make lib-build` before `build:cf` — but the contract becomes explicit.)
- **`wrangler types`.** Generates `worker-configuration.d.ts` from
  bindings. Under TF, you'd maintain the `WorkerBindings` interface by
  hand, which is already what `demo-server/src/cf/main.ts:68-73` does.
- **One-file config.** `wrangler.toml` is a single 25-line file. Terraform
  requires `main.tf`, `variables.tf` (optional), `terraform.tfvars`
  (recommended), and `terraform.tfstate` (gitignored).
- **Network-free dry-run.** `wrangler deploy --dry-run` works offline;
  `terraform plan` calls the Cloudflare API to fetch current state.

## 9. Reference HCL

A minimal-but-complete `main.tf` for this repo as of socket.io@4.8.3:

```hcl
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
  }
}

provider "cloudflare" {
  # reads CLOUDFLARE_API_TOKEN from env
}

variable "account_id" {
  type        = string
  description = "Cloudflare account ID to deploy into"
}

variable "script_name" {
  type    = string
  default = "sio-serverless-demo"
}

resource "cloudflare_workers_script" "demo" {
  account_id          = var.account_id
  script_name         = var.script_name
  compatibility_date  = "2024-08-21"
  compatibility_flags = ["nodejs_compat_v2"]

  # The Worker source, bundled by `make lib-build` into dist/cf.js
  main_module = "cf.js"
  content     = file("${path.module}/../../socket.io-serverless/dist/cf.js")

  bindings = [
    {
      name      = "engineActor"
      type      = "durable_object_namespace"
      class_name = "EngineActor"
    },
    {
      name      = "socketActor"
      type      = "durable_object_namespace"
      class_name = "SocketActor"
    },
  ]

  migrations = {
    old_tag     = "v1"
    new_tag     = "v1"
    new_classes = ["EngineActor", "SocketActor"]
  }

  observability = {
    enabled = true
  }
}
```

Run with:

```bash
export CLOUDFLARE_API_TOKEN=…
export TF_VAR_account_id=…

make lib-build            # produce dist/cf.js
cd demo-server/infra
terraform init
terraform plan            # diff against the deployed Worker
terraform apply           # PUT the multipart to the Workers API
```

## 10. Recommended migration path

1. Add `demo-server/infra/main.tf` alongside the existing `wrangler.toml`.
2. Add `make tf-plan` / `tf-apply` targets to the Makefile.
3. In CI, run `terraform validate` (no API needed) as part of `check.yaml`.
   `"Build demo-server Worker"` step; promote to `terraform plan` once a
   `CLOUDFLARE_API_TOKEN` secret is set on the repo.
4. Make `terraform apply` the deploy command for `staging` (off the
   `opencode-ify` branch or a separate account). Smoke test.
5. Once comfortable, switch `deploy:cf` in `demo-server/package.json` from
   `wrangler deploy` to `make tf-apply`.
6. Keep `wrangler.toml` indefinitely for `wrangler dev` and `wrangler types`.
   The duplication between `wrangler.toml` and `main.tf` is two bindings and
   one migration block — cheap to keep in sync by eye.
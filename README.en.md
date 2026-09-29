# Family Meals Miniapp

[简体中文](README.md) | English

> **Commercial use is strictly prohibited. Without the author's written authorization, the source code, UI designs, and accompanying documentation must not be used for commercial purposes, including sales, paid deployment, integration into commercial projects, or paid services.**

A collaborative family meal-ordering WeChat Mini Program with a native Mini Program frontend and a NestJS backend. Members select dishes and submit requests; administrators review requests, manage dishes and members, and maintain the shared family menu.

## UI preview

The three panels below show the home page and nickname editor, member invitations, and unused-image cleanup. They are based on development screenshots, with AI-assisted redaction of names, membership timestamps, and file identifiers. They illustrate the interface rather than prove current production status or acceptance testing.

**Why are the dish photos missing in the screenshots?** These screenshots capture a development test state in which dish photos were not displayed, leaving the image placeholders visible. The app does support dish photos in normal use: administrators can upload images, and dish cards display them once COS storage, access permissions, and Mini Program domain settings are configured and the uploaded images are accessible. Production dish photos are not included in this source package; use your own image data. The screenshots alone do not establish the specific reason images were missing during that test, so no particular storage or network fault is claimed here.

![Development UI preview: home, member invitations, and image cleanup, with privacy redaction](docs/screenshots/development-showcase.png)

| Home and profile | Members and invitations | Image cleanup |
| --- | --- | --- |
| Edit nickname, choose an avatar, browse dishes, and use bottom navigation | Create member/guest invitations and manage expired guests and members | Inspect candidates, request cleanup, and check task status |

## Version and scope

- Source baseline: `1e21c2e1ad86fdebd6a74613daa86398d8bce162`.
- Paired frontend: `0.3.9`, with a recorded development-version upload. This does not establish WeChat review approval or public release.
- Backend: `family-meals-api-010` deployed this source; `011` was a subsequent configuration change. A console screenshot supplied on September 29, 2026 shows `011` as the online version and identifies the source and paired frontend in the `010` release notes.
- The original backend release archive hash and frontend upload directory were checked against the source. The running cloud image was not inspected file by file.
- This sanitized package includes application and test code, API contracts, migrations, and build configuration. It excludes real environment settings, database contents, private records, and installed dependencies. See `README-源码交付.md` and `manifest.json` for provenance and sanitization details.

## Technology stack

Versions below come from this release's package.json, Dockerfile, and compose.yaml. They are not claims about the latest upstream versions or the actual cloud database version.

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | Native WeChat Mini Program, JavaScript, WXML, WXSS, JSON | Pages, components, styles, and project configuration |
| WeChat APIs | `wx.login`, `wx.cloud.callContainer`, `wx.uploadFile` | Login, cloud-hosted API calls, and image uploads |
| Frontend modules | CommonJS, native Page / Component | Page logic, request handling, sessions, and idempotent retries |
| Runtime | Node.js 24; Docker base image 24.14.0 | Backend runtime |
| Backend | TypeScript 5.9.3, NestJS 12.0.1, platform-express 12.0.3 | REST API and application services |
| Data access | Prisma / Prisma Client / MariaDB adapter 7.10.0 | MySQL access, client generation, transactions, and migrations |
| Database | MySQL; local Compose pins a MySQL 8.4 image | Persistent users, families, dishes, orders, reviews, and cleanup tasks |
| Authentication | WeChat login, JWT through NestJS JWT 12.0.1 | API identity and family-scoped authorization |
| Images | Tencent Cloud COS, cos-nodejs-sdk-v5 3.0.0, sharp 0.35.4 | Private object storage, direct uploads, and image processing |
| API contracts | OpenAPI JSON, frontend types, example JSON | Shared API definitions; no claim of a hosted Swagger UI |
| Build and hosting | npm lockfile, TypeScript, multi-stage Docker, WeChat CloudRun | Dependency installation, builds, and deployment |
| Verification | Node.js tests / assert, tsx 4.23.13, Python contract scripts | Unit, API, and contract checks; Python is not a backend runtime dependency |

This release does not include a standalone web frontend and does not require Redis.

## Frontend pages

There are 13 registered pages in `miniprogram/app.json`. Some shared pages retain an `admin-` directory name while also serving ordinary members; management actions have separate authorization checks.

All directories below are under `miniprogram/pages`.

| Page | Directory | Main functions |
| --- | --- | --- |
| Login | `login` | WeChat login and invitation entry |
| Home | `index` | Current family and meal session, dish selection, nickname/avatar, favorites, administrator entry |
| Family menu | `family-menu` | Shared menu and current ordering results |
| Admin workspace | `admin-console` | Review, dishes, members, history cleanup, image cleanup, and audit entry points |
| Order review | `admin-review` | Review submitted orders, adjust review quantities, and submit decisions |
| Personal orders | `personal-menu` | Own submissions and review results, per-dish notes, additional orders when allowed |
| My selections | `cart` | Pending selections, quantity changes, removal, and submission |
| Family selection | `family-select` | Select an existing membership or redeem an invitation |
| Dish library | `admin-dishes` | Search, filter, select variants, and choose dishes; additional management actions for admins |
| Cleanup | `admin-cleanup` | Historical dish cleanup, image cleanup candidates, and task status |
| Dish editor | `admin-dish-edit` | Create/edit dishes, variants, and images; permitted deletion actions |
| Members | `admin-members` | Invitations, membership lists, guest promotion, and member removal |
| Audit | `admin-audit` | Family operation records |

Bottom navigation contains Home, Dish Library, My Selections, and Family Menu. Other pages are reached through their relevant workflows.

## How to use

### Family members

1. Open a configured, accessible Mini Program in WeChat and sign in.
2. Select a family you have joined, or redeem a valid invitation from an administrator.
3. Choose dishes and variants from Home or the Dish Library and add them to My Selections.
4. Check quantities and per-dish notes, then submit. Adding to the cart does not submit an order.
5. Check Personal Orders for review results and Family Menu for the shared result. Additional ordering depends on the meal session and backend state.

### Administrators

1. Use the admin workspace to maintain dishes, variants, and images.
2. Create member/guest invitations and manage memberships.
3. Review submitted orders and check the resulting family menu.
4. For cleanup, inspect candidates and confirm the scope. Image cleanup is a task: check its result before deciding to retry.
5. Consult audit records for management activity. Deployment and schema migrations do not automatically run historical business-data cleanup.

### Roles

- `ADMIN`: family management and order review.
- `MEMBER`: regular membership, authorized by the backend within each family.
- `GUEST`: time-limited membership; this implementation assigns a 24-hour expiry on creation. Promotion to a regular member clears that expiry.
- Removed, departed, or expired memberships cannot simply regain their previous privileges through an old invitation; backend redemption rules apply.
- Mock modules remain as development code, but the delivered configuration uses `USE_MOCK=false`. A visible page alone does not prove real backend connectivity.

## Project structure

```text
miniprogram/          Mini Program pages, components, API client, and icons
backend/src/         Backend services and endpoints
backend/prisma/      Data model and six migrations
backend/scripts/     Startup and verification scripts
backend/test/        Backend tests
docs/contracts/      OpenAPI, types, examples, and business contracts
docs/screenshots/    Sanitized development UI showcase
Dockerfile           Cloud container build entry point
compose.yaml         Local MySQL development container
manifest.json        File hashes, provenance, and sanitization record
```

## Backend deployment prerequisites

These requirements follow this release's source. Refer to the actual cloud console for current controls and quotas.

| Requirement | Details |
| --- | --- |
| WeChat identity | Your own Mini Program AppID / AppSecret and development/upload permissions |
| Cloud environment | An available WeChat CloudRun environment and service, with deployment permissions and matching frontend settings |
| Database | Reachable MySQL; application read/write privileges and appropriate schema-change privileges for migrations |
| Persistent images | A COS bucket, region, and object read/write/delete permissions; cloud mode requires COS rather than instance-local storage |
| Network | Access to MySQL, WeChat login, and COS; configure image upload/download domains as required by the Mini Program platform |
| HTTPS | A real HTTPS origin for signed-image URLs; frontend BASE_URL appends `/api/v1` |
| Container | Build from the repository root, listen on `0.0.0.0:3000`, health path `/api/v1/health` |
| Secrets | Independent random secrets for each environment, injected through deployment configuration and kept out of Git |
| Initial data | Migrations create the schema, not the first family, administrator, or dishes; provision these separately |

### Environment variables

`backend/.env.example` is not a complete cloud deployment template. Cloud mode also needs the settings below.

| Variable | Requirement |
| --- | --- |
| `DEPLOY_TARGET` | `wechat-cloudrun`; enables cloud validation and startup migrations |
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `0.0.0.0` / `3000` |
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/DATABASE`; URL-encode special characters |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | Your own Mini Program credentials, matching the frontend project |
| `JWT_SECRET` | Random secret of at least 32 bytes |
| `IDEMPOTENCY_ENCRYPTION_KEY` | Base64-encoded random bytes; must decode to exactly 32 bytes |
| `FILE_SIGNING_KEY` | Independent random secret of at least 32 bytes |
| `FILE_PUBLIC_BASE_URL` | HTTPS origin such as `https://api.example.com`; no `/api/v1`, query, or embedded credentials |
| `FILE_STORAGE_DRIVER` | `cos` in cloud mode |
| `COS_BUCKET` / `COS_REGION` | Your full bucket name and region |
| `COS_AUTH_MODE` | `wechat-cloudrun` for platform-managed temporary credentials; verify availability and authorization in your environment |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | Required only for static authentication; omit when unused |
| `COS_SECURITY_TOKEN` | Optional token when static-mode credentials are temporary |
| `REGISTRATION_FAMILY_ID` | An existing family ID used by fixed-code registration |
| `REGISTRATION_ADMIN_CODE` | Optional private administrator registration code; at least 32 characters if set |

The fixed guest code was replaced with `REPLACE_GUEST_CODE`. The current implementation still compares a constant; it does not read a `REGISTRATION_GUEST_CODE` variable. Before deploying, replace that placeholder and update the corresponding contract/tests, or separately implement environment-based configuration. Do not deploy the public placeholder as an invitation code. `REPLACE_LEGACY_CODE` is a redacted legacy example, not the current administrator registration setting.

### First family and administrator

A freshly migrated database has no business data. The family-creation endpoint requires an existing active administrator, so a new ordinary user cannot bootstrap the first family through that endpoint.

The deployment owner must provision the first family through a controlled operation following `backend/prisma/schema.prisma`, configure `REGISTRATION_FAMILY_ID`, and use a private `REGISTRATION_ADMIN_CODE` through the authenticated redemption flow to establish the administrator. Verify this initialization separately. There is no one-click production bootstrap script or copy of the original production database in this repository.

## Deployment steps

### 1. Configure the frontend and replace placeholders

- Set your real AppID in `miniprogram/project.config.json`. `touristappid` is a sanitization placeholder, not a credential for real WeChat login testing.
- Set `CLOUD_ENV`, `CLOUD_SERVICE`, and `BASE_URL` in `miniprogram/config.js`; retain `TRANSPORT_MODE: 'cloudrun'` and `USE_MOCK: false`.
- Example BASE_URL: `https://api.example.com/api/v1`. Business requests use `wx.cloud.callContainer` with the environment and `X-WX-SERVICE` routing header.
- Resolve invitation-code placeholders and configure the backend variables in the deployment platform.

### 2. Build and deploy the backend

Build from the repository root: Dockerfile also needs `docs/contracts`, so uploading only the backend directory is insufficient.

```powershell
docker build -t family-meals-backend:0.3.9 .
```

Alternatively, submit the same root-level source through the cloud platform's source-build workflow, select the root Dockerfile, and configure port 3000. Inject variables through secure platform settings; do not include real `.env` files, private keys, or database backups in the source upload.

The Docker build runs `npm ci`, generates Prisma Client, and compiles TypeScript. With `DEPLOY_TARGET=wechat-cloudrun`, the startup script runs `prisma migrate deploy` before starting the app. A failed migration prevents startup.

The image sets `NODE_EXTRA_CA_CERTS=/app/cert/certificate.crt`. Check that the deployment environment supplies the expected certificate. When moving to a regular server, adjust this setting to the actual certificate chain rather than copying machine credentials.

### 3. Verify the backend

1. Inspect build, migration, and startup logs.
2. Request `GET /api/v1/health` and inspect service/database status. Health alone does not verify all business flows.
3. Provision the initial family/admin and test login, role permissions, ordering, and review.
4. Test image upload and display on a real device, including COS authorization and domain settings.
5. Before upgrading an existing database, preserve a recoverable backup. Rolling back an image does not reverse migrations or restore deleted data.

### 4. Import and upload the frontend

Import `miniprogram` in WeChat DevTools, check AppID and cloud/backend settings, compile, and test member and administrator flows on a real device.

Uploading a development version, assigning an experience version, submitting for review, and publishing are separate steps. A successful upload is not a public release. These documentation changes do not redeploy the backend or upload a new Mini Program version.

## Local development and tests

Use Node.js 24 and a reachable MySQL instance. To use the local database container, configure your own passwords using the root `.env.example`, then run `docker compose up -d mysql`. Compose starts only MySQL; it neither starts the backend nor imports production data.

Prepare your own `.env` in `backend`, then run from that directory:

```powershell
npm ci
npm run db:generate
npm run db:validate
npx prisma migrate deploy
npm run build
npm start
```

Point migrations only at the intended development database. Ordinary `npm start` does not automatically migrate; the cloud-specific startup script behaves differently.

Available checks include `npm run typecheck`, `npm run test:base`, and `npm run test:menu`. HTTP, isolated, image, and registration test scripts may write data. Inspect their configuration and use isolated databases/storage, never the live database.

Real local HTTP debugging also requires a matching frontend transport mode, address, and DevTools network settings. Platform-managed COS credentials cannot be assumed available in an ordinary local container. Mock testing does not replace real WeChat login, cloud permissions, database, or COS validation.

## Verification scope

Page counts, dependency versions, configuration constraints, startup order, and deployment requirements were checked against the delivered source. This documentation update does not claim a new container build, migration run, or complete real-device regression. No real secrets or user database contents are included.

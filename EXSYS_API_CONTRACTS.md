# Exsys APIs needed by cure-plus-client-agent and its admin UI

Three new tables/endpoints this project needs - none exist in exsys yet. Paths below are placeholders (named to match the existing `ex_build_pkg`/`ex_app_History` convention) - the actual paths just need to be confirmed once these are built, everything else (shape, fields) is what this document is for.

The first of the three (`ex_clients_pkg`) is only ever read/written by the FE's admin dashboard (`@app-structure/exsys-clients-deployment-modal` in `cure-plus-fe`, opened from the settings menu) - the agent itself never touches it. The other two (`ex_client_deploy_jobs_pkg`, `ex_client_sites_pkg`) are shared: the admin dashboard creates/reads rows, the agent on each machine claims/updates them.

A "rollback" from the admin dashboard is not a fourth table or a new job type - it's an ordinary row in `ex_client_deploy_jobs_pkg` whose `buildUrl`/`buildId`/`buildTime` were copied from one of that same site's own earlier **successful** jobs instead of from `ex_build_pkg`. The agent processes it exactly like any other install job.

All three follow the same convention already used by every other exsys endpoint in this system:

- **GET** (query) endpoints take `?authorization=...` and return `{ "data": [ ...rows ] }`.
- **POST** (DML) endpoints take a body of `{ "authorization": "...", "data": [ ...rows ] }`. Each row carries its own `record_status`: `"n"` to insert, `"u"` to update, `"d"` to delete. **An update replaces the row it targets - it does not merge fields.** This client always echoes back every field it already knows about a row plus whatever it's changing, so a partial-looking payload is still the intended full row, never a deliberate partial patch.
- **Every POST (DML) response** is expected to be `{ "status": "success" }` on success, or `{ "status": "failure", "error_message": "<what went wrong>" }` otherwise - this is what the FE's shared request layer (`@app-structure/refetch`) actually checks: it reads `data.error_message` (falling back to `error_msg`, then `error_code`) to surface a failure, and treats any 200 response whose `status` isn't literally `"failure"` as a success. **The field must be named `error_message`** (not `error`) or the FE will show a generic fallback message instead of the real one. See `EXSYS_API_SQL.sql`'s `EXCEPTION` blocks for the exact shape.
- A few fields are never sent on insert because the backend derives them itself: `ex_client_deploy_jobs.jobId` is generated (a sequence-backed id, e.g. `"job-000123"`); `ex_clients.createdAt` and `ex_client_deploy_jobs.requestedAt` are stamped from `SYSDATE`; `ex_client_deploy_jobs.buildUrl`/`buildTime` are looked up from `ex_build_pkg` by the `buildId` the caller does send (true for both a fresh install and a rollback, since a rollback's `buildId` is always a real `ex_build_pkg` row too). An update/delete still sends `jobId` - by then the caller already has it from an earlier GET, and needs it to say which row to target.

---

## 0. Clients Registry — `ex_clients_pkg`

One row = one client machine, named by an admin so it reads as a hospital/site name instead of a bare `clientId` in the picker. Created only through the "add client" action in the admin dashboard - never by the agent. The `clientId` the dashboard generates here (deterministically, from `clientName` - the admin never types or edits it directly) is what the field technician then types into that machine's `.env` as `CLIENT_ID`, which is what ties this row to whatever the agent later reports under `ex_client_sites_pkg`/`ex_client_deploy_jobs_pkg`.

| Field | Type | Written by | Example | Notes |
|---|---|---|---|---|
| `clientId` | string | **dashboard** (on create) | `"exsys136"` | Generated deterministically from `clientName` when adding the client (a short hash - same name always produces the same id) - the admin never types or edits this field. Whatever it comes out as must be typed into that machine's `.env` as `CLIENT_ID` exactly. |
| `clientName` | string | admin | `"Al Noor Hospital - Riyadh"` | Friendly display name shown everywhere else in the dashboard instead of the raw `clientId`. |
| `notes` | string | admin | `"Main building, 2 Tomcat instances"` | Free text, optional. |
| `createdAt` | string | backend (on insert) | `"17-09-2026 04:19 pm"` | Format: `dd-mm-yyyy hh:mm am/pm`. Stamped by the backend at insert time - the dashboard never sends this field. |
| `record_status` | string | admin | `"n"` \| `"u"` \| `"d"` | Standard exsys DML row-action field. |

### GET `ex_clients_pkg/get_clients_data`

Request: `GET /ex_clients_pkg/get_clients_data?authorization=111111`

No filters - this table is small (one row per client machine, ever) and the dashboard always needs the whole list to render the "add client"/picker views, so unlike the other two GETs below there's no `clientId`/etc. param to support here.

```json
{
  "data": [
    {
      "clientId": "exsys136",
      "clientName": "Al Noor Hospital - Riyadh",
      "notes": "Main building, 2 Tomcat instances",
      "createdAt": "17-09-2026 04:19 pm"
    }
  ]
}
```

The dashboard also shows any `clientId` it finds in `ex_client_sites_pkg` that has no matching row here yet (a machine the agent has already discovered/registered before anyone got round to naming it) - so this table doesn't gate whether a machine's sites show up, only how nicely they're labeled.

### POST `ex_clients_pkg/clients_dml`

**Insert** (the only operation the dashboard currently performs against this table) - note `createdAt` is deliberately absent; the backend stamps it itself so it can't drift from the DB's own clock:

```json
{
  "authorization": "111111",
  "data": [
    {
      "clientId": "exsys136",
      "clientName": "Al Noor Hospital - Riyadh",
      "notes": "Main building, 2 Tomcat instances",
      "record_status": "n"
    }
  ]
}
```

---

## 1. Client Deploy Jobs — `ex_client_deploy_jobs_pkg`

One row = one instruction: "install this build onto this site on this client machine." A row is created by the admin dashboard's "install build" (or "rollback") action when someone picks a build and a target site and clicks install. This client's agent polls for rows addressed to its own `clientId`, claims one, works it, and updates it as it goes.

| Field | Type | Written by | Example | Notes |
|---|---|---|---|---|
| `jobId` | string | **backend** (on insert) | `"job-0001"` | Unique id for the row, generated at insert time. **Not sent by the dashboard on insert** - both the dashboard and the agent only ever read/echo it back afterwards (an update/delete still sends it, to say which row to target). |
| `clientId` | string | admin (on create) | `"exsys136"` | Which machine. Matches the `clientId` in that machine's local `sites.json`. |
| `clientName` | string | **backend** (read-only) | `"Al Noor Hospital - Riyadh"` | **Only present on GET, never sent by the dashboard.** Resolved via a `LEFT JOIN` to `ex_clients` by `clientId` (falling back to the raw `clientId` if that client hasn't been named yet) so the dashboard's Deploy Jobs History table can show a friendly name without a second lookup. |
| `siteName` | string | admin (on create) | `"webapps-9090"` | Which site on that machine. Matches a site's `name` in that machine's `sites.json` (also what gets registered into the client-sites table below - see `siteName` there). |
| `buildId` | string | admin (on create) | `"31846244cbd"` | The build to install - the id of a row the admin picked from `ex_build_pkg`, or, for a rollback, an earlier job's `buildId` for this same site (either way it's always a real `ex_build_pkg.buildID`). Written back onto the client-sites row (as `activeBuildId`) once the install succeeds. |
| `buildUrl` | string | **backend** (on insert) | `"https://transfer.it/t/UnaSgQsXlbQB"` | The transfer.it link the agent downloads and installs. **Not sent by the dashboard** - resolved by the backend from `ex_build_pkg.buildUrl` where `buildID = buildId` at insert time, same reason as `createdAt`/`requestedAt`. |
| `buildTime` | string | **backend** (on insert) | `"17-09-2026 04:19 pm"` | **Not sent by the dashboard** - resolved the same way from `ex_build_pkg.buildTime`. Written back onto the client-sites row (as `activeBuildTime`) once the install succeeds. |
| `status` | string | admin (create: `"pending"`), agent (updates), **admin** (`"cancelled"`, via a dashboard button) | `"pending"` \| `"in-progress"` \| `"success"` \| `"failure"` \| `"cancelled"` | Job lifecycle. The agent claims a `"pending"` job by immediately setting it to `"in-progress"`. If a job is still `"pending"` (no `startedAt`) well past how long the agent's poll loop should take to claim one, the dashboard shows a warning and a "cancel" button - clicking it is what sets `"cancelled"`. There's no automatic/background cancellation - see the note under GET below. |
| `requestedAt` | string | backend (on insert) | `"17-09-2026 04:20 pm"` | When the job was created. Format: `dd-mm-yyyy hh:mm am/pm`. Used to process pending jobs oldest-first. Stamped by the backend at insert time - the dashboard never sends this field. |
| `startedAt` | string | agent | `"17-09-2026 04:21 pm"` | When the agent claimed/started the job. Empty until then. |
| `finishedAt` | string | agent | `"17-09-2026 04:22 pm"` | When the agent finished (success or failure). Empty until then. |
| `agentLog` | string (multi-line) | agent | `"[info] Downloading build...\n[info] Extracting build archive\n[success] Build installed successfully\n"` | Cumulative step-by-step progress log, rewritten (not appended - the whole thing is resent each update) throughout the install. This is what an admin UI would poll to show live-ish progress. |
| `errorMessage` | string | agent | `"Unknown site \"webapps-9999\" on this machine"` | Only set when `status` is `"failure"`. Empty otherwise. |
| `record_status` | string | both | `"n"` \| `"u"` \| `"d"` | Standard exsys DML row-action field. |

### GET `ex_client_deploy_jobs_pkg/get_client_deploy_jobs_data`

Request: `GET /ex_client_deploy_jobs_pkg/get_client_deploy_jobs_data?authorization=111111`

Example response - one already-finished job, one still pending:

```json
{
  "data": [
    {
      "jobId": "job-0001",
      "clientId": "exsys136",
      "clientName": "Al Noor Hospital - Riyadh",
      "siteName": "webapps-9090",
      "buildUrl": "https://transfer.it/t/UnaSgQsXlbQB",
      "buildId": "31846244cbd",
      "buildTime": "17-09-2026 04:19 pm",
      "status": "success",
      "requestedAt": "17-09-2026 04:20 pm",
      "startedAt": "17-09-2026 04:21 pm",
      "finishedAt": "17-09-2026 04:22 pm",
      "agentLog": "[info] Downloading build from https://transfer.it/t/UnaSgQsXlbQB\n[info] Extracting build archive\n[info] Patching env-config.js with this site's settings\n[info] Installing new build to D:\\TomCat9\\webapps\\ROOT\n[success] Build installed successfully\n",
      "errorMessage": ""
    },
    {
      "jobId": "job-0002",
      "clientId": "exsys136",
      "clientName": "Al Noor Hospital - Riyadh",
      "siteName": "webapps1-9595",
      "buildUrl": "https://transfer.it/t/AbCdEfGhIjKl",
      "buildId": "31846244cbd",
      "buildTime": "17-09-2026 04:19 pm",
      "status": "pending",
      "requestedAt": "17-09-2026 05:00 pm",
      "startedAt": "",
      "finishedAt": "",
      "agentLog": "",
      "errorMessage": ""
    }
  ]
}
```

The agent sends its own `clientId` and `status=pending` as query params (`GET .../get_client_deploy_jobs_data?authorization=111111&clientId=exsys136&status=pending`) so the backend can narrow the result set, then also filters client-side on the same two fields as a safety net in case those params aren't (yet) honored - so the query still doesn't *need* to support them, but honoring them means less data sent back.

**Cancelling a stuck job:** the admin dashboard polls this same GET while it's open (every 10s while any job is active) and, client-side, flags any row that's still `"pending"` (no `startedAt`) more than 3 minutes after `requestedAt` - well past how long a running agent's 60-second poll loop should ever take to claim it - with a "not responding?" warning next to it. This is a warning only; nothing happens automatically. The admin then sees a "cancel" button for that site and, if they click it, the dashboard fires an ordinary `client_deploy_jobs_dml` update on that row, setting `status: "cancelled"` and an explanatory `errorMessage`, which frees the site up for a new install/rollback attempt instead of leaving it blocked behind a job nobody will ever pick up. Nothing is cancelled without that explicit click - a stale job with nobody looking at the dashboard just stays `"pending"` and flagged, indefinitely, until someone does.

### POST `ex_client_deploy_jobs_pkg/client_deploy_jobs_dml`

**Insert** (created by the admin UI when a build is queued for install) - note `jobId`, `requestedAt`, `buildUrl`, `buildTime` and `clientName` are all deliberately absent: the backend generates/stamps/resolves them itself so they can't collide with or drift from the DB's own data (`jobId` from a sequence, `requestedAt` from `SYSDATE`, `buildUrl`/`buildTime` looked up from `ex_build_pkg` by `buildId`, `clientName` joined from `ex_clients` by `clientId`):

```json
{
  "authorization": "111111",
  "data": [
    {
      "clientId": "exsys136",
      "siteName": "webapps-9090",
      "buildId": "31846244cbd",
      "status": "pending",
      "startedAt": "",
      "finishedAt": "",
      "agentLog": "",
      "errorMessage": "",
      "record_status": "n"
    }
  ]
}
```

**Update** (written by the agent - claiming the job, pushing progress, and finishing it are all the same shape, just different field values). `clientName` is left out here too - it's resolved fresh on every GET, never stored or echoed back by a caller:

```json
{
  "authorization": "111111",
  "data": [
    {
      "jobId": "job-0003",
      "clientId": "exsys136",
      "siteName": "webapps-9090",
      "buildUrl": "https://transfer.it/t/UnaSgQsXlbQB",
      "buildId": "31846244cbd",
      "buildTime": "17-09-2026 04:19 pm",
      "status": "failure",
      "requestedAt": "17-09-2026 06:00 pm",
      "startedAt": "17-09-2026 06:01 pm",
      "finishedAt": "17-09-2026 06:02 pm",
      "agentLog": "[info] Downloading build from https://transfer.it/t/UnaSgQsXlbQB\n[error] Install failed: ...\n",
      "errorMessage": "Extracted archive has no \"build\" folder at ...",
      "record_status": "u"
    }
  ]
}
```

---

## 2. Client Sites Registry — `ex_client_sites_pkg`

One row = one deployable site (a Tomcat instance's `ROOT` context) that's been discovered on some client machine. Populated automatically by the agent's discovery step (on startup and every 20 minutes) - nobody hand-types these rows. Lets the admin's "install build" picker list install targets by name, and shows each site's currently active build and freshness.

Deliberately thin: no folder paths, URLs, or the NPHIES key are ever sent here - those stay local to each machine's own `sites.json` and get resolved by `siteName` once a deploy job actually arrives. This table only needs enough to render a picker and show status.

| Field | Type | Written by | Example | Notes |
|---|---|---|---|---|
| `clientId` | string | agent | `"exsys136"` | Which machine. |
| `siteName` | string | agent | `"webapps-9090"` | Which site on that machine - matches `sites.json`'s site `name`, and a deploy job's `siteName`. |
| `lastSeenAt` | string | agent (discovery) | `"17-09-2026 08:00 pm"` | Refreshed every discovery cycle (startup + every 20 min) - lets the admin UI tell "still there" apart from a site that's stopped reporting in. |
| `activeBuildId` | string | agent (after install) | `"31846244cbd"` | Matches `ex_build_pkg.buildID`. Set only after a successful install - absent/empty until then. |
| `activeBuildTime` | string | agent (after install) | `"17-09-2026 04:19 pm"` | Matches `ex_build_pkg.buildTime`. Set only after a successful install. |
| `lastUpdatedAt` | string | agent (after install) | `"17-09-2026 06:02 pm"` | When `activeBuildId`/`activeBuildTime` were last set - i.e. when this site was last actually updated. |
| `record_status` | string | agent | `"n"` \| `"u"` \| `"d"` | Standard exsys DML row-action field. |

### GET `ex_client_sites_pkg/get_client_sites_data`

Request: `GET /ex_client_sites_pkg/get_client_sites_data?authorization=111111&clientId=exsys136&siteName=webapps-9090`

`clientId`/`siteName` are both optional narrowing filters, same convention as `ex_client_deploy_jobs_pkg`'s `clientId`/`status`: pass just `clientId` for every site on a machine (registerSitesWithExsys's bulk fetch), or both together for exactly one site's row (getClientSiteRow/updateSiteActiveBuild - looking up one site's previous state before/after an install). Leave both off to return every row.

Example response - one site that's been installed at least once, one that's only ever been discovered (never had a deploy job run against it yet):

```json
{
  "data": [
    {
      "clientId": "exsys136",
      "siteName": "webapps-9090",
      "lastSeenAt": "17-09-2026 08:00 pm",
      "activeBuildId": "31846244cbd",
      "activeBuildTime": "17-09-2026 04:19 pm",
      "lastUpdatedAt": "17-09-2026 06:02 pm"
    },
    {
      "clientId": "exsys136",
      "siteName": "webapps1-9595",
      "lastSeenAt": "17-09-2026 08:00 pm",
      "activeBuildId": "",
      "activeBuildTime": "",
      "lastUpdatedAt": ""
    }
  ]
}
```

The agent sends `clientId` (and `siteName` when it only needs one site's row) as query params so the backend can narrow the result set, then also filters client-side on the same fields as a safety net in case those params aren't (yet) honored - so the query still doesn't *need* to support them, but honoring them means less data sent back.

### POST `ex_client_sites_pkg/client_sites_dml`

Two different call sites write here. Both first `GET` the existing rows and, if a row for that `siteName` already exists, merge their changes into a copy of it client-side before sending - so **on an update, the payload already carries forward every field the agent already knew about that row**, not just the ones it's actively changing. This client never relies on the backend to merge a partial update; whatever's in the payload is meant to become the entire row. (On a brand-new row - `record_status: "n"` - there's nothing to carry forward yet, so the payload is just the new fields.)

**a) Discovery registering/refreshing a site** (every discovery cycle, for every site found) - example updating a row that already has an active build recorded from an earlier install:

```json
{
  "authorization": "111111",
  "data": [
    {
      "clientId": "exsys136",
      "siteName": "webapps-9090",
      "activeBuildId": "31846244cbd",
      "activeBuildTime": "17-09-2026 04:19 pm",
      "lastUpdatedAt": "17-09-2026 06:02 pm",
      "lastSeenAt": "17-09-2026 08:00 pm",
      "record_status": "u"
    }
  ]
}
```

`activeBuildId`/`activeBuildTime`/`lastUpdatedAt` here are carried forward unchanged from the existing row (this call never actually changes them) - only `lastSeenAt` (and `record_status`) are what this call is actually updating. On a site's very first discovery ever, the payload would just be `{ clientId, siteName, lastSeenAt, record_status: "n" }`, since there's no prior row to carry anything forward from.

**b) After a successful install, recording the new active build** - example updating a row that's already been seen by discovery:

```json
{
  "authorization": "111111",
  "data": [
    {
      "clientId": "exsys136",
      "siteName": "webapps-9090",
      "lastSeenAt": "17-09-2026 08:00 pm",
      "activeBuildId": "31846244cbd",
      "activeBuildTime": "17-09-2026 04:19 pm",
      "lastUpdatedAt": "17-09-2026 06:02 pm",
      "record_status": "u"
    }
  ]
}
```

`lastSeenAt` here is carried forward unchanged from the existing row - this call is only actually changing `activeBuildId`/`activeBuildTime`/`lastUpdatedAt`.

**The one thing to flag to the backend regardless of the above:** since this client always sends what it believes is the full row, if the *backend* ever has its own additional fields on this table that the agent doesn't know about, a DML update from this agent would omit them - meaning if the update endpoint replaces rather than merges, those backend-only fields would get nulled out. Worth confirming which behavior the DML actually implements.

---

## Cross-reference: `ex_build_pkg` (already exists)

Not a new table - included here only because `buildId`/`buildTime` above are meant to be copied straight from it. Already has (per `cure-plus-git-service-node`): `buildID`, `buildDate`, `buildTime`, `buildType`, `buildUrl`, `record_status`. The admin's "install build" job-creation step should copy `buildID` → `buildId` and `buildTime` → `buildTime` onto the new deploy-job row when a user picks a build to install.

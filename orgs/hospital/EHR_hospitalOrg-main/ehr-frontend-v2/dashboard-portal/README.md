# Dashboard portal

React/Vite portal for the optional, read-only Group 1 dashboard API. The app includes role-aware views, an app-level light/dark switch, a local hospital login form, REST views, and WebSocket/SSE integration through the dashboard API. The server remains the authority for authentication and role filtering.

## Run

For the integrated local workspace, use `./start.sh` at the repository root after configuring the dashboard API's own ignored `.env`. The portal is served at `http://localhost/dashboard/` through Nginx. Its Compose service builds a production preview using `/dashboard/` as the base path; the standalone Vite dev server can be run with `npm run dev` from this folder.

The portal does not create test accounts. Login calls the existing hospital peer0 login endpoint. Same-origin `ehr_hospital_token` reading is controlled by the explicit production build setting; the portal writes its own dashboard token/user keys and clears those on logout. Never put tokens in query strings.

Dashboard data remains blank or explicitly unavailable when no real event source has supplied it. The UI must not present synthetic events as live data. Use `npm run build` to create a production bundle; the API's separately labelled `npm run demo` is the synthetic-data walkthrough.

The current module status and role map are documented in the root [README](../../../../../README.md) and [dashboard handoff](../../../../../docs/dashboard/PROJECT_HANDOFF.md).

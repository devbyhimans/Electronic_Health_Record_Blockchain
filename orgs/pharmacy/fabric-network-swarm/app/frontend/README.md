# Pharmacy main frontend

React/Vite application served by `p-frontend` on host port `5175` and at `/pharmacy/` through Nginx. It is one of the separately maintained pharmacy interfaces; manager, employee, inventory, and billing are separate apps.

The Vite proxy sends `/api/pharmacy/*` to the pharmacy backend. The UI reports unavailable data rather than presenting local fallback patient records as real. This portal's API availability does not guarantee that the backend can connect to Fabric or IPFS. The backend's legacy profile currently does not match the root `ehrchannel`/MSP topology; ledger-backed actions must remain unavailable until the owning teams complete that integration.

Use root `./start.sh` for the workspace. For local UI-only development, install dependencies here and run `npm run dev -- --host 0.0.0.0 --port 5175`.

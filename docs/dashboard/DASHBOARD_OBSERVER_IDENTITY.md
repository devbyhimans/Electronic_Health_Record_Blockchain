# Draft: enroll a read-only dashboard Fabric observer

These are operator-run instructions only. The dashboard module does not enroll identities, read existing wallets, or alter Fabric configuration. Coordinate with the Blockchain/Security owner before running any enrollment command.

## Required policy

Create a dedicated `dashboard-observer` identity in the existing hospital MSP and grant it only the read permissions needed to connect to the configured channel, query `qscc.GetChainInfo`, and receive committed block events. Do not grant chaincode invoke, submit, configuration update, identity administration, or network administration permissions. Validate the MSP policy and test the observer against a non-production channel before local use.

## Local credential placement

1. Enroll the identity using the team's approved Fabric CA process and a protected operator workstation.
2. Export the observer's enrollment certificate/private key and the TLS client certificate/private key (if mutual TLS is required), plus the trusted peer TLS root certificate, to files under `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/credentials/`.
3. Set `DASHBOARD_FABRIC_IDENTITY_CERT_PATH`, `DASHBOARD_FABRIC_IDENTITY_KEY_PATH`, `DASHBOARD_FABRIC_TLS_CLIENT_CERT_PATH`, `DASHBOARD_FABRIC_TLS_CLIENT_KEY_PATH`, and `DASHBOARD_FABRIC_TLS_ROOT_CERT_PATH` in the dashboard API's own untracked `.env`, using repository-relative paths. Set the peer endpoint, TLS hostname alias, and MSP ID there as well.
4. Keep file permissions restricted to the operator and dashboard process. Never commit credential files or copy another service's wallet.
5. Start the dashboard API and inspect `/health`. An incomplete or unreachable identity should leave the collector at `NOT_CONNECTED`; it must not affect the other API features.

The enrollment command and certificate paths are intentionally not hard-coded here because CA bootstrap identities, CA endpoints, and MSP policies are owned by the deployment operators and were not verified for this module.

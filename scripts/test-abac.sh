#!/usr/bin/env bash
# test-abac.sh – Verify role‑based access control (ABAC) on chaincode functions
# This script invokes protected chaincode functions using the peer CLI with
# both a WRONG identity (should be denied) and a RIGHT identity (should succeed).
# Output is written to evidence/feature-A/<timestamp>.txt and a PASS/FAIL table
# is printed to stdout.

set -euo pipefail

# Helper to get current timestamp for evidence files
now=$(date +"%Y%m%d_%H%M%S")
EVIDENCE_DIR="evidence/feature-A"
mkdir -p "$EVIDENCE_DIR"

# Load common peer env (orderer, channel, chaincode name) – adjust if needed
export CORE_PEER_ADDRESS=peer0.hospital.example.com:7051
export CORE_PEER_LOCALMSPID=HospitalMSP
export CORE_PEER_MSPCONFIGPATH=/tmp/wrongIdentity/msp   # placeholder, will be overridden
export CORE_PEER_TLS_ROOTCERT_FILE=/tmp/wrongIdentity/tls/ca.crt

CHANNEL="ehrchannel"
CHAINCODE="ehr"

# Function to invoke a chaincode transaction and capture output
invoke() {
  local role=$1
  local fn=$2
  local args=$3
  local mspPath=$4
  local tlsRoot=$5
  export CORE_PEER_MSPCONFIGPATH="$mspPath"
  export CORE_PEER_TLS_ROOTCERT_FILE="$tlsRoot"
  peer chaincode invoke \
    -o orderer.example.com:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls true \
    --cafile /tmp/orderer/tls/ca.crt \
    -C "$CHANNEL" -n "$CHAINCODE" \
    --peerAddresses $CORE_PEER_ADDRESS \
    --tlsRootCertFiles "$CORE_PEER_TLS_ROOTCERT_FILE" \
    -c '{"Args":["$fn"$args]}' 2>&1
}

# Define test cases: fn, wrongRolePath, rightRolePath, args (as JSON array elements, comma‑prefixed)
# Adjust the MSP paths to point to the enrolled identities under orgs/*/users/*

test_case() {
  local fn=$1
  local wrongPath=$2
  local rightPath=$3
  local args=$4
  local wrongRole=$(basename "$wrongPath")
  local rightRole=$(basename "$rightPath")
  echo "Testing $fn – wrong role $wrongRole should be DENIED, right role $rightRole should be ALLOWED"

  # Wrong identity
  outWrong=$(invoke "$wrongRole" "$fn" "$args" "$wrongPath/msp" "$wrongPath/tls/ca.crt" || true)
  if echo "$outWrong" | grep -q "ACCESS DENIED"; then
    resultWrong="DENIED (expected)"
  else
    resultWrong="PASS (unexpected)"
  fi

  # Right identity
  outRight=$(invoke "$rightRole" "$fn" "$args" "$rightPath/msp" "$rightPath/tls/ca.crt" || true)
  if echo "$outRight" | grep -q "Transaction committed"; then
    resultRight="ALLOWED (expected)"
  else
    resultRight="FAIL (unexpected)"
  fi

  printf "%s as %s -> %s | %s as %s -> %s\n" "$fn" "$wrongRole" "$resultWrong" "$fn" "$rightRole" "$resultRight"
  # Save raw outputs
  echo "--- Wrong identity ($wrongRole) output ---" > "$EVIDENCE_DIR/${fn}_wrong_${now}.txt"
  echo "$outWrong" >> "$EVIDENCE_DIR/${fn}_wrong_${now}.txt"
  echo "--- Right identity ($rightRole) output ---" >> "$EVIDENCE_DIR/${fn}_right_${now}.txt"
  echo "$outRight" >> "$EVIDENCE_DIR/${fn}_right_${now}.txt"
}

# -------------------------------------------------------------------
# Adjust the paths below to match your enrollment output structure.
# Example paths (replace with actual ones):
#   orgs/hospital/users/doctor
#   orgs/pharmacy/users/pharmacist
#   orgs/lab/users/labtech
#   orgs/patient/users/patient
# -------------------------------------------------------------------

DOCTOR_PATH="orgs/hospital/users/doctor"
PHARMACIST_PATH="orgs/pharmacy/users/pharmacist"
LABTECH_PATH="orgs/lab/users/labtech"
PATIENT_PATH="orgs/patient/users/patient"

# 1. UpdateEHRCID – allowed role: doctor
#    Args: ["patientID", "newEHRId"] – using placeholder values

test_case "UpdateEHRCID" "$PHARMACIST_PATH" "$DOCTOR_PATH" ",\"patient123\",\"ehr456\""

# 2. CreateLabResult – allowed role: labtech
#    Args: ["labResultID", "patientID", "data"]

test_case "CreateLabResult" "$DOCTOR_PATH" "$LABTECH_PATH" ",\"labres789\",\"patient123\",\"RESULT_DATA\""

# 3. DispensePrescription – allowed role: pharmacist
#    Args: ["prescriptionID", "patientID", "drugInfo"]

test_case "DispensePrescription" "$DOCTOR_PATH" "$PHARMACIST_PATH" ",\"presc001\",\"patient123\",\"DRUG_X\""

# 4. GrantAccess – allowed role: patient
#    Args: ["granteeMSP", "patientID"]

test_case "GrantAccess" "$DOCTOR_PATH" "$PATIENT_PATH" ",\"PharmacyMSP\",\"patient123\""

# 5. RevokeAccess – allowed role: patient
#    Args: ["granteeMSP", "patientID"]

test_case "RevokeAccess" "$DOCTOR_PATH" "$PATIENT_PATH" ",\"PharmacyMSP\",\"patient123\""

echo "ABAC test completed. Evidence stored in $EVIDENCE_DIR"


#!/usr/bin/env bash
# show-cert-attrs.sh – Display the role attribute from an identity certificate
# Usage: ./show-cert-attrs.sh <path-to-msp>/signcerts/cert.pem
# Example: ./show-cert-attrs.sh orgs/hospital/users/doctor/msp/signcerts/cert.pem

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <cert.pem>"
  exit 1
fi

CERT_PATH="$1"

# Print the certificate details and extract the role attribute (OID 1.2.3.4.5.6.7.8.1 is example – replace with actual OID if different)
openssl x509 -in "$CERT_PATH" -text -noout | grep -A1 "Attributes" || true

# More precise extraction (assuming attribute is in the extensions with OID 1.2.3.4.5.6.7.8.1)
openssl x509 -in "$CERT_PATH" -text -noout | awk '/1\.2\.3\.4\.5\.6\.7\.8\.1/ {print $0}'


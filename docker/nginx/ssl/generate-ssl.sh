#!/usr/bin/env bash
# ====================================================================
# E-Healthcare Portal - Self-Signed SSL Certificate Generator (Linux/Mac)
# Used for Local HTTPS Development with TLS 1.3
# ====================================================================

set -e

SSL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_FILE="${SSL_DIR}/server.crt"
KEY_FILE="${SSL_DIR}/server.key"

echo "==> Generating Self-Signed SSL Certificate for E-Healthcare Local Development..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -subj "/C=VN/ST=Hanoi/L=Hanoi/O=E-Healthcare/OU=DevTeam/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"

echo "==> Certificate generated successfully:"
echo "    Certificate: ${CERT_FILE}"
echo "    Private Key: ${KEY_FILE}"

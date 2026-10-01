# ====================================================================
# E-Healthcare Portal - Self-Signed SSL Certificate Generator (PowerShell)
# Used for Local HTTPS Development with TLS 1.3
# ====================================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CertPath = (Join-Path $ScriptDir "server.crt").Replace("\", "/")
$KeyPath = (Join-Path $ScriptDir "server.key").Replace("\", "/")

Write-Host "==> Generating Self-Signed SSL Certificate for E-Healthcare Local Development..." -ForegroundColor Cyan

$OpenSSL = Get-Command openssl -ErrorAction SilentlyContinue
if ($OpenSSL) {
    & openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
        -keyout $KeyPath `
        -out $CertPath `
        -subj "/C=VN/ST=Hanoi/L=Hanoi/O=E-Healthcare/OU=DevTeam/CN=localhost" `
        -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"
} else {
    Write-Host "==> OpenSSL not found in PATH, using Python cryptography fallback..." -ForegroundColor Yellow
    $PyScript = @"
import datetime, ipaddress
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, 'VN'),
    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, 'Hanoi'),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'E-Healthcare'),
    x509.NameAttribute(NameOID.COMMON_NAME, 'localhost'),
])
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
    .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
    .add_extension(
        x509.SubjectAlternativeName([
            x509.DNSName('localhost'),
            x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
        ]),
        critical=False,
    )
    .sign(key, hashes.SHA256())
)
with open('$KeyPath', 'wb') as f:
    f.write(key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    ))
with open('$CertPath', 'wb') as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))
"@
    python -c $PyScript
}

Write-Host "==> Certificate generated successfully:" -ForegroundColor Green
Write-Host "    Certificate: $CertPath"
Write-Host "    Private Key: $KeyPath"

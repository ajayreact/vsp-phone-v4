# Generate VSP Phone v4 development CA + server certificates (.NET / Windows).
# Usage: .\scripts\tls\generate-dev-certs.ps1 [-Force]
param(
  [switch]$Force,
  [string]$TlsEnv = $(if ($env:TLS_ENV) { $env:TLS_ENV } else { 'development' }),
  [int]$CaDays = 3650,
  [int]$LeafDays = 825
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$TlsRoot = Join-Path $Root 'infrastructure\tls'
$Live = Join-Path $TlsRoot "$TlsEnv\live"

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Export-PemCert([System.Security.Cryptography.X509Certificates.X509Certificate2]$Cert, [string]$Path) {
  $b64 = [Convert]::ToBase64String($Cert.RawData)
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('-----BEGIN CERTIFICATE-----')
  for ($i = 0; $i -lt $b64.Length; $i += 64) {
    $len = [Math]::Min(64, $b64.Length - $i)
    [void]$sb.AppendLine($b64.Substring($i, $len))
  }
  [void]$sb.AppendLine('-----END CERTIFICATE-----')
  Set-Content -Path $Path -Value $sb.ToString() -Encoding ascii
}

function Export-PemPrivateKey([System.Security.Cryptography.AsymmetricAlgorithm]$Key, [string]$Path) {
  $bytes = $Key.ExportPkcs8PrivateKey()
  $b64 = [Convert]::ToBase64String($bytes)
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('-----BEGIN PRIVATE KEY-----')
  for ($i = 0; $i -lt $b64.Length; $i += 64) {
    $len = [Math]::Min(64, $b64.Length - $i)
    [void]$sb.AppendLine($b64.Substring($i, $len))
  }
  [void]$sb.AppendLine('-----END PRIVATE KEY-----')
  Set-Content -Path $Path -Value $sb.ToString() -Encoding ascii
}

function New-DevCa {
  $caDir = Join-Path $Live 'ca'
  Ensure-Dir $caDir
  $keyPath = Join-Path $caDir 'ca.key'
  $crtPath = Join-Path $caDir 'ca.crt'
  if ((Test-Path $keyPath) -and -not $Force) {
    Write-Host '[skip] CA exists (use -Force)'
    return [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($crtPath)
  }

  $rsa = [System.Security.Cryptography.RSA]::Create(4096)
  $req = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=VSP Phone v4 Dev Root CA, O=VSP Phone v4, OU=Development CA, L=Development, S=Local, C=US',
    $rsa,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
  )
  $req.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true, $true, 1, $true)
  )
  $req.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($req.PublicKey, $false)
  )
  $ku = [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign -bor `
        [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign -bor `
        [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature
  $req.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($ku, $true)
  )
  $notBefore = [DateTimeOffset]::UtcNow.AddDays(-1)
  $notAfter = $notBefore.AddDays($CaDays)
  $cert = $req.CreateSelfSigned($notBefore, $notAfter)
  Export-PemPrivateKey $rsa $keyPath
  Export-PemCert $cert $crtPath
  $trust = Join-Path $TlsRoot 'trust-store\dev-ca.crt'
  Ensure-Dir (Split-Path $trust)
  Copy-Item $crtPath $trust -Force
  Write-Host '[ok] development CA'
  return $cert
}

function Get-CommonSans {
  @(
    'DNS:localhost',
    'IP:127.0.0.1',
    'DNS:api',
    'DNS:admin',
    'DNS:kamailio',
    'DNS:sip',
    'DNS:wss',
    'DNS:prov',
    'DNS:api.localhost',
    'DNS:sip.localhost',
    'DNS:wss.localhost',
    'DNS:prov.localhost',
    'DNS:admin.localhost',
    'DNS:host.docker.internal'
  )
}

function New-Leaf(
  [string]$Name,
  [string]$Cn,
  [System.Security.Cryptography.X509Certificates.X509Certificate2]$CaCert,
  [System.Security.Cryptography.RSA]$CaKey
) {
  $dir = Join-Path $Live $Name
  Ensure-Dir $dir
  $keyPath = Join-Path $dir 'privkey.pem'
  $crtPath = Join-Path $dir 'cert.pem'
  $fullPath = Join-Path $dir 'fullchain.pem'
  if ((Test-Path $keyPath) -and -not $Force) {
    Write-Host "[skip] $Name already exists (use -Force)"
    return
  }

  $rsa = [System.Security.Cryptography.RSA]::Create(2048)
  $req = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    "CN=$Cn, O=VSP Phone v4, OU=Development, L=Development, S=Local, C=US",
    $rsa,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
  )
  $req.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $false)
  )
  $ku = [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor `
        [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment
  $req.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($ku, $true)
  )
  $ekuOid = [System.Security.Cryptography.OidCollection]::new()
  [void]$ekuOid.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1')) # serverAuth
  [void]$ekuOid.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.2')) # clientAuth
  $req.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($ekuOid, $false)
  )
  $sanBuilder = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  foreach ($entry in Get-CommonSans) {
    if ($entry.StartsWith('DNS:')) { $sanBuilder.AddDnsName($entry.Substring(4)) }
    elseif ($entry.StartsWith('IP:')) { $sanBuilder.AddIpAddress([System.Net.IPAddress]::Parse($entry.Substring(3))) }
  }
  $req.CertificateExtensions.Add($sanBuilder.Build())
  $req.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($req.PublicKey, $false)
  )
  $serial = New-Object byte[] 16
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($serial)
  $notBefore = [DateTimeOffset]::UtcNow.AddDays(-1)
  $notAfter = $notBefore.AddDays($LeafDays)
  $leaf = $req.Create($CaCert, $notBefore, $notAfter, $serial)

  Export-PemPrivateKey $rsa $keyPath
  Export-PemCert $leaf $crtPath
  $caCrtPath = Join-Path $Live 'ca\ca.crt'
  $full = (Get-Content $crtPath -Raw) + (Get-Content $caCrtPath -Raw)
  Set-Content -Path $fullPath -Value $full -Encoding ascii
  Write-Host "[ok] issued $Name ($Cn)"
}

Ensure-Dir $Live
$caCertBare = New-DevCa

# Load CA key for signing
$caKeyPem = Get-Content (Join-Path $Live 'ca\ca.key') -Raw
$caKeyPem = $caKeyPem -replace '-----BEGIN PRIVATE KEY-----', '' -replace '-----END PRIVATE KEY-----', '' -replace '\s', ''
$caKeyBytes = [Convert]::FromBase64String($caKeyPem)
$caRsa = [System.Security.Cryptography.RSA]::Create()
$caRsa.ImportPkcs8PrivateKey($caKeyBytes, [ref]$null)

# Re-open CA cert with private key for Create()
$caCertWithKey = $caCertBare.CopyWithPrivateKey($caRsa)

New-Leaf -Name 'api' -Cn 'api.localhost' -CaCert $caCertWithKey -CaKey $caRsa
New-Leaf -Name 'admin' -Cn 'admin.localhost' -CaCert $caCertWithKey -CaKey $caRsa
New-Leaf -Name 'sip' -Cn 'sip.localhost' -CaCert $caCertWithKey -CaKey $caRsa
New-Leaf -Name 'prov' -Cn 'prov.localhost' -CaCert $caCertWithKey -CaKey $caRsa

# WSS copies SIP leaf
$wss = Join-Path $Live 'wss'
Ensure-Dir $wss
Copy-Item (Join-Path $Live 'sip\cert.pem') (Join-Path $wss 'cert.pem') -Force
Copy-Item (Join-Path $Live 'sip\privkey.pem') (Join-Path $wss 'privkey.pem') -Force
Copy-Item (Join-Path $Live 'sip\fullchain.pem') (Join-Path $wss 'fullchain.pem') -Force
Write-Host '[ok] wss linked to sip leaf'

$kam = Join-Path $Live 'kamailio'
Ensure-Dir $kam
Copy-Item (Join-Path $Live 'sip\privkey.pem') (Join-Path $kam 'privkey.pem') -Force
Copy-Item (Join-Path $Live 'sip\fullchain.pem') (Join-Path $kam 'fullchain.pem') -Force
Copy-Item (Join-Path $Live 'ca\ca.crt') (Join-Path $kam 'ca.crt') -Force
Write-Host '[ok] kamailio cert bundle'

$manifest = @"
generated_at=$([DateTime]::UtcNow.ToString('o'))
tls_env=$TlsEnv
ca_days=$CaDays
leaf_days=$LeafDays
leaves=api,admin,sip,wss,prov,kamailio
generator=powershell-dotnet
"@
Set-Content -Path (Join-Path $Live 'MANIFEST.txt') -Value $manifest -Encoding ascii
Write-Host "Done. Live material: $Live"
Write-Host 'Validate: node scripts/tls/validate-certs.mjs'

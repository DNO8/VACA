param(
  [string]$DeviceId,
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\supabase\.env")
)

$required = @(
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SERVER_BUNDLE_PUBLIC_KEY",
  "SERVER_RECEIPT_PUBLIC_KEY"
)
$optional = @(
  "REVENUECAT_ANDROID_API_KEY",
  "ADMOB_BANNER_AD_UNIT_ID"
)
$allowed = $required + $optional
$values = @{}

if (-not (Test-Path $EnvFile -PathType Leaf)) {
  throw "Missing environment file: $EnvFile"
}

[IO.File]::ReadAllLines($EnvFile) | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') {
    $name = $matches[1].Trim()
    if ($allowed -contains $name) {
      $values[$name] = $matches[2].Trim()
    }
  }
}

$missing = @($required | Where-Object {
  -not $values.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($values[$_])
})
if ($missing.Count -gt 0) {
  throw "Missing required configuration: $($missing -join ', ')"
}

if ([string]::IsNullOrWhiteSpace($DeviceId)) {
  $androidDevices = @(
    (& flutter devices --machine | ConvertFrom-Json) |
      Where-Object { $_.targetPlatform -like 'android*' }
  )
  if ($androidDevices.Count -ne 1) {
    throw "Expected one Android device, found $($androidDevices.Count). Pass -DeviceId explicitly."
  }
  $DeviceId = $androidDevices[0].id
}

$flutterArgs = @(
  "run",
  "-d", $DeviceId,
  "--flavor", "dev",
  "--dart-define=FLAVOR=dev"
)
foreach ($name in $required + $optional) {
  if ($values.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($values[$name])) {
    $flutterArgs += "--dart-define=$name=$($values[$name])"
  }
}

Push-Location $PSScriptRoot
try {
  & flutter @flutterArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}

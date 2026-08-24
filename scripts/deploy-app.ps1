param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("hml", "prd")]
  [string]$Environment,

  [string]$App = "ecargo-analytics"
)

$ErrorActionPreference = "Stop"

if ($App -ne "ecargo-analytics") {
  throw "Aplicacao invalida: $App"
}

$root = Split-Path -Parent $PSScriptRoot
$varsFile = Join-Path $root "k8s\vars.$Environment.env"
$manifestFile = Join-Path $root "k8s\$App\$App.yaml"

if (-not (Test-Path -LiteralPath $varsFile)) {
  throw "Arquivo de variaveis nao encontrado: $varsFile"
}

if (-not (Test-Path -LiteralPath $manifestFile)) {
  throw "Manifesto nao encontrado: $manifestFile"
}

$values = @{}
Get-Content -LiteralPath $varsFile | ForEach-Object {
  if ($_ -match "^[A-Za-z_][A-Za-z0-9_]*=") {
    $key, $value = $_ -split "=", 2
    $values[$key] = $value
  }
}

$manifest = Get-Content -Raw -LiteralPath $manifestFile
foreach ($entry in $values.GetEnumerator()) {
  $manifest = $manifest.Replace("`${$($entry.Key)}", $entry.Value)
}

$manifest | kubectl apply -f -

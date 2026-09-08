param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$webSource = Join-Path $projectRoot 'TPMidi'

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
Copy-Item -LiteralPath (Join-Path $webSource 'config.html') -Destination (Join-Path $OutputDirectory 'index.html') -Force
Copy-Item -LiteralPath (Join-Path $webSource 'config.css') -Destination (Join-Path $OutputDirectory 'config.css') -Force
Copy-Item -LiteralPath (Join-Path $webSource 'tokens.css') -Destination (Join-Path $OutputDirectory 'tokens.css') -Force
Copy-Item -LiteralPath (Join-Path $webSource 'firmware-update.js') -Destination (Join-Path $OutputDirectory 'firmware-update.js') -Force

$files = Get-ChildItem -LiteralPath $OutputDirectory -File
if ($files.Count -ne 4) {
  throw 'The Pages artifact must contain only the four TPMidi Config web files.'
}

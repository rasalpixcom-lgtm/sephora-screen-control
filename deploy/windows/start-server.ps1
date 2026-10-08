$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $taskRoot
if (-not (Test-Path -LiteralPath '.env.local')) { throw 'Create .env.local before starting the server.' }
if (-not (Test-Path -LiteralPath '.next/standalone/server.js')) { throw 'Run npm ci and npm run build first.' }
& node --env-file=.env.local .next/standalone/server.js
exit $LASTEXITCODE

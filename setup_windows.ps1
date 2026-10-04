# Installation du Copilote pénal local sous Windows, sans droits administrateur.
# - Node.js LTS portable (archive officielle, somme de contrôle vérifiée)
# - Electron et pdf.js installés HORS de OneDrive (%LOCALAPPDATA%\LLMLAW\deps)
# - Vérification d'Ollama et du modèle Mistral local
# Usage : clic droit > Exécuter avec PowerShell, ou : powershell -ExecutionPolicy Bypass -File setup_windows.ps1

$ErrorActionPreference = 'Stop'
$base = Join-Path $env:LOCALAPPDATA 'LLMLAW'
$node = Join-Path $base 'node'
$deps = Join-Path $base 'deps'
New-Item -ItemType Directory -Force $base, $deps | Out-Null

if (-not (Test-Path (Join-Path $node 'node.exe'))) {
  Write-Host 'Téléchargement de Node.js LTS (portable)...'
  $lts = (Invoke-RestMethod https://nodejs.org/dist/index.json | Where-Object { $_.lts -ne $false } | Select-Object -First 1).version
  $zip = Join-Path $base 'node.zip'
  Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$lts/node-$lts-win-x64.zip" -OutFile $zip
  $sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$lts/SHASUMS256.txt").Content
  $expected = (($sums -split "`n" | Where-Object { $_ -match "node-$lts-win-x64.zip" }) -split '\s+')[0]
  if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $expected) { throw 'Somme de contrôle Node.js invalide' }
  Expand-Archive $zip -DestinationPath $base -Force
  Rename-Item (Join-Path $base "node-$lts-win-x64") 'node'
  Remove-Item $zip
}
$env:PATH = "$node;$env:PATH"
Write-Host "Node $(& (Join-Path $node 'node.exe') --version)"

Push-Location $deps
if (-not (Test-Path package.json)) { '{"name":"llmlaw-deps","private":true}' | Out-File -Encoding ascii package.json }
& (Join-Path $node 'npm.cmd') install --no-audit --no-fund electron@44 pdfjs-dist@6
if (-not (Test-Path 'node_modules\electron\dist\electron.exe')) { & (Join-Path $node 'node.exe') 'node_modules\electron\install.js' }
Pop-Location

$ollama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
if (Test-Path $ollama) {
  Write-Host 'Ollama détecté. Modèles locaux :'
  & $ollama list
  Write-Host 'Pour la démo : ollama pull ministral-3:8b  (ou ministral-3:3b sur une machine modeste)'
} else {
  Write-Host 'Ollama non détecté : l''application fonctionne en mode règles. Installation : winget install Ollama.Ollama'
}
Write-Host 'Installation terminée. Lancement : lancer_app.cmd'

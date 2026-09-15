#requires -Version 5.1
<#
.SYNOPSIS
  Installe la configuration Obsidian (https://github.com/ahmed-mili/obsidian-config)
  dans un vault, avec le theme AnuPpuccin et les plugins communautaires.

.USAGE
  irm https://raw.githubusercontent.com/ahmed-mili/obsidian-config/main/install.ps1 | iex

  Cree le vault dans C:\Efrei. Ne touche jamais a un dossier existant :
  si C:\Efrei existe deja, demande un autre nom de dossier a creer.
#>

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo     = 'ahmed-mili/obsidian-config'
$ZipUrl   = "https://github.com/$Repo/archive/refs/heads/main.zip"
$Registry = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json'
$Theme    = @{ Name = 'AnuPpuccin'; Repo = 'AnubisNekhet/AnuPpuccin' }

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Skip($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }

# --- 1. Vault cible --------------------------------------------------------
$vault = 'C:\Efrei'
while (Test-Path -LiteralPath $vault) {
    Write-Host "Le dossier $vault existe deja et ne sera pas modifie." -ForegroundColor Yellow
    $name = (Read-Host 'Nom du nouveau dossier a creer a la racine de C:').Trim()
    # Nom simple uniquement : pas de chemin, pas de remontee, pas de caracteres interdits.
    if ($name -notmatch '^[\p{L}\p{N} _-]{1,64}$') {
        Write-Host "Nom invalide : lettres, chiffres, espaces, tirets uniquement." -ForegroundColor Red
        continue
    }
    $vault = Join-Path 'C:\' $name
}
# Garde-fou final : on ne cree QUE si le dossier n'existe pas (New-Item sans -Force echoue sinon).
if (Test-Path -LiteralPath $vault) { throw "Refus : $vault existe." }
New-Item -ItemType Directory -Path $vault -ErrorAction Stop | Out-Null
$obsidianDir = Join-Path $vault '.obsidian'

# --- 2. Configuration ------------------------------------------------------
Write-Step "Telechargement de la configuration"
$tmp = Join-Path ([IO.Path]::GetTempPath()) "obsidian-config-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $tmp | Out-Null
$zip = Join-Path $tmp 'config.zip'
Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$src = Join-Path (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName '.obsidian'

if (Test-Path -LiteralPath $obsidianDir) { throw "Refus : $obsidianDir existe deja." }
New-Item -ItemType Directory -Path $obsidianDir | Out-Null
Copy-Item (Join-Path $src '*') $obsidianDir -Recurse -Force
Remove-Item $tmp -Recurse -Force

# --- 3. Theme --------------------------------------------------------------
Write-Step "Theme $($Theme.Name)"
$themeDir = Join-Path $obsidianDir "themes\$($Theme.Name)"
New-Item -ItemType Directory -Force -Path $themeDir | Out-Null
$release = Invoke-RestMethod "https://api.github.com/repos/$($Theme.Repo)/releases/latest" -UseBasicParsing
foreach ($file in 'theme.css', 'manifest.json') {
    $asset = $release.assets | Where-Object name -eq $file
    if ($asset) { Invoke-WebRequest $asset.browser_download_url -OutFile (Join-Path $themeDir $file) -UseBasicParsing }
    else { Invoke-WebRequest "https://raw.githubusercontent.com/$($Theme.Repo)/master/$file" -OutFile (Join-Path $themeDir $file) -UseBasicParsing }
}

# --- 4. Plugins communautaires --------------------------------------------
Write-Step "Plugins communautaires"
$wanted   = Get-Content (Join-Path $obsidianDir 'community-plugins.json') -Raw | ConvertFrom-Json
$registry = Invoke-RestMethod $Registry -UseBasicParsing
foreach ($id in $wanted) {
    $dir = Join-Path $obsidianDir "plugins\$id"
    if (Test-Path (Join-Path $dir 'main.js')) { Write-Skip "$id : deja present"; continue }
    $entry = $registry | Where-Object id -eq $id
    if (-not $entry) { Write-Skip "$id : plugin local absent du registre, ignore"; continue }
    Write-Host "    $id" -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $rel = Invoke-RestMethod "https://api.github.com/repos/$($entry.repo)/releases/latest" -UseBasicParsing
    foreach ($file in 'main.js', 'manifest.json', 'styles.css') {
        $asset = $rel.assets | Where-Object name -eq $file
        if ($asset) { Invoke-WebRequest $asset.browser_download_url -OutFile (Join-Path $dir $file) -UseBasicParsing }
    }
}

Write-Host ""
Write-Host "Termine. Ouvre le vault dans Obsidian :" -ForegroundColor Green
Write-Host "  $vault"

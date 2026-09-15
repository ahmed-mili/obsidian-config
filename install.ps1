#requires -Version 5.1
<#
.SYNOPSIS
  Installe la configuration Obsidian (https://github.com/ahmed-mili/obsidian-config)
  dans un vault, avec le theme AnuPpuccin et les plugins communautaires.

.USAGE
  Dans PowerShell normal (pas administrateur) :
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
# Telecharge un asset de la derniere release GitHub sans passer par api.github.com
# (quota 60 req/h par IP). Retourne $false si l'asset n'existe pas (ex. styles.css optionnel).
function Get-ReleaseAsset($repo, $file, $dest) {
    try {
        Invoke-WebRequest "https://github.com/$repo/releases/latest/download/$file" -OutFile $dest -UseBasicParsing
        return $true
    } catch { return $false }
}

# --- 1. Vault cible --------------------------------------------------------
$vault = 'C:\Efrei'
while (Test-Path -LiteralPath $vault) {
    Write-Host "Le dossier $vault existe deja et ne sera pas modifie." -ForegroundColor Yellow
    $name = [string](Read-Host 'Nom du nouveau dossier a creer a la racine de C:'); $name = $name.Trim()
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
$createdByScript = $vault
$obsidianDir = Join-Path $vault '.obsidian'

try {

# --- 2. Configuration ------------------------------------------------------
Write-Step "Telechargement de la configuration"
if (Test-Path -LiteralPath $obsidianDir) { throw "Refus : $obsidianDir existe deja." }
if (Get-Command git -ErrorAction SilentlyContinue) {
    git clone --quiet --depth 1 "https://github.com/$Repo.git" $vault
    if ($LASTEXITCODE -ne 0) { throw "git clone a echoue." }
} else {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) "obsidian-config-$([guid]::NewGuid())"
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $zip = Join-Path $tmp 'config.zip'
    Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
    Copy-Item (Join-Path $src '*') $vault -Recurse -Force
    Remove-Item $tmp -Recurse -Force
}
# Liste des plugins a activer (plugins.json du depot) -> community-plugins.json du vault.
# community-plugins.json n'est pas versionne : Obsidian y ecrit aussi les plugins locaux a la machine.
$wanted = @(Get-Content (Join-Path $vault 'plugins.json') -Raw | ConvertFrom-Json)
[IO.File]::WriteAllText((Join-Path $obsidianDir 'community-plugins.json'), (ConvertTo-Json -InputObject $wanted))  # UTF-8 sans BOM
# Ne garder que ce qui appartient au vault : les fichiers du depot n'ont rien a y faire.
foreach ($extra in '.git', '.github', '.gitignore', 'install.ps1', 'plugins.json') {
    $path = Join-Path $vault $extra
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}

# --- 3. Theme --------------------------------------------------------------
Write-Step "Theme $($Theme.Name)"
$themeDir = Join-Path $obsidianDir "themes\$($Theme.Name)"
New-Item -ItemType Directory -Force -Path $themeDir | Out-Null
foreach ($file in 'theme.css', 'manifest.json') {
    if (-not (Get-ReleaseAsset $Theme.Repo $file (Join-Path $themeDir $file))) {
        throw "Impossible de telecharger $file du theme $($Theme.Name)."
    }
}

# --- 4. Plugins communautaires --------------------------------------------
Write-Step "Plugins communautaires"
$registry = Invoke-RestMethod $Registry -UseBasicParsing
foreach ($id in $wanted) {
    $dir = Join-Path $obsidianDir "plugins\$id"
    if (Test-Path (Join-Path $dir 'main.js')) { Write-Skip "$id : deja present"; continue }
    $entry = $registry | Where-Object id -eq $id
    if (-not $entry) { Write-Host "    $id : absent du registre communautaire, verifie plugins.json" -ForegroundColor Yellow; continue }
    Write-Host "    $id" -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    foreach ($file in 'main.js', 'manifest.json') {
        if (-not (Get-ReleaseAsset $entry.repo $file (Join-Path $dir $file))) { throw "Impossible de telecharger $file du plugin $id." }
    }
    Get-ReleaseAsset $entry.repo 'styles.css' (Join-Path $dir 'styles.css') | Out-Null
}

Write-Host ""
Write-Host "Termine. Ouvre le vault dans Obsidian :" -ForegroundColor Green
Write-Host "  $vault"
} catch {
    # Echec : on supprime le dossier que CE script vient de creer (il n'existait pas avant).
    if ($createdByScript -and (Test-Path -LiteralPath $createdByScript)) {
        Remove-Item -LiteralPath $createdByScript -Recurse -Force
    }
    Write-Host "Echec : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Rien n'a ete laisse sur le disque. Relance la commande." -ForegroundColor Yellow
}

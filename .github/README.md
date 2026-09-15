# Obsidian Config

Configuration Obsidian portable : réglages, snippets CSS et plugins locaux.

## Installation

Dans PowerShell :

```powershell
irm https://raw.githubusercontent.com/ahmed-mili/obsidian-config/main/install.ps1 | iex
```

Le script demande le chemin du vault (créé s'il n'existe pas), puis installe la configuration, le thème [AnuPpuccin](https://github.com/AnubisNekhet/AnuPpuccin) et les plugins communautaires. Un `.obsidian` déjà présent est sauvegardé en `.obsidian.bak-<date>`.

Pour passer le chemin sans invite :

```powershell
$env:OBSIDIAN_VAULT = "C:\Vaults\MonVault"; irm https://raw.githubusercontent.com/ahmed-mili/obsidian-config/main/install.ps1 | iex
```

Ouvrir ensuite le vault dans Obsidian.

## Mise à jour

Relancer la même commande sur le vault existant.

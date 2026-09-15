# Obsidian Config

Configuration Obsidian portable : réglages, snippets CSS et plugins locaux.

## Installation

Dans PowerShell **normal** (pas besoin de l'ouvrir en administrateur) :

```powershell
irm https://raw.githubusercontent.com/ahmed-mili/obsidian-config/main/install.ps1 | iex
```

Le script crée le vault dans `C:\Efrei`, puis y installe la configuration, le thème [AnuPpuccin](https://github.com/AnubisNekhet/AnuPpuccin) et les plugins communautaires. Il ne modifie jamais un dossier existant : si `C:\Efrei` est déjà présent, il demande le nom d'un autre dossier à créer à la racine de `C:\`.

Ouvrir ensuite le dossier créé dans Obsidian.

# Obsidian Config

Configuration Obsidian portable : réglages, snippets CSS et plugins locaux.

## Installation

Ouvrir Windows Terminal (`Win + X` puis `I`) et coller :

```powershell
irm https://raw.githubusercontent.com/ahmed-mili/obsidian-config/main/install.ps1 | iex
```

Le script crée le vault dans `C:\Efrei`, puis y installe la configuration, le thème [AnuPpuccin](https://github.com/AnubisNekhet/AnuPpuccin) et les plugins communautaires. Il ne modifie jamais un dossier existant : si `C:\Efrei` est déjà présent, il demande le nom d'un autre dossier à créer à la racine de `C:\`.

Ouvrir ensuite le dossier créé dans Obsidian.

## Plugins installés

La liste des plugins communautaires activés à l'installation est `plugins.json` à la racine du dépôt. Pour en ajouter un, y ajouter son identifiant (celui du registre Obsidian).

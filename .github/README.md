# Obsidian Config

Configuration Obsidian portable : réglages, snippets CSS et plugins locaux.

## Prérequis

- Obsidian 1.6.6 ou plus récent
- Thème [AnuPpuccin](https://github.com/AnubisNekhet/AnuPpuccin)

## Installation

1. Cloner le dépôt dans le dossier du vault :
   ```sh
   git clone https://github.com/ahmed-mili/obsidian-config.git MonVault
   ```
   Pour un vault existant, copier le dossier `.obsidian/` à sa racine.
2. Ouvrir le vault dans Obsidian.
3. Réglages > Apparence > Thèmes : installer et activer AnuPpuccin.
4. Réglages > Plugins communautaires : installer chaque plugin listé dans `.obsidian/community-plugins.json`, puis relancer Obsidian.
5. Réglages > Apparence > Snippets CSS : activer les snippets souhaités.

## Mise à jour

```sh
git pull
```

Puis `Ctrl+R` dans Obsidian pour recharger la configuration.

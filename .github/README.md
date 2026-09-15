# Obsidian Config

Configuration Obsidian générique et portable : réglages de l'application, thème, hotkeys, snippets CSS réutilisables et plugins locaux (dashboard à tuiles, fond d'écran de vault, etc.).

Aucune note, aucun document, aucun identifiant. Tout ce qui est propre à un vault en particulier (espaces de travail, page d'accueil, icônes et plugins spécifiques à un contexte) est exclu via `.gitignore`.

## Installation

1. Cloner le dépôt dans un nouveau dossier de vault (ou copier `.obsidian/` dans un vault existant).
2. Installer le thème AnuPpuccin depuis Obsidian.
3. Installer les plugins communautaires listés dans `.obsidian/community-plugins.json`.
4. Activer les snippets souhaités dans Réglages > Apparence.

## Contenu

- `.obsidian/*.json` : réglages de l'app, apparence, hotkeys, plugins actifs.
- `.obsidian/snippets/` : `dashboard-tiles` (tuiles de portails), `callout-glow`, `neo-tags`, `note-centering`, `guides-callouts`, `book-list`, etc.
- `.obsidian/plugins/` : plugins locaux (`dashboard-tiles`, `vault-background`, `collapse-on-check`) et fichiers de réglages des plugins communautaires.

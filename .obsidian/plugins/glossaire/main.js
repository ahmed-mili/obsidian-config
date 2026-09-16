"use strict";

/**
 * Glossaire — explique un terme sans quitter sa phrase.
 *
 * Dans une note, on marque le terme ainsi :
 *
 *     Une <abbr data-def="Fonction courte ecrite sur une seule ligne.">lambda</abbr> sert a...
 *
 * Le plugin pose une petite pastille « ? » en exposant apres le mot. Un clic
 * ouvre une fenetre avec l'explication, et le terme en titre.
 *
 * Pourquoi un clic plutot qu'un survol : une bulle au survol se declenche par
 * accident en lisant, se coupe au bord de l'ecran, et ne laisse pas le temps de
 * lire une explication de plusieurs lignes. Un clic est deliberé.
 *
 * Le contenu de `data-def` est traite comme du MARKDOWN : on peut y mettre du
 * `code`, du **gras**, une liste. Il est rendu par Obsidian lui-meme, donc sans
 * injection de HTML brut.
 */

const { Plugin, Modal, MarkdownRenderer, Component, setIcon } = require("obsidian");

const MARQUEUR = "data-def";
const CLASSE_TRAITE = "glossaire-traite";

class ModalGlossaire extends Modal {
  constructor(app, terme, definition, cheminSource) {
    super(app);
    this.terme = terme;
    this.definition = definition;
    this.cheminSource = cheminSource;
    this.composant = new Component();
  }

  onOpen() {
    this.modalEl.addClass("glossaire-modal");
    this.titleEl.setText(this.terme);

    const corps = this.contentEl.createDiv({ cls: "glossaire-modal-corps" });
    this.composant.load();
    // Le plugin d'execution rend tout bloc de code cliquable pour l'editer en
    // place. Dans une definition, ce clic n'a pas de sens et jette une erreur
    // (il cherche une vue de note qui n'existe pas ici) : on l'intercepte
    // avant qu'il n'atteigne son listener.
    corps.addEventListener(
      "click",
      (e) => {
        if (e.target instanceof HTMLElement && e.target.closest("pre")) {
          e.stopPropagation();
        }
      },
      true
    );

    // Rendu par Obsidian : la definition peut contenir du markdown, et le
    // resultat suit le theme et les snippets du vault.
    MarkdownRenderer.render(
      this.app,
      this.definition,
      corps,
      this.cheminSource || "",
      this.composant
    );
  }

  onClose() {
    this.composant.unload();
    this.contentEl.empty();
  }
}

module.exports = class PluginGlossaire extends Plugin {
  onload() {
    this.registerMarkdownPostProcessor((element, contexte) => {
      this.poserLesPastilles(element, contexte ? contexte.sourcePath : "");
    });
  }

  poserLesPastilles(racine, cheminSource) {
    const termes = racine.querySelectorAll(`abbr[${MARQUEUR}]`);
    termes.forEach((abbr) => {
      // Obsidian peut repasser sur un meme fragment (rendu differe, embed) :
      // sans ce garde-fou, la pastille serait posee plusieurs fois.
      if (abbr.hasClass(CLASSE_TRAITE)) return;
      abbr.addClass(CLASSE_TRAITE);

      const definition = abbr.getAttribute(MARQUEUR) || "";
      if (!definition.trim()) return;

      // Le terme se lit AVANT d'ajouter la pastille : une fois celle-ci en
      // place, textContent renverrait aussi son « ? » et son libelle accessible.
      const terme = (abbr.textContent || "").trim();

      const pastille = abbr.createSpan({ cls: "glossaire-pastille" });
      // Icone Lucide plutot qu'un « ? » typographique : un glyphe de police
      // rapetisse avec le texte et devient illisible en exposant, alors qu'un
      // SVG garde son trait net a toutes les tailles.
      setIcon(pastille, "info");

      // Pas d'aria-label ni de title : Obsidian en ferait une bulle au survol,
      // alors que l'explication doit venir du clic. Le nom accessible passe par
      // un texte hors ecran, lu par les lecteurs d'ecran sans rien afficher.
      const horsEcran = pastille.createSpan({ cls: "glossaire-hors-ecran" });
      horsEcran.setText(`Expliquer le terme ${terme}`);

      pastille.setAttribute("role", "button");
      pastille.setAttribute("tabindex", "0");

      const ouvrir = (evenement) => {
        evenement.preventDefault();
        evenement.stopPropagation();
        new ModalGlossaire(this.app, terme, definition, cheminSource).open();
      };

      pastille.addEventListener("click", ouvrir);
      pastille.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") ouvrir(e);
      });
    });
  }
};

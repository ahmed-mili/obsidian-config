'use strict';

const obsidian = require('obsidian');

const STORAGE_KEY = 'dashboard-module-state';
const STATES = ['', 'en-cours', 'termine'];
const TILE_SELECTOR = '.dashboard .callout[data-callout="portals"] li a';

/** Cle stable d'une tuile : le chemin de la note ciblee, sans alias. */
function tileKey(anchor) {
  const raw = anchor.getAttribute('data-href') || anchor.getAttribute('href') || anchor.textContent;
  return decodeURIComponent(raw).trim();
}

module.exports = class DashboardModuleState extends obsidian.Plugin {
  onload() {
    this.states = this.readStates();

    this.registerDomEvent(document, 'click', (evt) => {
      if (!evt.shiftKey) return;
      const anchor = evt.target instanceof HTMLElement ? evt.target.closest(TILE_SELECTOR) : null;
      if (!anchor) return;
      evt.preventDefault();
      evt.stopPropagation();
      this.cycle(anchor);
    }, true);

    this.registerMarkdownPostProcessor((el) => this.applyAll(el));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.applyAll(document)));
    this.app.workspace.onLayoutReady(() => this.applyAll(document));
  }

  readStates() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  writeStates() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.states));
  }

  cycle(anchor) {
    const key = tileKey(anchor);
    const next = STATES[(STATES.indexOf(this.states[key] || '') + 1) % STATES.length];
    if (next) this.states[key] = next;
    else delete this.states[key];
    this.writeStates();
    this.applyAll(document);
  }

  applyAll(root) {
    const scope = root instanceof HTMLElement || root instanceof Document ? root : document;
    scope.querySelectorAll(TILE_SELECTOR).forEach((anchor) => {
      const state = this.states[tileKey(anchor)];
      if (state) anchor.setAttribute('data-module-state', state);
      else anchor.removeAttribute('data-module-state');
    });
  }
};

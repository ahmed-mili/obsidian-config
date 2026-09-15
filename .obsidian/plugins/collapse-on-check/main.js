'use strict';

const { Plugin, MarkdownView } = require('obsidian');

/**
 * Collapse on Check — v3.4
 *
 * Au clic sur un <input type="checkbox"> dans une ligne de tableau contenant
 * un wikilink [[#Heading]], plie/déplie la section pointée via le fold natif
 * d'Obsidian (applyFoldInfo). L'état coché est persisté DIRECTEMENT dans la
 * note en swap `<input type="checkbox">` ↔ `<input type="checkbox" checked>` :
 * portable, survit à la désinstallation du plugin et au sync.
 *
 * À l'ouverture d'une note, on relit les checkboxes déjà cochées (rendues
 * via l'attribut HTML `checked`) et on applique le fold correspondant.
 */

class CollapseOnCheckPlugin extends Plugin {
  async onload() {
    console.log('[CollapseOnCheck] v3.4 loaded');
    this.registerDomEvent(document, 'change', this.handleChange.bind(this));
    this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleRestore()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleRestore()));
    this.scheduleRestore();
  }

  onunload() {
    console.log('[CollapseOnCheck] unloaded');
  }

  scheduleRestore() {
    window.setTimeout(() => this.restoreFolds(), 80);
  }

  async handleChange(evt) {
    const target = evt.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'checkbox') return;

    const tr = target.closest('tr');
    if (!tr) return;

    const link = tr.querySelector('a.internal-link[href*="#"], a[data-href*="#"]');
    if (!link) return;

    const headingText = this.extractHeadingText(link);
    if (!headingText) return;

    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    this.toggleFold(headingText, target.checked);
    await this.persistCheckbox(file, headingText, target.checked);
  }

  restoreFolds() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const rows = view.containerEl.querySelectorAll('tr');
    rows.forEach(tr => {
      const checkbox = tr.querySelector('input[type="checkbox"]');
      if (!checkbox || !checkbox.checked) return;
      const link = tr.querySelector('a.internal-link[href*="#"], a[data-href*="#"]');
      if (!link) return;
      const headingText = this.extractHeadingText(link);
      if (!headingText) return;
      this.toggleFold(headingText, true);
    });
  }

  extractHeadingText(link) {
    const href = link.getAttribute('href') || link.getAttribute('data-href') || '';
    const hashIdx = href.indexOf('#');
    if (hashIdx === -1) return '';
    return decodeURIComponent(href.substring(hashIdx + 1)).split('|')[0].trim();
  }

  async persistCheckbox(file, headingText, checked) {
    const escaped = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wikilinkRe = new RegExp(`\\[\\[#${escaped}(\\\\?\\||\\]\\])`);
    console.log('[CollapseOnCheck][DEBUG] persistCheckbox', { headingText, checked, reSrc: wikilinkRe.source });

    const mutate = (line, idx) => {
      const isInput = /<input[^>]*type=["']checkbox["']/i.test(line);
      if (!isInput) return null;
      const hasWikilink = wikilinkRe.test(line);
      console.log('[CollapseOnCheck][DEBUG] candidate line', idx, { hasWikilink, line: line.substring(0, 250) });
      if (!hasWikilink) return null;
      const hasChecked = /<input[^>]*\schecked\b/i.test(line);
      if (checked && !hasChecked) {
        return line.replace(/<input(\s+type=["']checkbox["'])/i, '<input$1 checked');
      }
      if (!checked && hasChecked) {
        return line.replace(/\schecked(=["'][^"']*["'])?/i, '');
      }
      return null;
    };

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view && view.editor;
    console.log('[CollapseOnCheck][DEBUG] editor available:', !!editor);
    if (editor) {
      const total = editor.lineCount();
      for (let i = 0; i < total; i++) {
        const line = editor.getLine(i);
        const next = mutate(line, i);
        if (next !== null) {
          console.log('[CollapseOnCheck][DEBUG] replaceRange line', i, { before: line.substring(0, 200), after: next.substring(0, 200) });
          editor.replaceRange(next, { line: i, ch: 0 }, { line: i, ch: line.length });
          return;
        }
      }
      console.warn(`[CollapseOnCheck] checkbox+wikilink line not found for "${headingText}"`);
      return;
    }

    await this.app.vault.process(file, (content) => {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const next = mutate(lines[i], i);
        if (next !== null) { lines[i] = next; break; }
      }
      return lines.join('\n');
    });
  }

  toggleFold(headingText, fold) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const editor = view.editor;
    if (!editor) return;

    const totalLines = editor.lineCount();
    const want = this.normalize(headingText);

    let headingLine = -1;
    let headingLevel = 0;
    for (let i = 0; i < totalLines; i++) {
      const line = editor.getLine(i);
      const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (m && this.normalize(m[2]) === want) {
        headingLine = i;
        headingLevel = m[1].length;
        break;
      }
    }
    if (headingLine === -1) {
      console.warn(`[CollapseOnCheck] heading not found in source: "${headingText}"`);
      return;
    }

    let endLine = totalLines - 1;
    for (let i = headingLine + 1; i < totalLines; i++) {
      const line = editor.getLine(i);
      const m = line.match(/^(#{1,6})\s+/);
      if (m && m[1].length <= headingLevel) {
        endLine = i - 1;
        break;
      }
    }

    const mode = view.currentMode;
    const current = (typeof mode.getFoldInfo === 'function' && mode.getFoldInfo()) || { folds: [], lines: totalLines };
    let folds = (current.folds || []).slice();

    if (fold) {
      if (!folds.some(f => f.from === headingLine)) {
        folds.push({ from: headingLine, to: endLine });
      }
    } else {
      folds = folds.filter(f => f.from !== headingLine);
    }

    mode.applyFoldInfo({ folds, lines: totalLines });
  }

  normalize(text) {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }
}

module.exports = CollapseOnCheckPlugin;

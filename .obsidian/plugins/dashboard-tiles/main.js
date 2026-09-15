"use strict";

const { Plugin, Modal, FuzzySuggestModal, Notice, Setting } = require("obsidian");

const PORTALS_HEADER_RE = /^>\s*\[!portals\]\s?(.*)$/;
const ITEM_LINE_RE = /^>\s*-\s+(.*)$/;
const WIKILINK_RE = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/;
const MDLINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

function basenameNoExt(path) {
  const name = path.split("/").pop() || path;
  return name.replace(/\.md$/i, "");
}

function labelForRaw(raw) {
  const wiki = raw.match(WIKILINK_RE);
  if (wiki) return wiki[2] ? wiki[2].trim() : basenameNoExt(wiki[1].trim());
  const md = raw.match(MDLINK_RE);
  if (md) return md[1].trim();
  return raw.trim();
}

/**
 * Parse toutes les callouts [!portals] contigues a partir de la premiere
 * rencontree jusqu'a la fin du fichier (structure constante des Dashboard.md
 * du vault : acces rapide, puis uniquement des callouts portals separes par
 * des lignes vides).
 */
function parsePortals(lines) {
  let firstHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (PORTALS_HEADER_RE.test(lines[i])) { firstHeaderIdx = i; break; }
  }
  if (firstHeaderIdx === -1) return null;

  const callouts = [];
  let current = null;
  for (let i = firstHeaderIdx; i < lines.length; i++) {
    const line = lines[i];
    const header = line.match(PORTALS_HEADER_RE);
    const item = line.match(ITEM_LINE_RE);
    if (header) {
      current = { title: header[1].trim(), items: [] };
      callouts.push(current);
    } else if (item && current) {
      current.items.push({ raw: item[1].trim(), label: labelForRaw(item[1].trim()) });
    } else if (line.trim() === "") {
      // separateur entre callouts, ignore
    } else {
      // ligne inattendue dans la zone portals : on arrete le parsing ici
      // pour ne jamais ecraser du contenu qu'on n'a pas compris.
      break;
    }
  }
  return { startLine: firstHeaderIdx, endLine: lines.length - 1, callouts };
}

function renderPortals(callouts) {
  const blocks = callouts.map((c) => {
    const header = `> [!portals] ${c.title}`;
    const items = c.items.map((it) => `> - ${it.raw}`);
    return [header, ...items].join("\n");
  });
  return blocks.join("\n\n");
}

class AddTileModal extends FuzzySuggestModal {
  constructor(app, scopeFolder, exclude, onPick) {
    super(app);
    this.scopeFolder = scopeFolder;
    this.exclude = exclude;
    this.onPick = onPick;
    this.setPlaceholder("Choisir une note a ajouter comme tuile…");
  }
  getItems() {
    return this.app.vault.getMarkdownFiles().filter((f) => {
      if (this.scopeFolder && !f.path.startsWith(this.scopeFolder + "/")) return false;
      if (this.exclude.has(f.path)) return false;
      if (f.basename === "Dashboard") return false;
      return true;
    });
  }
  getItemText(file) { return file.basename; }
  onChooseItem(file) {
    const path = file.path.replace(/\.md$/i, "");
    const raw = `[[${path}|${file.basename}]]`;
    this.onPick({ raw, label: file.basename });
  }
}

class DashboardTilesModal extends Modal {
  constructor(app) {
    super(app);
    this.file = null;
    this.parsed = null;
  }

  async open2() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("Ouvre un Dashboard avant de lancer Dashboard Tiles.");
      return;
    }
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const parsed = parsePortals(lines);
    if (!parsed) {
      new Notice("Aucun callout [!portals] trouve dans cette note.");
      return;
    }
    this.file = file;
    this.lines = lines;
    this.parsed = parsed;
    this.open();
  }

  onOpen() {
    this.titleEl.setText(`Dashboard Tiles — ${this.file.basename}`);
    this.modalEl.addClass("dashboard-tiles-modal");
    this.renderBody();
  }

  onClose() {
    this.contentEl.empty();
  }

  renderBody() {
    const { contentEl } = this;
    contentEl.empty();

    const scopeFolder = this.file.parent ? this.file.parent.path : "";
    const usedPaths = new Set();
    for (const c of this.parsed.callouts) {
      for (const it of c.items) {
        const wiki = it.raw.match(WIKILINK_RE);
        if (wiki) usedPaths.add(wiki[1].trim() + ".md");
      }
    }

    for (const callout of this.parsed.callouts) {
      const section = contentEl.createDiv({ cls: "dt-section" });
      section.createEl("h3", { text: callout.title, cls: "dt-section-title" });
      const list = section.createEl("ul", { cls: "dt-list" });
      list.dataset.calloutTitle = callout.title;

      callout.items.forEach((item, idx) => {
        const li = list.createEl("li", { cls: "dt-item" });
        li.draggable = true;
        li.dataset.idx = String(idx);
        li.createSpan({ cls: "dt-item-handle", text: "⠿" });
        li.createSpan({ cls: "dt-item-label", text: item.label });
        const removeBtn = li.createEl("button", { cls: "dt-item-remove", text: "✕" });
        removeBtn.addEventListener("click", async () => {
          callout.items.splice(idx, 1);
          await this.persist();
          this.renderBody();
        });

        li.addEventListener("dragstart", (ev) => {
          ev.dataTransfer.setData("text/plain", JSON.stringify({
            fromCallout: callout.title,
            fromIdx: idx,
          }));
          li.addClass("dt-dragging");
        });
        li.addEventListener("dragend", () => li.removeClass("dt-dragging"));
      });

      list.addEventListener("dragover", (ev) => ev.preventDefault());
      list.addEventListener("drop", async (ev) => {
        ev.preventDefault();
        let data;
        try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch { return; }
        const fromCallout = this.parsed.callouts.find((c) => c.title === data.fromCallout);
        if (!fromCallout) return;
        const [moved] = fromCallout.items.splice(data.fromIdx, 1);
        if (!moved) return;

        // Determine la position de depot : element survole -> son index, sinon fin de liste.
        const target = ev.target.closest && ev.target.closest(".dt-item");
        let insertAt = callout.items.length;
        if (target && target.parentElement === list) {
          insertAt = Number(target.dataset.idx);
          if (fromCallout === callout && data.fromIdx < insertAt) insertAt -= 1;
        }
        callout.items.splice(insertAt, 0, moved);
        await this.persist();
        this.renderBody();
      });

      const addBtn = section.createEl("button", { cls: "dt-add-btn", text: "+ Ajouter une tuile" });
      addBtn.addEventListener("click", () => {
        const modal = new AddTileModal(this.app, scopeFolder, usedPaths, async (tile) => {
          callout.items.push(tile);
          await this.persist();
          this.renderBody();
        });
        modal.open();
      });
    }
  }

  async persist() {
    const before = this.lines.slice(0, this.parsed.startLine);
    const after = this.lines.slice(this.parsed.endLine + 1);
    const rebuilt = renderPortals(this.parsed.callouts);
    const newContent = [...before, rebuilt, ...after].join("\n");

    // Ecrit via l'API Vault (process = read-modify-write atomique sur le
    // contenu courant du fichier) : c'est le meme canal qu'une frappe
    // manuelle dans l'editeur, donc capte correctement par Relay pour les
    // dossiers multiplayer, contrairement a une ecriture disque externe.
    await this.app.vault.process(this.file, () => newContent);

    // Resynchronise notre modele de lignes sur le nouveau contenu pour que
    // les prochains persist() recalculent des indices corrects.
    this.lines = newContent.split("\n");
    const reparsed = parsePortals(this.lines);
    if (reparsed) this.parsed = reparsed;
  }
}

module.exports = class DashboardTilesPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon("layout-grid", "Dashboard Tiles", async () => {
      const modal = new DashboardTilesModal(this.app);
      await modal.open2();
    });
    this.addCommand({
      id: "open-dashboard-tiles",
      name: "Editer les tuiles du Dashboard actif",
      callback: async () => {
        const modal = new DashboardTilesModal(this.app);
        await modal.open2();
      },
    });
  }
};

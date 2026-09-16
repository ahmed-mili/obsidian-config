var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/plugin.js
var require_plugin = __commonJS({
  "src/plugin.js"(exports2, module2) {
    "use strict";
    var obsidian = require("obsidian");
    var { execFile } = require("child_process");
    var fs = require("fs");
    var os = require("os");
    var path = require("path");
    var PLUGIN_ID = "mdtopdf";
    var VIEW_TYPE = "mdtopdf-preview";
    var DEFAULT_SETTINGS = {
      pythonPath: "C:\\Users\\Ahmed\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
      scriptPath: "C:\\Users\\Ahmed\\.claude\\plugins\\ahmed-plugins-local\\plugins\\obsidian\\skills\\pdf\\scripts\\md_to_pdf.py",
      theme: "dark",
      // "dark" (défaut du moteur) | "light" (--light)
      exportFileName: "{stem}.pdf",
      debounceMs: 800,
      // délai après sauvegarde (filet)
      pdfLiveDebounceMs: 600,
      // délai après frappe avant re-rendu
      followActiveFile: true
    };
    function log(...a) {
      console.log(`[${PLUGIN_ID}]`, ...a);
    }
    function logErr(...a) {
      console.error(`[${PLUGIN_ID}]`, ...a);
    }
    function execFileP(file, args, opts) {
      return new Promise((resolve, reject) => {
        execFile(file, args, opts, (err, stdout, stderr) => {
          if (err) {
            err.stderr = stderr;
            err.stdout = stdout;
            reject(err);
          } else resolve({ stdout, stderr });
        });
      });
    }
    function vaultBasePath(app) {
      const adapter = app.vault.adapter;
      if (adapter instanceof obsidian.FileSystemAdapter) return adapter.getBasePath();
      throw new Error("Adaptateur de vault non-fichier \u2014 plugin desktop only.");
    }
    var MdToPdfView = class extends obsidian.ItemView {
      constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.file = null;
        this.rendering = false;
        this.pending = false;
        this.lastRenderedSig = null;
      }
      getViewType() {
        return VIEW_TYPE;
      }
      getDisplayText() {
        return this.file ? `Aper\xE7u \u2014 ${this.file.basename}` : "Aper\xE7u PDF";
      }
      getIcon() {
        return "file-text";
      }
      async onOpen() {
        const root = this.contentEl;
        root.empty();
        root.addClass("mdtopdf-preview");
        const bar = root.createDiv({ cls: "mdtopdf-toolbar" });
        this.titleEl = bar.createSpan({ cls: "mdtopdf-title", text: "Aper\xE7u PDF" });
        bar.createSpan({ cls: "mdtopdf-spacer" });
        this.statusEl = bar.createSpan({ cls: "mdtopdf-status", text: "" });
        this.themeBtn = bar.createEl("button", { cls: "mdtopdf-btn" });
        this.themeBtn.onclick = () => this.toggleTheme();
        this.refreshBtn = bar.createEl("button", { cls: "mdtopdf-btn", text: "Rafra\xEEchir" });
        this.refreshBtn.onclick = () => this.render(true);
        this.exportBtn = bar.createEl("button", { cls: "mdtopdf-btn mod-cta", text: "Exporter en PDF" });
        this.exportBtn.onclick = () => this.plugin.exportFile(this.file);
        this.bodyEl = root.createDiv({ cls: "mdtopdf-body" });
        this.progressEl = this.bodyEl.createDiv({ cls: "mdtopdf-progress" });
        this.pagesEl = this.bodyEl.createDiv({ cls: "mdtopdf-pages" });
        this.placeholderEl = this.bodyEl.createDiv({ cls: "mdtopdf-placeholder" });
        this.placeholderEl.setText("Ouvre une note Markdown : son rendu s'affichera ici.");
        this.updateThemeButton();
        const active = this.plugin.getActiveMarkdownFile();
        if (active) this.setFile(active);
      }
      async onClose() {
      }
      updateThemeButton() {
        if (!this.themeBtn) return;
        const dark = this.plugin.settings.theme !== "light";
        this.themeBtn.setText(dark ? "Th\xE8me : Sombre" : "Th\xE8me : Clair");
        this.themeBtn.title = dark ? "PDF sombre plein cadre. Cliquer pour le th\xE8me clair (impression papier)." : "PDF clair (impression papier). Cliquer pour le th\xE8me sombre.";
      }
      setStatus(msg) {
        if (this.statusEl) this.statusEl.setText(msg || "");
      }
      setFile(file) {
        if (!file) return;
        const changed = !this.file || this.file.path !== file.path;
        this.file = file;
        if (this.titleEl) this.titleEl.setText(`Aper\xE7u \u2014 ${file.basename}`);
        if (changed) {
          this.lastRenderedSig = null;
          this.render(true);
        }
      }
      async toggleTheme() {
        this.plugin.settings.theme = this.plugin.settings.theme === "light" ? "dark" : "light";
        await this.plugin.saveSettings();
        this.plugin.forEachPreview((v) => v.updateThemeButton());
        this.render(true);
      }
      async render(force, text) {
        if (!this.file) return;
        const sig = text != null ? text : this.plugin.findEditorText(this.file);
        if (!force && sig != null && sig === this.lastRenderedSig) {
          if (!this.rendering && !this.pending) {
            this.bodyEl?.removeClass("is-rendering");
            this.statusEl?.removeClass("is-rendering");
          }
          return;
        }
        if (this.rendering) {
          this.pending = true;
          this.pendingText = text;
          this.pendingForce = force;
          return;
        }
        this.rendering = true;
        this.setStatus("Rendu en cours\u2026");
        this.statusEl?.addClass("is-rendering");
        this.bodyEl?.addClass("is-rendering");
        this.refreshBtn?.setAttr("disabled", "true");
        try {
          const buf = await this.plugin.renderToPdfBuffer(this.file, text);
          await this.displayPdf(buf);
          this.lastRenderedSig = sig;
          this.setStatus("");
          this.placeholderEl?.hide();
        } catch (e) {
          const msg = String(e && (e.stderr || e.message) || e);
          logErr("rendu:", msg);
          this.lastRenderedSig = null;
          this.setStatus("Erreur de rendu");
          this.placeholderEl?.show();
          this.placeholderEl?.setText("Erreur de rendu :\n" + msg.trim().split("\n").slice(-6).join("\n"));
        } finally {
          this.rendering = false;
          this.refreshBtn?.removeAttribute("disabled");
          if (this.pending) {
            this.pending = false;
            const t = this.pendingText;
            const f = this.pendingForce;
            this.pendingText = null;
            this.render(f, t);
          } else {
            this.bodyEl?.removeClass("is-rendering");
            this.statusEl?.removeClass("is-rendering");
          }
        }
      }
      // Rend le PDF via PDF.js dans le conteneur scrollable, en préservant la
      // position de scroll (proportionnelle).
      async displayPdf(buffer) {
        const pdfjs = await this.plugin.getPdfjs();
        this.pagesEl.style.display = "block";
        const prevTop = this.pagesEl.scrollTop;
        const prevH = this.pagesEl.scrollHeight || 1;
        const data = new Uint8Array(buffer);
        const doc = await pdfjs.getDocument({ data }).promise;
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.max(100, this.pagesEl.clientWidth - 24);
        const frag = document.createDocumentFragment();
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = targetW / base.width;
          const vp = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.className = "mdtopdf-page";
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = vp.width / dpr + "px";
          canvas.style.height = vp.height / dpr + "px";
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          frag.appendChild(canvas);
        }
        this.pagesEl.empty();
        this.pagesEl.appendChild(frag);
        const newH = this.pagesEl.scrollHeight || 1;
        this.pagesEl.scrollTop = prevH > 1 ? Math.round(prevTop * (newH / prevH)) : prevTop;
      }
    };
    var MdToPdfSettingTab = class extends obsidian.PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Markdown vers PDF (aper\xE7u)" });
        new obsidian.Setting(containerEl).setName("Th\xE8me").setDesc("Sombre : PDF plein cadre (d\xE9faut du moteur). Clair : impression papier (--light).").addDropdown((d) => d.addOption("dark", "Sombre").addOption("light", "Clair").setValue(this.plugin.settings.theme).onChange(async (v) => {
          this.plugin.settings.theme = v;
          await this.plugin.saveSettings();
          this.plugin.forEachPreview((view) => {
            view.updateThemeButton();
            view.render(true);
          });
        }));
        new obsidian.Setting(containerEl).setName("Chemin de Python").setDesc("Interpr\xE9teur avec markdown, pymupdf et playwright (Chromium install\xE9).").addText((t) => t.setValue(this.plugin.settings.pythonPath).onChange(async (v) => {
          this.plugin.settings.pythonPath = v.trim();
          await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl).setName("Chemin du moteur de rendu").setDesc("Script md_to_pdf.py du skill obsidian:pdf.").addText((t) => t.setValue(this.plugin.settings.scriptPath).onChange(async (v) => {
          this.plugin.settings.scriptPath = v.trim();
          await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl).setName("Nom du fichier export\xE9").setDesc("{stem} = nom de la note. Le PDF est \xE9crit \xE0 c\xF4t\xE9 de la note.").addText((t) => t.setValue(this.plugin.settings.exportFileName).onChange(async (v) => {
          this.plugin.settings.exportFileName = v.trim() || "{stem}.pdf";
          await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl).setName("D\xE9lai frappe \u2192 rendu (ms)").setDesc("Temps d'attente apr\xE8s une frappe avant de relancer le moteur.").addText((t) => t.setValue(String(this.plugin.settings.pdfLiveDebounceMs)).onChange(async (v) => {
          const n = parseInt(v, 10);
          this.plugin.settings.pdfLiveDebounceMs = isNaN(n) ? 600 : n;
          await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl).setName("D\xE9lai sauvegarde \u2192 rendu (ms)").addText((t) => t.setValue(String(this.plugin.settings.debounceMs)).onChange(async (v) => {
          const n = parseInt(v, 10);
          this.plugin.settings.debounceMs = isNaN(n) ? 800 : n;
          await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl).setName("Suivre la note active").addToggle((tg) => tg.setValue(this.plugin.settings.followActiveFile).onChange(async (v) => {
          this.plugin.settings.followActiveFile = v;
          await this.plugin.saveSettings();
        }));
      }
    };
    var MdToPdfPlugin = class extends obsidian.Plugin {
      async onload() {
        await this.loadSettings();
        this.addSettingTab(new MdToPdfSettingTab(this.app, this));
        this.registerView(VIEW_TYPE, (leaf) => new MdToPdfView(leaf, this));
        this.addRibbonIcon("file-text", "Aper\xE7u PDF (Markdown vers PDF)", () => this.activateView());
        this.addCommand({
          id: "open-preview",
          name: "Ouvrir l'aper\xE7u PDF (vue fractionn\xE9e)",
          callback: () => this.activateView()
        });
        this.addCommand({
          id: "export-pdf",
          name: "Exporter la note en PDF",
          callback: () => this.exportFile(this.getTargetFile())
        });
        this.registerEvent(this.app.workspace.on("file-open", (file) => {
          if (this.settings.followActiveFile && file && file.extension === "md") {
            this.forEachPreview((v) => v.setFile(file));
          }
        }));
        this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
          const file = info && info.file;
          if (!file) return;
          this.forEachPreview((v) => {
            if (!v.file || v.file.path !== file.path) return;
            clearTimeout(v._pdfDeb);
            v._pdfDeb = setTimeout(() => v.render(false, editor.getValue()), this.settings.pdfLiveDebounceMs);
          });
        }));
        this.registerEvent(this.app.vault.on("modify", (file) => {
          this.forEachPreview((v) => {
            if (v.file && file && v.file.path === file.path) this.scheduleRender(v);
          });
        }));
        log("charg\xE9.");
      }
      onunload() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => l.detach());
      }
      forEachPreview(fn) {
        this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => {
          if (l.view instanceof MdToPdfView) fn(l.view);
        });
      }
      scheduleRender(view) {
        clearTimeout(view._debounce);
        view._debounce = setTimeout(() => view.render(false), this.settings.debounceMs);
      }
      // Contenu non sauvegardé d'une note ouverte dans un éditeur (sinon null).
      findEditorText(file) {
        let text = null;
        this.app.workspace.getLeavesOfType("markdown").forEach((l) => {
          const v = l.view;
          if (text == null && v && v.file && v.file.path === file.path && v.editor) text = v.editor.getValue();
        });
        return text;
      }
      getActiveMarkdownFile() {
        const f = this.app.workspace.getActiveFile();
        return f && f.extension === "md" ? f : null;
      }
      getTargetFile() {
        const active = this.getActiveMarkdownFile();
        if (active) return active;
        let bound = null;
        this.forEachPreview((v) => {
          if (!bound && v.file) bound = v.file;
        });
        return bound;
      }
      async activateView() {
        const { workspace } = this.app;
        const active = this.getActiveMarkdownFile();
        let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (!leaf) {
          leaf = workspace.getLeaf("split", "vertical");
          await leaf.setViewState({ type: VIEW_TYPE, active: true });
        }
        workspace.revealLeaf(leaf);
        if (active && leaf.view instanceof MdToPdfView) leaf.view.setFile(active);
      }
      engineArgs(src, out) {
        const args = [this.settings.scriptPath, src, "-o", out];
        if (this.settings.theme === "light") args.push("--light");
        return args;
      }
      // Rend le PDF en Buffer. Si `text` est fourni (édition non sauvegardée), on
      // écrit un .md temporaire DANS le dossier de la note (le moteur résout les
      // embeds relativement au .md et remonte jusqu'à la racine du vault pour le
      // snippet callouts.css) ; sinon on rend le fichier sur disque.
      async renderToPdfBuffer(file, text) {
        const base = vaultBasePath(this.app);
        const abs = path.join(base, file.path);
        const outTmp = path.join(os.tmpdir(), `mdtopdf-${process.pid}-${Date.now()}.pdf`);
        let srcPath = abs;
        let srcTmp = null;
        if (typeof text === "string") {
          srcTmp = path.join(path.dirname(abs), `.mdtopdf-src-${process.pid}.md`);
          await fs.promises.writeFile(srcTmp, text, "utf8");
          srcPath = srcTmp;
        }
        try {
          await execFileP(this.settings.pythonPath, this.engineArgs(srcPath, outTmp), {
            timeout: 12e4,
            windowsHide: true,
            maxBuffer: 1024 * 1024 * 16
          });
          return await fs.promises.readFile(outTmp);
        } finally {
          fs.promises.unlink(outTmp).catch(() => {
          });
          if (srcTmp) fs.promises.unlink(srcTmp).catch(() => {
          });
        }
      }
      // PDF.js fourni par Obsidian (loadPdfJs). Mis en cache après le 1er appel.
      async getPdfjs() {
        if (this._pdfjs) return this._pdfjs;
        this._pdfjs = await obsidian.loadPdfJs();
        return this._pdfjs;
      }
      async exportFile(file) {
        if (!file) {
          new obsidian.Notice("Aucune note Markdown active.");
          return;
        }
        const base = vaultBasePath(this.app);
        const abs = path.join(base, file.path);
        const outName = (this.settings.exportFileName || "{stem}.pdf").replace("{stem}", file.basename);
        const outPath = path.join(path.dirname(abs), outName);
        const notice = new obsidian.Notice("Export PDF en cours\u2026", 0);
        try {
          await execFileP(this.settings.pythonPath, this.engineArgs(abs, outPath), {
            timeout: 12e4,
            windowsHide: true,
            maxBuffer: 1024 * 1024 * 16
          });
          notice.hide();
          new obsidian.Notice("PDF export\xE9 : " + outName);
        } catch (e) {
          notice.hide();
          const msg = String(e.stderr || e.message || e);
          logErr("export:", msg);
          if (/EBUSY|locked|being used|verrou/i.test(msg)) {
            new obsidian.Notice("\xC9chec : le PDF est ouvert ailleurs (ferme-le puis r\xE9essaie).", 8e3);
          } else {
            new obsidian.Notice("\xC9chec de l'export (voir la console).", 8e3);
          }
        }
      }
      async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
      }
      async saveSettings() {
        await this.saveData(this.settings);
      }
    };
    module2.exports = MdToPdfPlugin;
  }
});

// src/main.js
module.exports = require_plugin();

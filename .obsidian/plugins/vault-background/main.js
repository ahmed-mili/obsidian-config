"use strict";

const { Plugin, PluginSettingTab, Setting, Notice, setIcon } = require("obsidian");

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif"];
const STYLE_ID = "vault-background-style";
const openSelectMenus = new Set();

const DEFAULT_SETTINGS = {
	imagePath: "",
	folder: "Fichiers/Fonds",
};

function nextImagePath(imagePaths, currentPath) {
	if (imagePaths.length === 0) return "";
	const currentIndex = imagePaths.indexOf(currentPath);
	return imagePaths[(currentIndex + 1) % imagePaths.length];
}

function closeAllSelectMenus() {
	for (const close of Array.from(openSelectMenus)) close();
}

function createBackgroundSelect(parent, options) {
	let value = options.value;
	let menuEl = null;
	const trigger = parent.createEl("button", { cls: "vb-select" });
	trigger.type = "button";
	trigger.setAttribute("aria-haspopup", "listbox");
	trigger.setAttribute("aria-expanded", "false");
	const hostDocument = trigger.ownerDocument;
	const hostWindow = hostDocument.defaultView;
	const labelEl = trigger.createSpan({ cls: "vb-select-label" });
	const chevronEl = trigger.createSpan({ cls: "vb-select-chevron" });
	setIcon(chevronEl, "chevron-down");

	const currentOption = () => options.items.find((item) => item.value === value);
	const refreshLabel = () => {
		const current = currentOption();
		labelEl.setText(current ? current.label : "Aucun fond");
		labelEl.classList.toggle("is-empty", !current || !current.value);
	};

	function closeMenu() {
		if (!menuEl) return;
		menuEl.remove();
		menuEl = null;
		trigger.setAttribute("aria-expanded", "false");
		openSelectMenus.delete(closeMenu);
		hostDocument.removeEventListener("mousedown", onDocumentMouseDown, true);
		hostDocument.removeEventListener("keydown", onDocumentKeyDown, true);
		hostWindow.removeEventListener("scroll", onWindowScroll, true);
		hostWindow.removeEventListener("resize", closeMenu);
	}

	function onDocumentMouseDown(event) {
		if (trigger.contains(event.target) || menuEl?.contains(event.target)) return;
		closeMenu();
	}

	function onDocumentKeyDown(event) {
		if (event.key === "Escape") closeMenu();
	}

	function onWindowScroll(event) {
		if (menuEl?.contains(event.target)) return;
		closeMenu();
	}

	function openMenu() {
		closeAllSelectMenus();
		const rect = trigger.getBoundingClientRect();
		menuEl = hostDocument.body.createDiv({ cls: "vb-select-menu" });
		menuEl.setAttribute("role", "listbox");
		menuEl.style.top = `${rect.bottom + 4}px`;
		menuEl.style.left = `${rect.left}px`;
		menuEl.style.minWidth = `${rect.width}px`;
		menuEl.style.maxHeight = `${Math.max(Math.min(hostWindow.innerHeight - rect.bottom - 16, 320), 140)}px`;

		for (const item of options.items) {
			const optionEl = menuEl.createEl("button", {
				cls: `vb-select-option${item.value === value ? " is-active" : ""}`,
			});
			optionEl.type = "button";
			optionEl.setAttribute("role", "option");
			optionEl.setAttribute("aria-selected", item.value === value ? "true" : "false");
			const checkEl = optionEl.createSpan({ cls: "vb-select-check" });
			if (item.value === value) setIcon(checkEl, "check");
			const textEl = optionEl.createSpan({ cls: "vb-select-option-text" });
			textEl.createSpan({ cls: "vb-select-option-label", text: item.label });
			if (item.hint) textEl.createSpan({ cls: "vb-select-option-hint", text: item.hint });
			optionEl.addEventListener("click", async () => {
				const changed = item.value !== value;
				value = item.value;
				refreshLabel();
				closeMenu();
				if (changed) await options.onChange(item.value);
			});
		}

		const menuRect = menuEl.getBoundingClientRect();
		if (menuRect.right > hostWindow.innerWidth - 8) {
			menuEl.style.left = `${Math.max(8, hostWindow.innerWidth - 8 - menuRect.width)}px`;
		}

		trigger.setAttribute("aria-expanded", "true");
		openSelectMenus.add(closeMenu);
		hostDocument.addEventListener("mousedown", onDocumentMouseDown, true);
		hostDocument.addEventListener("keydown", onDocumentKeyDown, true);
		hostWindow.addEventListener("scroll", onWindowScroll, true);
		hostWindow.addEventListener("resize", closeMenu);
	}

	trigger.addEventListener("click", () => (menuEl ? closeMenu() : openMenu()));
	refreshLabel();
	return trigger;
}

class VaultBackgroundPlugin extends Plugin {
	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		this.addSettingTab(new VaultBackgroundSettingTab(this.app, this));
		this.addCommand({
			id: "next-background",
			name: "Fond d’écran suivant",
			hotkeys: [{ modifiers: ["Ctrl", "Alt"], key: "b" }],
			callback: () => this.selectNextBackground(),
		});

		// L'URL app:// dépend d'un préfixe régénéré à chaque lancement d'Obsidian,
		// et son suffixe ?mtime change quand le fichier est réécrit : on la
		// recalcule au démarrage et à chaque modification de l'image ciblée.
		this.app.workspace.onLayoutReady(() => this.applyBackground());

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file.path === this.settings.imagePath) this.applyBackground();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (oldPath !== this.settings.imagePath) return;
				this.settings.imagePath = file.path;
				this.saveSettings();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file.path === this.settings.imagePath) this.applyBackground();
			}),
		);
	}

	onunload() {
		closeAllSelectMenus();
		this.clearBackground();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyBackground();
	}

	/**
	 * Liste les images candidates, triées par chemin. Restreint au dossier
	 * configuré s'il est renseigné — sans lui, un vault avec des centaines
	 * d'images rendrait la liste déroulante inutilisable.
	 */
	listImages() {
		const prefix = this.settings.folder.replace(/^\/+|\/+$/g, "");
		return this.app.vault
			.getFiles()
			.filter((file) => IMAGE_EXTENSIONS.includes(file.extension.toLowerCase()))
			.filter((file) => !prefix || file.path.startsWith(prefix + "/"))
			.sort((a, b) => a.path.localeCompare(b.path, "fr"));
	}

	async selectNextBackground() {
		const imagePaths = this.listImages().map((file) => file.path);
		if (imagePaths.length === 0) {
			new Notice("Vault Background : aucun fond trouvé dans le dossier configuré.");
			return;
		}

		this.settings.imagePath = nextImagePath(imagePaths, this.settings.imagePath);
		await this.saveSettings();
	}

	clearBackground() {
		document.getElementById(STYLE_ID)?.remove();
		document.body.style.removeProperty("--anp-background-image");
		document.body.style.removeProperty("--vault-background-image");
	}

	applyBackground() {
		this.clearBackground();

		const path = this.settings.imagePath;
		if (!path) return;

		// Garde-fou demandé : le plugin ne fait rien si l'image n'est pas dans le vault.
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || file.children) {
			new Notice(`Vault Background : image introuvable dans le vault (${path})`);
			return;
		}

		const url = this.app.vault.adapter.getResourcePath(path);

		// Variables posées EN INLINE sur body : Style Settings écrit ses valeurs
		// dans une règle `body.css-settings-manager` (spécificité 0,1,1) qu'une
		// règle `body` d'une feuille de style perdrait. Le style inline gagne.
		// --anp-background-image est la variable consommée par AnuPpuccin ;
		// --vault-background-image sert de relais pour tout autre thème.
		document.body.style.setProperty("--anp-background-image", `url("${url}")`);
		document.body.style.setProperty("--vault-background-image", `url("${url}")`);

		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = [
			"body:not(.anp-background-image-toggle) .app-container {",
			"  background-image: var(--vault-background-image);",
			"  background-size: cover;",
			"  background-position: center;",
			"}",
		].join("\n");
		document.head.appendChild(style);
	}
}

class VaultBackgroundSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide() {
		closeAllSelectMenus();
	}

	display() {
		closeAllSelectMenus();
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("vault-background-settings");
		const shortcutLabel = this.app.hotkeyManager.printHotkeyForCommand(`${this.plugin.manifest.id}:next-background`) || "Non configuré";

		const header = containerEl.createDiv({ cls: "vb-settings-header" });
		header.createEl("h2", { text: "Vault Background" });
		header.createEl("p", {
			text: `Choisis un fond stocké dans ce vault, puis change-le instantanément avec ${shortcutLabel}.`,
		});

		const settingsCard = containerEl.createDiv({ cls: "vb-settings-card" });
		new Setting(settingsCard)
			.setName("Dossier des fonds")
			.setDesc("Dossier du vault où chercher les images. Laisse vide pour parcourir tout le vault.")
			.addText((text) => {
				text.setPlaceholder("Fichiers/Fonds");
				text.setValue(this.plugin.settings.folder);
				text.inputEl.addClass("vb-folder-input");
				text.inputEl.addEventListener("change", async () => {
					this.plugin.settings.folder = text.getValue().trim();
					await this.plugin.saveSettings();
					this.display();
				});
			});

		const images = this.plugin.listImages();
		const imageSetting = new Setting(settingsCard)
			.setName("Image de fond")
			.setDesc("Le fichier reste dans le vault et n’est jamais chargé depuis une URL externe.");
		const selectItems = [
			{ value: "", label: "Aucun fond", hint: "Désactiver" },
			...images.map((file) => {
				const fileName = file.path.split("/").pop();
				return { value: file.path, label: fileName, hint: file.parent?.path || "Vault" };
			}),
		];
		createBackgroundSelect(imageSetting.controlEl, {
			value: this.plugin.settings.imagePath,
			items: selectItems,
			onChange: async (value) => {
				this.plugin.settings.imagePath = value;
				await this.plugin.saveSettings();
				this.display();
			},
		});

		if (images.length === 0) {
			const emptyState = settingsCard.createDiv({ cls: "vb-empty-state" });
			emptyState.createEl("strong", { text: "Aucune image trouvée" });
			emptyState.createEl("span", {
				text: `Ajoute un fichier JPG, PNG, WebP, AVIF ou GIF dans « ${this.plugin.settings.folder || "le vault"} ».`,
			});
		} else {
			const currentFile = this.app.vault.getAbstractFileByPath(this.plugin.settings.imagePath);
			const preview = settingsCard.createDiv({ cls: "vb-preview" });
			const visual = preview.createDiv({ cls: "vb-preview-visual" });
			if (currentFile && !currentFile.children) {
				visual.createEl("img", {
					attr: {
						src: this.app.vault.adapter.getResourcePath(currentFile.path),
						alt: "Aperçu du fond sélectionné",
					},
				});
			} else {
				const placeholder = visual.createSpan({ cls: "vb-preview-placeholder" });
				setIcon(placeholder, "image");
			}

			const previewBody = preview.createDiv({ cls: "vb-preview-body" });
			previewBody.createSpan({ cls: "vb-preview-kicker", text: "Fond actuel" });
			previewBody.createEl("strong", {
				text: currentFile?.name || "Aucun fond",
				cls: "vb-preview-name",
			});
			previewBody.createSpan({
				cls: "vb-preview-path",
				text: currentFile?.path || "Le fond d’origine du thème est utilisé.",
			});

			const previewActions = previewBody.createDiv({ cls: "vb-preview-actions" });
			const nextButton = previewActions.createEl("button", { cls: "vb-next-button" });
			nextButton.type = "button";
			const nextIcon = nextButton.createSpan({ cls: "vb-next-button-icon" });
			setIcon(nextIcon, "chevron-right");
			nextButton.createSpan({ text: "Fond suivant" });
			previewActions.createEl("kbd", { text: shortcutLabel });
			nextButton.addEventListener("click", async () => {
				await this.plugin.selectNextBackground();
				this.display();
			});
		}

		// AnuPpuccin n'affiche son fond que si sa classe est présente sur body :
		// sans elle, le réglage du plugin serait sans effet visible.
		if (document.body.classList.contains("anp-card-layout") && !document.body.classList.contains("anp-background-image-toggle")) {
			containerEl.createEl("p", {
				text: "AnuPpuccin est actif mais son option « Custom background image » est désactivée. Active-la dans Style Settings, sinon le fond ne s’affichera pas.",
				cls: "vb-warning",
			});
		}
	}
}

VaultBackgroundPlugin.nextImagePath = nextImagePath;
module.exports = VaultBackgroundPlugin;

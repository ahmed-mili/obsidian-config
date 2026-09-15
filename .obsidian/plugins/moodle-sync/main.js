'use strict';

const { Plugin, Modal, Notice, setIcon } = require('obsidian');
const { execFile } = require('child_process');
const path = require('path');

const SCRIPT = 'C:\\obsidian-vaults\\Efrei\\.tools\\moodle-dl\\moodle-dl.mjs';
const NODE = 'node';

// Icône Lucide par type d'activité Moodle : la fenêtre doit se lire comme la page du cours.
const TYPE_ICON = {
	resource: 'file-text',
	folder: 'folder',
	url: 'link',
	page: 'file',
	book: 'book-open',
	assign: 'file-up',
	forum: 'message-square',
	quiz: 'list-checks',
	label: 'tag',
	feedback: 'clipboard-list',
};

const TYPE_LABEL = {
	resource: 'Fichier', folder: 'Dossier', url: 'Lien', page: 'Page', book: 'Livre',
	assign: 'Devoir', forum: 'Forum', quiz: 'Test', label: 'Étiquette', feedback: 'Retour',
};

// Le title Moodle vaut "Cours : * XTI303-2627PSA01 - Intitulé (X-BAC-DEV-2, …) | Moodle".
// On ne garde que le code et l'intitulé : la liste des groupes n'apprend rien ici.
function courseTitle(raw) {
	return raw
		.replace(/^\s*Cours\s*:\s*/i, '')
		.replace(/\s*\|\s*Moodle\s*$/i, '')
		.replace(/^\s*\*\s*/, '')
		.replace(/\s*\((?:[A-Z0-9-]+\s*,\s*)*[A-Z0-9-]+\)\s*$/, '')
		.trim();
}

function humanSize(bytes) {
	if (bytes === null || bytes === undefined) return '';
	if (bytes < 1024) return `${bytes} o`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Le presse-papier Electron est synchrone et sans permission ; navigator.clipboard
// exige le focus document et retourne vide quand la modal vole le focus.
async function readClipboardUrl() {
	let text = '';
	try {
		text = require('electron').clipboard.readText() || '';
	} catch (e) {
		try { text = (await navigator.clipboard.readText()) || ''; } catch (e2) { text = ''; }
	}
	const m = text.match(/https?:\/\/\S+/);
	return m ? m[0] : '';
}

// Lance moodle-dl et rend le JSON de stdout. stderr sert uniquement de progression.
function runScript(args, onProgress) {
	return new Promise((resolve) => {
		const child = execFile(NODE, [SCRIPT, ...args], {
			cwd: path.dirname(SCRIPT),
			windowsHide: true,
			maxBuffer: 32 * 1024 * 1024,
		}, (err, stdout) => {
			const line = (stdout || '').trim().split('\n').filter(Boolean).pop();
			if (!line) {
				resolve({ ok: false, error: err ? err.message : 'Aucune réponse du script.' });
				return;
			}
			try { resolve(JSON.parse(line)); }
			catch (e) { resolve({ ok: false, error: `Réponse illisible : ${line.slice(0, 200)}` }); }
		});
		if (onProgress) child.stderr.on('data', (d) => onProgress(d.toString()));
	});
}

class MoodleSyncModal extends Modal {
	constructor(app, initialUrl) {
		super(app);
		this.initialUrl = initialUrl || '';
		this.scan = null;
	}

	onOpen() {
		this.modalEl.addClass('moodle-sync-modal');
		this.contentEl.addClass('ms-root');
		if (this.initialUrl) this.renderUrlStep();
		else this.renderPickerStep();
	}

	// --- étape 0 : choisir le module par son code -------------------------

	async renderPickerStep(forceRefresh) {
		const c = this.contentEl;
		c.empty();

		const head = c.createDiv({ cls: 'ms-head' });
		head.createEl('h2', { text: 'Moodle Sync', cls: 'ms-title' });
		head.createEl('p', { cls: 'ms-hint', text: "Télécharge tous les fichiers d'un module en un clic." });

		const bar = c.createDiv({ cls: 'ms-searchbar' });
		setIcon(bar.createDiv({ cls: 'ms-search-icon' }), 'search');
		const search = bar.createEl('input', {
			type: 'text',
			cls: 'ms-search',
			attr: { placeholder: 'Chercher un module…', spellcheck: 'false' },
		});

		// Bouton de filtre : ouvre un menu local (le modal n'a pas de contain,
		// un positionnement absolu suffit, pas besoin de portal).
		const filterBtn = bar.createEl('button', { cls: 'ms-filter' });
		setIcon(filterBtn.createSpan({ cls: 'ms-filter-icon' }), 'list-filter');
		const filterLabel = filterBtn.createSpan({ cls: 'ms-filter-label' });
		const menu = bar.createDiv({ cls: 'ms-filter-menu' });
		menu.hide();

		const results = c.createDiv({ cls: 'ms-results' });

		const foot = c.createDiv({ cls: 'ms-footer ms-footer-split' });
		const status = foot.createDiv({ cls: 'ms-status' });
		const tools = foot.createDiv({ cls: 'ms-foot-tools' });

		const refresh = tools.createEl('button', { cls: 'ms-link', text: 'Actualiser' });
		refresh.addEventListener('click', () => this.renderPickerStep(true));

		const manual = tools.createEl('button', { cls: 'ms-link', text: 'Adresse manuelle' });
		manual.addEventListener('click', () => this.renderUrlStep());

		status.empty();
		status.createDiv({ cls: 'ms-spinner' });
		status.createSpan({ text: forceRefresh ? 'Actualisation depuis Moodle…' : 'Chargement des cours…' });
		search.disabled = true;

		const res = await runScript(forceRefresh ? ['--courses', '--refresh'] : ['--courses'], (t) => {
			const last = t.trim().split('\n').filter(Boolean).pop();
			if (last) { status.empty(); status.createDiv({ cls: 'ms-spinner' }); status.createSpan({ text: last }); }
		});

		if (!res.ok) {
			status.empty();
			status.addClass('is-error');
			status.setText(res.error || 'Liste des cours indisponible.');
			return;
		}

		this.courses = res.courses;
		status.removeClass('is-error');
		status.setText(`${res.courses.length} modules`);
		search.disabled = false;

		const paint = () => {
			const q = search.value.trim().toLowerCase();
			results.empty();

			// L'année est un filtre à part : la frappe cherche uniquement dans les modules.
			const hits = this.courses.filter((co) => {
				if (this.yearFilter && co.yearLabel !== this.yearFilter) return false;
				if (!q) return true;
				return (co.code || '').toLowerCase().includes(q) || co.name.toLowerCase().includes(q);
			});

			if (!hits.length) {
				results.createDiv({ cls: 'ms-empty', text: 'Aucun module ne correspond.' });
				return;
			}

			// Regroupement par année, la plus récente en premier (comme le Dashboard).
			const groups = new Map();
			for (const co of hits) {
				const key = co.yearLabel || 'Année inconnue';
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key).push(co);
			}
			const ordered = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0], 'fr'));

			// Un module peut exister en plusieurs cohortes, dont une seule où Ahmed
			// est inscrit : on propose d'aller chercher les autres sur tout Moodle.
			if (q.length >= 3 && !this.searchHits) {
				const more = results.createEl('button', {
					cls: 'ms-searchall',
					text: `Chercher « ${search.value.trim()} » sur tout Moodle`,
				});
				more.addEventListener('click', async (e) => {
					e.stopPropagation();
					more.disabled = true;
					more.setText('Recherche…');
					const r = await runScript(['--search', search.value.trim()]);
					if (!r.ok) { new Notice(r.error || 'Recherche impossible.'); more.remove(); return; }
					// On n'ajoute que ce qui n'est pas deja dans la liste des inscrits.
					const known = new Set(this.courses.map((c) => c.id));
					const extra = r.courses.filter((c) => !known.has(c.id));
					this.courses = this.courses.concat(extra);
					this.searchHits = true;
					paint();
					if (!extra.length) new Notice('Aucun cours supplémentaire trouvé.');
				});
			}

			for (const [year, list] of ordered) {
				const g = results.createDiv({ cls: 'ms-year' });
				const h = g.createDiv({ cls: 'ms-year-name' });
				h.createSpan({ text: year });
				h.createSpan({ cls: 'ms-year-count', text: String(list.length) });

				for (const co of list.sort((a, b) => (a.code || 'zz').localeCompare(b.code || 'zz', 'fr'))) {
					const row = g.createEl('button', { cls: 'ms-course' });
					// data-code branche la couleur et l'icône définies dans dashboard-tiles.css.
					if (co.code) row.setAttr('data-code', co.code);
					row.createSpan({ cls: 'ms-course-icon' });
					const code = row.createSpan({ cls: 'ms-course-code', text: co.code || '—' });
					if (!co.dest) code.addClass('is-orphan');
					row.createSpan({ cls: 'ms-course-name', text: co.name.replace(/^\S+\s*-\s*/, '') });
					// La cohorte (PSA/BSA) distingue deux cours qui portent le meme code.
					const twins = list.filter((x) => x.code === co.code).length > 1;
					if (twins && co.cohort) row.createSpan({ cls: 'ms-course-cohort', text: co.cohort });
					if (!co.dest) row.createSpan({ cls: 'ms-course-warn', text: 'pas de dossier' });
					row.addEventListener('click', () => { this.initialUrl = co.url; this.startScan(co.url); });
				}
			}
		};

		search.addEventListener('input', () => { this.searchHits = false; paint(); });
		search.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			e.preventDefault();
			results.querySelector('.ms-course')?.click();
		});
		// Années disponibles, la plus récente en premier ; par défaut on ne montre
		// que l'année en cours, les précédentes restent à un clic.
		const years = [...new Set(this.courses.map((co) => co.yearLabel).filter(Boolean))]
			.sort((a, b) => b.localeCompare(a, 'fr'));
		if (this.yearFilter === undefined) this.yearFilter = years[0] || null;

		const applyFilter = (value) => {
			this.yearFilter = value;
			filterLabel.setText(value || 'Toutes');
			filterBtn.toggleClass('is-active', !!value);
			menu.hide();
			paint();
		};

		const addOption = (value, text) => {
			const o = menu.createEl('button', { cls: 'ms-filter-option', text });
			o.addEventListener('click', (e) => { e.stopPropagation(); applyFilter(value); });
		};
		for (const y of years) addOption(y, y);
		addOption(null, 'Toutes les années');

		filterBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (menu.isShown()) menu.hide(); else menu.show();
		});
		// Fermeture au clic ailleurs dans la fenêtre.
		this.contentEl.addEventListener('click', () => menu.hide());

		applyFilter(this.yearFilter);
		window.setTimeout(() => search.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
		this.modalEl.removeClass('moodle-sync-modal');
	}

	// --- étape 1 : l'adresse du cours -------------------------------------

	renderUrlStep() {
		const c = this.contentEl;
		c.empty();

		const head = c.createDiv({ cls: 'ms-head' });
		head.createEl('h2', { text: 'Moodle Sync', cls: 'ms-title' });
		head.createEl('p', {
			cls: 'ms-hint',
			text: "Colle l'adresse de la page du cours. Le dossier du module est déduit de son code.",
		});

		const row = c.createDiv({ cls: 'ms-urlrow' });
		this.input = row.createEl('input', {
			type: 'text',
			cls: 'ms-input',
			attr: { placeholder: 'https://moodle.myefrei.fr/course/view.php?id=…', spellcheck: 'false' },
		});
		this.input.value = this.initialUrl;

		const btn = row.createEl('button', { cls: 'ms-primary', text: 'Analyser' });
		btn.addEventListener('click', () => this.startScan());
		this.input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); this.startScan(); }
		});

		this.status = c.createDiv({ cls: 'ms-status' });
		this.status.hide();

		window.setTimeout(() => { this.input.focus(); this.input.select(); }, 0);
	}

	setStatus(text, spinning) {
		this.status.show();
		this.status.empty();
		if (spinning) this.status.createDiv({ cls: 'ms-spinner' });
		this.status.createSpan({ text });
	}

	async startScan(explicitUrl) {
		const url = (explicitUrl || this.input?.value || '').trim();
		if (!/^https?:\/\//.test(url)) {
			new Notice('Adresse invalide : il faut une URL commençant par http.');
			return;
		}
		if (explicitUrl) {
			// Entrée par la recherche : on remplace la liste par l'écran d'attente.
			this.contentEl.empty();
			const head = this.contentEl.createDiv({ cls: 'ms-head' });
			head.createEl('h2', { text: 'Moodle Sync', cls: 'ms-title' });
			this.status = this.contentEl.createDiv({ cls: 'ms-status' });
		} else {
			this.input.disabled = true;
		}
		this.setStatus('Analyse de la page…', true);

		const res = await runScript(['--scan', url], (t) => {
			const last = t.trim().split('\n').filter(Boolean).pop();
			if (last) this.setStatus(last, true);
		});

		if (!res.ok) {
			if (this.input) this.input.disabled = false;
			this.setStatus(res.error || 'Analyse impossible.', false);
			this.status.addClass('is-error');
			return;
		}
		this.scan = res;
		this.renderCourse();
	}

	// --- étape 2 : le cours, comme sur Moodle -----------------------------

	allFiles() {
		return this.scan.sections.flatMap((s) => s.activities.flatMap((a) => a.files || []));
	}

	renderCourse() {
		const c = this.contentEl;
		c.empty();
		const s = this.scan;

		const head = c.createDiv({ cls: 'ms-head' });
		const back = head.createEl('button', { cls: 'ms-back' });
		setIcon(back, 'arrow-left');
		back.createSpan({ text: 'Autre module' });
		back.addEventListener('click', () => this.renderPickerStep());

		head.createEl('h2', { text: courseTitle(s.title), cls: 'ms-title' });

		const dest = head.createDiv({ cls: 'ms-dest' });
		const destIcon = dest.createSpan({ cls: 'ms-dest-icon' });
		setIcon(destIcon, 'folder-open');
		dest.createSpan({
			cls: 'ms-dest-path',
			text: s.dest ? s.dest.replace(/^.*Ethical Hacking\\/, '') : 'Aucun dossier trouvé pour ce module',
		});
		if (!s.dest) dest.addClass('is-warn');

		this.list = c.createDiv({ cls: 'ms-sections' });
		for (const sec of s.sections) this.renderSection(this.list, sec);

		if (s.external && s.external.length) {
			const ext = c.createDiv({ cls: 'ms-external' });
			const t = ext.createDiv({ cls: 'ms-external-title' });
			setIcon(t.createSpan({ cls: 'ms-external-icon' }), 'external-link');
			t.createSpan({ text: `${s.external.length} lien(s) hors Moodle, non téléchargeables` });
			const ul = ext.createEl('ul');
			for (const e of s.external) {
				const a = ul.createEl('li').createEl('a', { text: e, href: e });
				a.setAttr('target', '_blank');
			}
		}

		this.footer = c.createDiv({ cls: 'ms-footer' });
		this.allBtn = this.footer.createEl('button', { cls: 'ms-primary ms-all' });
		this.allBtn.addEventListener('click', () => this.downloadAll());
		this.refreshFooter();
	}

	renderSection(parent, sec) {
		const el = parent.createDiv({ cls: 'ms-section' });
		el.createDiv({ cls: 'ms-section-name', text: sec.name });
		for (const act of sec.activities) this.renderActivity(el, act);
	}

	renderActivity(parent, act) {
		const el = parent.createDiv({ cls: 'ms-activity' });

		const head = el.createDiv({ cls: 'ms-act-head' });
		const icon = head.createDiv({ cls: `ms-act-icon is-${act.type}` });
		setIcon(icon, TYPE_ICON[act.type] || 'circle-dot');

		const info = head.createDiv({ cls: 'ms-act-info' });
		info.createDiv({ cls: 'ms-act-name', text: act.name });
		const sub = info.createDiv({ cls: 'ms-act-meta' });
		sub.createSpan({ text: TYPE_LABEL[act.type] || act.type });
		if (act.meta) sub.createSpan({ text: ' · ' + act.meta });
		if (!act.files || !act.files.length) {
			sub.createSpan({ cls: 'ms-act-empty', text: ' · aucun fichier' });
		}

		for (const f of act.files || []) this.renderFile(el, f);
	}

	renderFile(parent, f) {
		const row = parent.createDiv({ cls: `ms-file is-${f.status}` });
		f.el = row;

		const icon = row.createDiv({ cls: 'ms-file-icon' });
		setIcon(icon, f.status === 'present' ? 'check' : 'download');

		const info = row.createDiv({ cls: 'ms-file-info' });
		// Nom complet, jamais tronqué : c'est le nom réel sur le disque.
		info.createDiv({ cls: 'ms-file-name', text: f.name });
		const meta = info.createDiv({ cls: 'ms-file-meta' });
		if (f.size) meta.createSpan({ text: humanSize(f.size) });

		const badge = row.createDiv({ cls: 'ms-file-action' });
		f.badge = badge;
		this.paintFileAction(f);
	}

	paintFileAction(f) {
		const badge = f.badge;
		badge.empty();
		f.el.removeClass('is-present', 'is-missing', 'is-outdated', 'is-failed');
		f.el.addClass(`is-${f.status}`);
		const icon = f.el.querySelector('.ms-file-icon');
		icon.empty();

		if (f.status === 'present') {
			setIcon(icon, 'check');
			badge.createSpan({ cls: 'ms-badge is-present', text: 'Déjà présent' });
			return;
		}
		if (f.status === 'busy') {
			setIcon(icon, 'download');
			badge.createDiv({ cls: 'ms-spinner' });
			return;
		}
		if (f.status === 'failed') {
			setIcon(icon, 'triangle-alert');
			const b = badge.createEl('button', { cls: 'ms-ghost', text: 'Réessayer' });
			b.addEventListener('click', () => this.download([f]));
			return;
		}
		setIcon(icon, 'download');
		const b = badge.createEl('button', {
			cls: 'ms-ghost',
			text: f.status === 'outdated' ? 'Mettre à jour' : 'Télécharger',
		});
		b.addEventListener('click', () => this.download([f]));
	}

	refreshFooter() {
		const todo = this.allFiles().filter((f) => f.status === 'missing' || f.status === 'outdated');
		const busy = this.allFiles().some((f) => f.status === 'busy');
		this.allBtn.empty();
		this.allBtn.disabled = !todo.length || busy || !this.scan.dest;

		if (busy) {
			this.allBtn.createDiv({ cls: 'ms-spinner' });
			this.allBtn.createSpan({ text: 'Téléchargement…' });
		} else if (!todo.length) {
			setIcon(this.allBtn.createSpan({ cls: 'ms-btn-icon' }), 'check');
			this.allBtn.createSpan({ text: 'Tout est à jour' });
		} else {
			setIcon(this.allBtn.createSpan({ cls: 'ms-btn-icon' }), 'download');
			this.allBtn.createSpan({ text: `Tout télécharger (${todo.length})` });
		}
	}

	downloadAll() {
		this.download(this.allFiles().filter((f) => f.status === 'missing' || f.status === 'outdated'));
	}

	async download(files) {
		if (!this.scan.dest) {
			new Notice("Aucun dossier de destination : le code du module n'a pas été reconnu.");
			return;
		}
		if (!files.length) return;

		for (const f of files) { f.status = 'busy'; this.paintFileAction(f); }
		this.refreshFooter();

		const res = await runScript(['--fetch', this.scan.dest, ...files.map((f) => f.url)]);
		if (!res.ok) {
			for (const f of files) { f.status = 'failed'; this.paintFileAction(f); }
			this.refreshFooter();
			new Notice(`Moodle Sync : ${res.error}`);
			return;
		}

		let done = 0;
		for (const f of files) {
			const r = res.results.find((x) => x.url === f.url);
			if (r && r.ok) { f.status = 'present'; f.localSize = r.size; done++; }
			else f.status = 'failed';
			this.paintFileAction(f);
		}
		this.refreshFooter();
		const failed = files.length - done;
		new Notice(failed
			? `Moodle Sync : ${done} téléchargé(s), ${failed} échec(s).`
			: `Moodle Sync : ${done} fichier(s) enregistré(s).`);
	}
}

module.exports = class MoodleSyncPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: 'open',
			name: "Télécharger les fichiers d'un cours Moodle",
			callback: () => this.openModal(),
		});

		// Cible de la tuile MOODLE SYNC du Dashboard : obsidian://moodle-sync
		this.registerObsidianProtocolHandler('moodle-sync', (params) => this.openModal(params.url));

		this.addRibbonIcon('cloud-download', 'Moodle Sync', () => this.openModal());
	}

	async openModal(url) {
		const initial = url || (await readClipboardUrl());
		new MoodleSyncModal(this.app, initial).open();
	}
};

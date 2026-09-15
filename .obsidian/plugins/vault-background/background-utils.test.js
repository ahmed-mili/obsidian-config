"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadPluginLikeObsidian() {
	const originalLoad = Module._load;
	Module._load = function (request, parent, isMain) {
		if (request === "obsidian") {
			return {
				Plugin: class {},
				PluginSettingTab: class {},
				Setting: class {},
				Notice: class {},
				setIcon() {},
			};
		}
		if (request.startsWith("./") && request !== "./main.js") {
			throw new Error(`Le chargeur autonome refuse le module local ${request}`);
		}
		return originalLoad(request, parent, isMain);
	};

	try {
		delete require.cache[require.resolve("./main.js")];
		return require("./main.js");
	} finally {
		Module._load = originalLoad;
	}
}

test("le bundle autonome charge et parcourt les fonds en boucle sans passer par Aucun fond", () => {
	const PluginClass = loadPluginLikeObsidian();
	const images = ["Fonds/a.jpg", "Fonds/b.jpg", "Fonds/c.jpg"];
	const cases = [
		{ current: "", expected: "Fonds/a.jpg" },
		{ current: "Fonds/a.jpg", expected: "Fonds/b.jpg" },
		{ current: "Fonds/b.jpg", expected: "Fonds/c.jpg" },
		{ current: "Fonds/c.jpg", expected: "Fonds/a.jpg" },
		{ current: "Fonds/supprime.jpg", expected: "Fonds/a.jpg" },
	];

	for (const { current, expected } of cases) {
		assert.equal(PluginClass.nextImagePath(images, current), expected);
	}
	assert.equal(PluginClass.nextImagePath([], "Fonds/a.jpg"), "");
});

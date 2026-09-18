// Checks for the Bohr-style atom: the element data, the history texts and the orbit scaling.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Atom } = require("../simulations/atom.js");
const ELEMENTS = require("../data/elements.js");
const HISTORY = require("../data/element-history.js");

const symbols = Object.keys(ELEMENTS);

test("all 118 elements, in order, and each shell list holds exactly Z electrons within 2n²", () => {
	assert.strictEqual(symbols.length, 118);
	symbols.forEach((s, i) => {
		const e = ELEMENTS[s];
		assert.strictEqual(e.number, i + 1, s);
		assert.strictEqual(e.shells.reduce((a, b) => a + b, 0), e.number, `${s}: electrons`);
		e.shells.forEach((n, k) => assert.ok(n >= 1 && n <= 2 * (k + 1) ** 2, `${s}: shell ${k + 1} holds ${n}`));
	});
});

test("every element has its discoverer, date, story and the year it joined the table", () => {
	assert.deepStrictEqual(Object.keys(HISTORY), symbols);
	for (const s of symbols) {
		const h = HISTORY[s];
		for (const key of ["by", "year", "table", "note", "how"]) assert.ok(typeof h[key] === "string" && h[key].length > 3, `${s}.${key}`);
		// they have to fit under the atom on the mirror, and end up inside HTML
		assert.ok(h.how.length <= 260, `${s}: story is ${h.how.length} characters`);
		assert.ok(h.note.length <= 140, `${s}: note is ${h.note.length} characters`);
		assert.ok(!/[<>&]/.test(h.by + h.year + h.table + h.note + h.how), `${s}: HTML characters`);
	}
});

test("no element joins the table before the table existed, or before it was discovered", () => {
	const lastYear = (text) => Math.max(...(text.match(/\d{4}/g) || ["0"]).map(Number));
	const firstYear = (text) => Number((text.match(/\d{4}/) || ["0"])[0]);
	for (const s of symbols) {
		const h = HISTORY[s], joined = lastYear(h.table);
		assert.ok(joined >= 1869 && joined <= 2016, `${s}: joined ${h.table}`);
		// nobelium is the exception: named in 1957 for a claim that failed, truly found in 1966
		if (s !== "No" && s !== "F") assert.ok(joined >= firstYear(h.year), `${s}: joined ${h.table}, discovered ${h.year}`);
	}
	// the 63 of Mendeleev's 1869 table included didymium, and not terbium or helium
	const first = symbols.filter((s) => HISTORY[s].table === "1869");
	assert.strictEqual(first.length, 62);
	assert.ok(!first.includes("Tb") && !first.includes("He") && first.includes("F"));
});

test("orbital periods obey Kepler's third law, T² ∝ r³", () => {
	const { radii } = Atom.layout(7, 900);
	const T = radii.map((r) => (2 * Math.PI) / Atom.omega(r, radii[0]));
	const k = T[0] ** 2 / radii[0] ** 3;
	radii.forEach((r, i) => assert.ok(Math.abs(T[i] ** 2 / r ** 3 / k - 1) < 1e-12, `shell ${i + 1}`));
	assert.ok(T[6] > T[0] * 5, "outer shells are much slower");
});

test("each shell turns rigidly: after one period its electrons are back where they started", () => {
	const atom = new Atom({ element: "Fe" });
	const before = atom.electrons(900);
	assert.deepStrictEqual(before.map((s) => s.length), [2, 8, 14, 2]);
	const period = (2 * Math.PI) / Atom.omega(1, 1); // the innermost shell's
	for (let k = 0; k < 1000; k++) atom.step(period / 1000);
	const after = atom.electrons(900);
	before[0].forEach(([x, y], i) => assert.ok(Math.hypot(after[0][i][0] - x, after[0][i][1] - y) < 1e-6));
	assert.ok(Math.hypot(after[3][0][0] - before[3][0][0], after[3][0][1] - before[3][0][1]) > 1, "the outer shell is not back yet");
	// electrons stay on their circles, evenly spaced
	const { radii } = Atom.layout(4, 900);
	after.forEach((shell, k) => shell.forEach(([x, y]) => assert.ok(Math.abs(Math.hypot(x, y) - radii[k]) < 1e-9)));
});

test("the shells fit the canvas, clear of the nucleus, for every element", () => {
	for (const s of symbols) {
		const { nucleus, radii } = Atom.layout(ELEMENTS[s].shells.length, 700);
		assert.ok(radii[0] > nucleus * 1.5 && radii[radii.length - 1] < 350, s);
	}
});

test("Bohr's formulas for the innermost electron: hydrogen, and gold's 1s electron at over half of c", () => {
	const h = Atom.innermost(1);
	assert.ok(Math.abs(h.radiusPm - 52.92) < 0.01 && Math.abs(h.bindingEv - 13.606) < 0.001);
	assert.ok(Math.abs(h.speedC * 299792.458 - 2187.69) < 0.01, "αc ≈ 2188 km/s");
	const au = Atom.innermost(79);
	assert.ok(au.speedC > 0.57 && au.speedC < 0.58);
	assert.ok(Atom.innermost(118).speedC < 1);
});

test("the deck shows every element once before repeating any; a list or a sequence can be asked for", () => {
	const seen = new Set();
	for (let k = 0; k < 118; k++) seen.add(new Atom().symbol);
	assert.strictEqual(seen.size, 118);
	const some = Array.from({ length: 6 }, () => new Atom({ atomElements: ["Au", "Ag", "nonsense", "Cu"] }).symbol);
	assert.deepStrictEqual([...new Set(some.slice(0, 3))].sort(), ["Ag", "Au", "Cu"]);
	assert.deepStrictEqual([...new Set(some.slice(3))].sort(), ["Ag", "Au", "Cu"]);
	assert.deepStrictEqual([1, 2, 3].map(() => new Atom({ atomOrder: "sequence" }).symbol), ["H", "He", "Li"]);
});

test("caption and readout carry the history and the numbers", () => {
	const atom = new Atom({ element: "Tc" });
	const html = atom.info.title + atom.info.subtitle + atom.info.equations.join("");
	for (const text of ["Technetium", "43", "Segrè", "1937", "eka-manganese", "cyclotron"]) assert.ok(html.includes(text), text);
	assert.ok(atom.readout().includes("4d⁵ 5s²"), atom.readout());
	assert.ok(new Atom({ element: "Og" }).info.subtitle.includes("noble gas (predicted)"));
});

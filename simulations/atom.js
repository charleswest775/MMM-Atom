/* Bohr-style atom: the nucleus with the element's electrons circling in their shells, and
 * underneath who discovered the element, how, and when it joined the periodic table.
 * One element per instance: the module makes a new instance every cycleSeconds and each time
 * it is shown, and each takes the next element from a shuffled deck.
 *
 * What is real: the number of electrons in each shell, and the way the periods scale. An
 * electron on a circular orbit around a charge obeys T² ∝ r³ (in Bohr's model r ∝ n² and
 * T ∝ n³, the same law), so the inner shells here whirl while the outer ones creep.
 * What is schematic: the radii, drawn evenly spaced. True Bohr radii grow as n², and in a
 * heavy atom the inner shells are pulled in a hundredfold: not drawable to scale.
 *
 * After github.com/KristjanESPERANTO/MMM-AtomVisualizer (MIT), which animates DOM nodes with
 * CSS; this one draws on the module's canvas so the Pi's frame cap and suspend() apply.
 */
(function (root) {
	const ELEMENTS = root.ChaosElements || require("../data/elements.js");
	const HISTORY = root.ChaosElementHistory || require("../data/element-history.js");

	const A0_PM = 52.917721;      // Bohr radius, pm
	const ALPHA = 1 / 137.035999; // fine-structure constant = v/c of hydrogen's ground-state electron
	const RYDBERG_EV = 13.605693; // hydrogen's ground-state binding energy, eV

	// seconds per revolution of the innermost shell: unhurried, so the electrons move only a few
	// pixels per frame at 12 fps, which on the Pi costs half of what 20 fps does
	const INNER_PERIOD = 8;
	const MIN_SHELLS = 4;         // light atoms are drawn as if they had this many shells, so hydrogen isn't one huge ring
	const FADE_IN = 1.5;          // seconds

	const CATEGORY_COLORS = [
		["alkali metal", "#ff6b6b"],
		["alkaline earth", "#ff9f43"],
		["post-transition", "#9bd36b"], // before "transition"
		["transition", "#f7c948"],
		["metalloid", "#3ddc97"],
		["nonmetal", "#4dc4ff"],
		["noble gas", "#b08cff"],
		["lanthanide", "#ff8fcf"],
		["actinide", "#ff7096"]
	];
	const colorOf = (category) => (CATEGORY_COLORS.find(([k]) => category.includes(k)) || [0, "#aaa"])[1];
	// "unknown, probably transition metal" → "transition metal (predicted)"
	const tidyCategory = (c) => c.replace(/^unknown, (?:probably|predicted to be) (.*)$/, "$1 (predicted)");
	const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
	// "[Ar] 3d6 4s2" → "[Ar] 3d⁶ 4s²"
	const superscript = (conf) => conf.replace(/([spdf])(\d+)/g, (_, l, n) => l + n.replace(/\d/g, (d) => SUP[d]));

	// decks of symbols still to show, by element list, shared by successive instances
	const decks = new Map();

	class Atom {
		// atomElements: symbols to show (default: all 118); atomOrder: "shuffle" or "sequence"
		constructor ({ atomElements = [], atomOrder = "shuffle", element } = {}) {
			this.symbol = ELEMENTS[element] ? element : Atom.next(atomElements, atomOrder);
			this.element = ELEMENTS[this.symbol];
			this.history = HISTORY[this.symbol];
			this.color = colorOf(this.element.category);
			// angle of each shell's first electron; the rest are evenly spaced around the ring
			this.phase = this.element.shells.map(() => Math.random() * 2 * Math.PI);
			this.t = 0;
			this.info = this.buildInfo();
		}

		// the next symbol from the deck for this list, reshuffled (or restarted) when it runs out
		static next (list, order) {
			const valid = list.filter((s) => ELEMENTS[s]);
			const symbols = valid.length ? valid : Object.keys(ELEMENTS);
			const key = `${order}:${symbols.join()}`;
			let deck = decks.get(key);
			if (!deck || !deck.length) {
				deck = symbols.slice();
				if (order !== "sequence") {
					for (let i = deck.length - 1; i > 0; i--) {
						const j = Math.floor(Math.random() * (i + 1));
						[deck[i], deck[j]] = [deck[j], deck[i]];
					}
				}
				decks.set(key, deck);
			}
			return deck.shift();
		}

		// Shell radii for a drawing of the given size (px): evenly spaced from the nucleus out.
		static layout (shellCount, size) {
			const nucleus = size * 0.085;
			const outer = size / 2 - size * 0.03;
			const gap = (outer - nucleus) / Math.max(shellCount, MIN_SHELLS);
			return { nucleus, gap, radii: Array.from({ length: shellCount }, (_, k) => nucleus + gap * (k + 1)) };
		}

		// angular speed (rad/s) on an orbit of radius r, given the innermost radius r1: Kepler's
		// third law, which circular Coulomb orbits obey just as planets do
		static omega (r, r1) {
			return ((2 * Math.PI) / INNER_PERIOD) * (r1 / r) ** 1.5;
		}

		// Bohr's model applied to the innermost electron, which sees nearly the whole nuclear
		// charge Z: radius a₀/Z, speed Zαc, binding energy Z²·13.6 eV. (No screening, no relativity.)
		static innermost (Z) {
			return { radiusPm: A0_PM / Z, speedC: Z * ALPHA, bindingEv: RYDBERG_EV * Z * Z };
		}

		step (dt) {
			this.t += dt;
			const { radii } = Atom.layout(this.phase.length, 1);
			for (let k = 0; k < this.phase.length; k++) this.phase[k] += Atom.omega(radii[k], radii[0]) * dt;
		}

		// [x, y] of every electron for a drawing of the given size centred on (0, 0), shell by shell
		electrons (size) {
			const { radii } = Atom.layout(this.phase.length, size);
			return this.element.shells.map((n, k) => Array.from({ length: n }, (_, i) => {
				const a = this.phase[k] + (2 * Math.PI * i) / n;
				return [radii[k] * Math.cos(a), radii[k] * Math.sin(a)];
			}));
		}

		// Everything moves, so the whole atom is redrawn each frame; but only the atom's own
		// square, which for light elements is a small part of the canvas.
		draw (ctx, w, h) {
			const size = Math.min(w, h);
			const cx = w / 2, cy = h / 2;
			const { nucleus, radii } = Atom.layout(this.phase.length, size);
			const dot = Math.max(3, size * 0.0075);
			const half = Math.ceil(radii[radii.length - 1] + dot * 3);
			if (!this.sprites) this.sprites = this.makeSprites(nucleus, dot);

			ctx.globalAlpha = 1;
			ctx.fillStyle = "#000";
			ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
			const fade = Math.min(1, this.t / FADE_IN);

			// the shells, and behind each electron a short arc of where it has just been
			ctx.lineWidth = 1;
			ctx.strokeStyle = "#5a6b7d";
			ctx.globalAlpha = 0.55 * fade;
			for (const r of radii) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke(); }
			ctx.lineWidth = dot * 0.9;
			ctx.lineCap = "round";
			ctx.globalAlpha = 0.28 * fade;
			this.element.shells.forEach((n, k) => {
				const last = k === radii.length - 1;
				const tail = Math.min(Atom.omega(radii[k], radii[0]) * 0.6, (Math.PI * 1.2) / n);
				ctx.strokeStyle = last ? this.color : "#9fd8ff";
				ctx.beginPath();
				for (let i = 0; i < n; i++) {
					const a = this.phase[k] + (2 * Math.PI * i) / n;
					ctx.moveTo(cx + radii[k] * Math.cos(a - tail), cy + radii[k] * Math.sin(a - tail));
					ctx.arc(cx, cy, radii[k], a - tail, a);
				}
				ctx.stroke();
			});

			// electrons: the outermost shell, which does the chemistry, in the element's colour
			ctx.globalAlpha = fade;
			const { electron, valence, core } = this.sprites;
			this.electrons(size).forEach((shell, k) => {
				const img = k === radii.length - 1 ? valence : electron;
				for (const [x, y] of shell) ctx.drawImage(img, cx + x - img.width / 2, cy + y - img.height / 2);
			});
			ctx.drawImage(core, cx - core.width / 2, cy - core.height / 2);
			ctx.globalAlpha = 1;
		}

		// Glows are gradients, slow to rasterise in software: drawn once here, then blitted.
		makeSprites (nucleus, dot) {
			const canvas = (px, paint) => {
				const c = document.createElement("canvas");
				c.width = c.height = Math.ceil(px);
				const g = c.getContext("2d");
				g.translate(c.width / 2, c.height / 2);
				paint(g);
				return c;
			};
			const glowDot = (color) => canvas(dot * 6, (g) => {
				const glow = g.createRadialGradient(0, 0, 0, 0, 0, dot * 3);
				glow.addColorStop(0, color); glow.addColorStop(1, "transparent");
				g.globalAlpha = 0.35; g.fillStyle = glow;
				g.beginPath(); g.arc(0, 0, dot * 3, 0, 2 * Math.PI); g.fill();
				g.globalAlpha = 1; g.fillStyle = color;
				g.beginPath(); g.arc(0, 0, dot, 0, 2 * Math.PI); g.fill();
				g.fillStyle = "#fff"; g.globalAlpha = 0.85;
				g.beginPath(); g.arc(-dot * 0.25, -dot * 0.25, dot * 0.45, 0, 2 * Math.PI); g.fill();
			});
			const core = canvas(nucleus * 3, (g) => {
				const halo = g.createRadialGradient(0, 0, nucleus * 0.8, 0, 0, nucleus * 1.5);
				halo.addColorStop(0, this.color); halo.addColorStop(1, "transparent");
				g.globalAlpha = 0.35; g.fillStyle = halo;
				g.beginPath(); g.arc(0, 0, nucleus * 1.5, 0, 2 * Math.PI); g.fill();
				const ball = g.createRadialGradient(-nucleus * 0.3, -nucleus * 0.35, nucleus * 0.1, 0, 0, nucleus);
				ball.addColorStop(0, "#fff"); ball.addColorStop(0.35, this.color); ball.addColorStop(1, "#000");
				g.globalAlpha = 1; g.fillStyle = ball;
				g.beginPath(); g.arc(0, 0, nucleus, 0, 2 * Math.PI); g.fill();
				g.fillStyle = "#000"; g.textAlign = "center"; g.textBaseline = "middle";
				g.font = `bold ${Math.round(nucleus * (this.symbol.length > 1 ? 0.8 : 0.95))}px "Roboto Condensed", sans-serif`;
				g.fillText(this.symbol, 0, nucleus * 0.04);
			});
			return { electron: glowDot("#9fd8ff"), valence: glowDot(this.color), core };
		}

		buildInfo () {
			const e = this.element, hist = this.history;
			const facts = [
				["Discovered by", hist.by],
				["Discovered", hist.year],
				["Joined the table", `${hist.table} <span class="chaos-facts-note">${hist.note}</span>`],
				["How", hist.how]
			];
			return {
				title: `<span style="color:${this.color}">${e.number}</span> ${e.name} <span class="chaos-symbol">${this.symbol}</span>`,
				subtitle: `${tidyCategory(e.category)} · ${e.phase.toLowerCase()} at room temperature · ${Number(e.mass.toFixed(3))} u`,
				equations: [
					`<div class="chaos-facts">${facts.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("")}</div>`,
					"<span class=\"chaos-note\">Bohr-style picture: electrons per shell are real, periods follow T² ∝ r³, radii are schematic</span>"
				]
			};
		}

		readout () {
			const e = this.element, inner = Atom.innermost(e.number);
			const binding = inner.bindingEv >= 1000 ? `${(inner.bindingEv / 1000).toFixed(1)} keV` : `${inner.bindingEv.toFixed(1)} eV`;
			return `shells ${e.shells.join(" · ")}    ${superscript(e.configuration)}\n` +
				`innermost electron, by Bohr's formulas:  r = a₀/Z = ${inner.radiusPm.toFixed(2)} pm\n` +
				`v = Zαc = ${inner.speedC.toFixed(3)} c    E = −Z² · 13.6 eV = −${binding}`;
		}
	}

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.atom = Atom;
	if (typeof module !== "undefined") module.exports = { Atom };
})(typeof window !== "undefined" ? window : globalThis);

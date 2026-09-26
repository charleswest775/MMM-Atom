/* Not chaos: the quantum atom, the sequel to the Bohr atom. Hydrogen's electron in one of its
 * states |n l m⟩, shown the only way it can be seen: measurement by measurement. Each dot is a
 * place the electron was found, drawn at random with probability |ψ|² (Born's rule), in a thin
 * slice through the nucleus: the plane containing the z axis (x–z), or for the circular states
 * (m = l = n − 1) the plane they circle in (x–y), where they make a ring at exactly the radius of
 * Bohr's orbit. The picture develops like a long exposure; dots are coloured by the sign of the
 * (real) wavefunction in that plane, so the lobes alternate, as chemists draw them; on a ring, by
 * the sign of ψ's real part, whose phase e^{imφ} winds m times round it.
 *
 * Exact: ψ_nlm = R_nl(r) Y_l^m(θ, φ), with R_nl from the associated Laguerre polynomials and Y from
 * the associated Legendre functions; in the x–z plane |Y_l^m|² doesn't depend on φ, and the real
 * orbital with cos mφ has the same density there. The readout samples distances from the radial
 * distribution r²R_nl² too, so their mean can be seen converging on ⟨r⟩ = ½(3n² − l(l+1)) a₀.
 *
 * For the Pi: dots are counted per pixel and turned into colour four times a second, over the
 * square of the picture; after `orbitalSeconds` the exposure ends and the sim rests.
 */
(function (root) {
	const LETTERS = "spdfgh";
	const FADE = 1.0;         // seconds for Bohr's circle to appear, before the dots
	const REFRESH = 0.25;     // seconds between colourings of the counts
	const MARGIN = 0.94;      // the picture's side, as a fraction of the canvas
	const C = 640;            // dots are counted on a C × C grid over the picture
	const WARM = [255, 172, 96], COOL = [96, 176, 255];

	// the states shown, one per showing: [n, l, m, plane]
	const STATES = [
		[1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 1, "xy"], [3, 0, 0], [3, 1, 0], [3, 1, 1], [3, 2, 0], [3, 2, 1],
		[3, 2, 2, "xy"], [4, 0, 0], [4, 1, 0], [4, 1, 1], [4, 2, 0], [4, 2, 1], [4, 2, 2], [4, 3, 0], [4, 3, 1],
		[4, 3, 2], [4, 3, 3, "xy"], [5, 1, 0], [5, 2, 0], [5, 3, 1], [5, 4, 0], [5, 4, 2], [5, 4, 4, "xy"],
		[6, 2, 0], [6, 3, 1], [6, 4, 2], [6, 5, 0]
	].map(([n, l, m, plane = "xz"]) => ({ n, l, m, plane }));

	const STORIES = [
		"Bohr's orbits (1913) gave hydrogen's energies exactly, but failed for every other atom. In 1926 Erwin Schrödinger replaced them with a wave equation, worked out over the Christmas holidays in Arosa.",
		"Max Born saw that |ψ|² is a probability: the chance of finding the electron at each place. The square appears only in a note he added to the proofs of his 1926 paper; it won him the Nobel prize in 1954.",
		"Nothing moves in this picture. Each state is a standing wave, and the dots are where the electron was found, one measurement at a time; before each one, quantum mechanics says only how likely each place is.",
		"The electron has no path. Heisenberg's uncertainty principle (1927) says that the better its position is known, the worse its momentum: an orbit, which needs both, cannot exist.",
		"The letters s, p, d, f are older than the theory: they come from the sharp, principal, diffuse and fundamental lines of 19th-century spectroscopy."
	];

	// ---- the wavefunction

	// associated Laguerre polynomial L_k^α(x)
	function laguerre (k, alpha, x) {
		let a = 1, b = 1 + alpha - x;
		if (k === 0) return a;
		for (let i = 1; i < k; i++) { const c = ((2 * i + 1 + alpha - x) * b - (i + alpha) * a) / (i + 1); a = b; b = c; }
		return b;
	}

	// associated Legendre function P_l^m(x), m ≥ 0 (with the Condon–Shortley phase)
	function legendre (l, m, x) {
		let pmm = 1;
		const s = Math.sqrt(Math.max(0, 1 - x * x));
		for (let i = 1; i <= m; i++) pmm *= -(2 * i - 1) * s;
		if (l === m) return pmm;
		let pm1 = x * (2 * m + 1) * pmm;
		if (l === m + 1) return pm1;
		for (let ll = m + 2; ll <= l; ll++) { const p = ((2 * ll - 1) * x * pm1 - (ll + m - 1) * pmm) / (ll - m); pmm = pm1; pm1 = p; }
		return pm1;
	}

	const factorial = (k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };

	// R_nl(r), r in Bohr radii, normalised so ∫ R² r² dr = 1
	function radial (n, l, r) {
		const rho = (2 * r) / n;
		const norm = Math.sqrt((2 / n) ** 3 * factorial(n - l - 1) / (2 * n * factorial(n + l)));
		return norm * rho ** l * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
	}

	// |ψ|² in the picture's plane at (u, v) (Bohr radii), up to a constant, and the sign to colour
	// it by: [density, ±1]
	function inPlane (state, u, v) {
		const { n, l, m, plane } = state, r = Math.hypot(u, v);
		if (plane === "xz") {
			// u = x, v = z: θ from the z axis; φ = 0 for x ≥ 0 and π for x < 0. |Y_l^m|² doesn't
			// depend on φ, and the real orbital with cos mφ has the same density here, and this sign
			const ct = r > 0 ? v / r : 1, side = u >= 0 || m % 2 === 0 ? 1 : -1;
			const psi = radial(n, l, r) * legendre(l, m, ct) * side;
			return [psi * psi, psi >= 0 ? 1 : -1];
		}
		// u = x, v = y, θ = 90°: the density doesn't depend on φ, a ring; ψ's real part goes as cos mφ
		const amp = radial(n, l, r) * legendre(l, m, 0);
		return [amp * amp, amp * Math.cos(m * Math.atan2(v, u)) >= 0 ? 1 : -1];
	}

	// the exact mean distance, and the most likely one for l = n − 1
	const meanRadius = (n, l) => 0.5 * (3 * n * n - l * (l + 1));

	// the radius (Bohr radii) within which the radial probability reaches `p`
	function radiusHolding (n, l, p) {
		let total = 0, r = 0;
		const dr = 0.01 * n;
		for (; r < 200; r += dr) total += (r + dr / 2) ** 2 * radial(n, l, r + dr / 2) ** 2 * dr;
		let acc = 0;
		for (r = 0; r < 200; r += dr) {
			acc += (r + dr / 2) ** 2 * radial(n, l, r + dr / 2) ** 2 * dr;
			if (acc >= p * total) return r + dr;
		}
		return r;
	}

	// mulberry32: seeded, so a run can be repeated
	function random (seed) {
		let s = seed >>> 0;
		return () => {
			s = (s + 0x6d2b79f5) >>> 0;
			let t = s;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	// a deck of states still to show, shared by successive instances
	let deck = [], stories = [];
	const deal = (d, n) => {
		if (!d.length) {
			for (let i = 0; i < n; i++) d.push(i);
			for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
		}
		return d.shift();
	};

	class Orbital {
		// orbitalSeconds: the exposure; orbitalRate: measurements per second;
		// state: [n, l, m] to show this one; grid: resolution of the density table
		constructor ({ orbitalSeconds = 22, orbitalRate = 16000, state, seed = Math.floor(Math.random() * 2 ** 32), grid = 320 } = {}) {
			const want = state && STATES.find((s) => s.n === state[0] && s.l === state[1] && s.m === state[2]);
			this.state = want || STATES[deal(deck, STATES.length)];
			this.story = STORIES[deal(stories, STORIES.length)];
			this.seconds = orbitalSeconds;
			this.rate = orbitalRate;
			this.rnd = random(seed);
			const { n, l } = this.state;
			// the half-width of the picture, in Bohr radii: 99.5% of the radial probability inside
			this.L = radiusHolding(n, l, 0.995) * 1.02;
			this.buildTables(grid);
			this.pos = new Uint32Array(C * C);   // dots per cell, where ψ > 0
			this.neg = new Uint32Array(C * C);   // and where ψ < 0
			this.t = 0;
			this.measured = 0;   // dots
			this.rSum = 0;       // distances sampled for the readout, and their count
			this.rCount = 0;
			this.resting = false;
			this.info = this.buildInfo();
		}

		// |ψ|² on a grid over the picture, and its running sum, to draw dots from; the sign of ψ in
		// each cell; and the radial distribution's running sum, to draw distances from
		buildTables (G) {
			const { L, state } = this, cell = (2 * L) / G;
			this.G = G;
			this.cdf = new Float64Array(G * G);
			this.sign = new Int8Array(G * G);
			let acc = 0;
			for (let j = 0; j < G; j++) {
				for (let i = 0; i < G; i++) {
					const u = -L + (i + 0.5) * cell, v = -L + (j + 0.5) * cell, [d, sign] = inPlane(state, u, v);
					acc += d;
					this.cdf[j * G + i] = acc;
					this.sign[j * G + i] = sign;
				}
			}
			const R = 4000, rMax = L * 1.5;
			this.rGrid = new Float64Array(R);
			this.rCdf = new Float64Array(R);
			let racc = 0;
			for (let k = 0; k < R; k++) {
				const r = ((k + 0.5) / R) * rMax;
				racc += r * r * radial(state.n, state.l, r) ** 2;
				this.rGrid[k] = r;
				this.rCdf[k] = racc;
			}
		}

		// one measurement in the plane, counted in its cell of the picture
		measure () {
			const { cdf, G } = this, x = this.rnd() * cdf[cdf.length - 1];
			let lo = 0, hi = cdf.length - 1;
			while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < x) lo = mid + 1; else hi = mid; }
			// a point uniformly within the density table's cell, then the picture's cell it falls in
			const i = lo % G, j = (lo - i) / G;
			const ci = Math.min(C - 1, Math.floor(((i + this.rnd()) / G) * C));
			const cj = Math.min(C - 1, Math.floor(((G - j - this.rnd()) / G) * C)); // rows go down, v up
			if (this.sign[lo] > 0) this.pos[cj * C + ci]++; else this.neg[cj * C + ci]++;
		}

		// one distance from the radial distribution r² R²
		sampleRadius () {
			const { rCdf, rGrid } = this, x = this.rnd() * rCdf[rCdf.length - 1];
			let lo = 0, hi = rCdf.length - 1;
			while (lo < hi) { const mid = (lo + hi) >> 1; if (rCdf[mid] < x) lo = mid + 1; else hi = mid; }
			return rGrid[lo];
		}

		step (dt) {
			if (this.resting) return;
			this.t += dt;
			const due = Math.floor(Math.max(0, Math.min(this.t, FADE + this.seconds) - FADE) * this.rate);
			for (let k = this.measured; k < due; k++) {
				this.measure();
				this.rSum += this.sampleRadius();
				this.rCount++;
			}
			this.measured = Math.max(this.measured, due);
		}

		layout (w, h) {
			if (this.w0 === w && this.h0 === h) return;
			this.w0 = w; this.h0 = h;
			const V = (this.V = Math.round(Math.min(w, h) * MARGIN));
			this.ox = Math.round((w - V) / 2); this.oy = Math.round((h - V) / 2);
			this.lastColour = -Infinity;
			this.faded = false;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			// Bohr's circle fades in first, on its own
			if (!this.faded) {
				this.drawCircle(ctx, Math.min(1, this.t / FADE));
				this.faded = this.t >= FADE;
			}
			const done = this.t >= FADE + this.seconds;
			if (this.t >= FADE && (this.t - this.lastColour >= REFRESH || done)) {
				this.lastColour = this.t;
				this.colour(ctx);
			}
			if (done) this.resting = true;
		}

		// Bohr's orbit for the same n, dashed: n² a₀
		drawCircle (ctx, alpha) {
			const { ox, oy, V, L } = this, { n } = this.state, r = ((n * n) / (2 * L)) * V;
			ctx.save();
			ctx.fillStyle = "#000";
			ctx.fillRect(ox, oy, V, V);
			if (r < V / 2) {
				ctx.globalAlpha = 0.55 * alpha;
				ctx.strokeStyle = "#9aa4b0";
				ctx.lineWidth = 1.2;
				ctx.setLineDash([4, 6]);
				ctx.beginPath();
				ctx.arc(ox + V / 2, oy + V / 2, r, 0, 2 * Math.PI);
				ctx.stroke();
			}
			ctx.restore();
		}

		// the counts as colour: warm where ψ > 0, cool where ψ < 0, brightness by the log of the
		// count against the busiest pixel's, so the picture develops like a long exposure; and
		// Bohr's circle over it
		colour (ctx) {
			const { pos, neg } = this;
			if (!this.img) {
				this.off = document.createElement("canvas");
				this.off.width = this.off.height = C;
				this.offCtx = this.off.getContext("2d");
				this.img = this.offCtx.createImageData(C, C);
				this.px = new Uint32Array(this.img.data.buffer);
			}
			let max = 1;
			for (let k = 0; k < C * C; k++) max = Math.max(max, pos[k] + neg[k]);
			const lut = new Float32Array(Math.min(max, 65535) + 1);
			const scale = 1 / Math.log1p(max);
			for (let c = 0; c < lut.length; c++) lut[c] = Math.min(1, Math.log1p(c) * scale) ** 0.85;
			const px = this.px;
			for (let k = 0; k < C * C; k++) {
				const p = pos[k], q = neg[k], c = p + q;
				if (!c) { px[k] = 0xff000000; continue; }
				const b = lut[Math.min(c, lut.length - 1)], f = p / c;
				const r = (WARM[0] * f + COOL[0] * (1 - f)) * b, g = (WARM[1] * f + COOL[1] * (1 - f)) * b, bl = (WARM[2] * f + COOL[2] * (1 - f)) * b;
				px[k] = (255 << 24) | ((bl & 255) << 16) | ((g & 255) << 8) | (r & 255);
			}
			this.offCtx.putImageData(this.img, 0, 0);
			ctx.save();
			ctx.globalAlpha = 1;
			ctx.imageSmoothingEnabled = true;
			ctx.drawImage(this.off, this.ox, this.oy, this.V, this.V);
			ctx.restore();
			this.drawCircleOver(ctx);
		}

		// the dashed circle again, on top of the dots, over a dark line so it shows on bright ones
		drawCircleOver (ctx) {
			const { ox, oy, V, L } = this, { n } = this.state, r = ((n * n) / (2 * L)) * V;
			if (r >= V / 2) return;
			ctx.save();
			ctx.beginPath();
			ctx.arc(ox + V / 2, oy + V / 2, r, 0, 2 * Math.PI);
			ctx.setLineDash([5, 5]);
			ctx.globalAlpha = 0.6;
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 3.5;
			ctx.stroke();
			ctx.globalAlpha = 0.8;
			ctx.strokeStyle = "#dfe6ee";
			ctx.lineWidth = 1.3;
			ctx.stroke();
			ctx.restore();
		}

		name () {
			const { n, l, m } = this.state;
			return `${n}${LETTERS[l]}${m ? `, m = ${m}` : ""}`;
		}

		buildInfo () {
			const { n, l, m, plane } = this.state, E = 13.605693 / (n * n);
			const circular = plane === "xy";
			const nodes = `${n - l - 1} radial node${n - l - 1 === 1 ? "" : "s"}, ${l} angular`;
			const where = circular
				? `seen from above, in the plane it circles in: a ring whose most likely radius, n²a₀ = ${n * n} a₀, is exactly Bohr's orbit (dashed); the colours are ψ's real part, whose phase winds ${m} times round`
				: `in a slice through the nucleus, the z axis upright; dashed, Bohr's orbit for the same energy, n²a₀ = ${n * n} a₀`;
			return {
				title: `The quantum atom <span class="chaos-symbol">hydrogen, ${this.name()}</span>`,
				subtitle: `the state |n l m⟩ = |${n} ${l} ${m}⟩ · each dot one measurement of where the electron is, ${where}`,
				equations: [
					"ψ<sub>nlm</sub> = R<sub>nl</sub>(r) Y<sub>l</sub><sup>m</sup>(θ, φ), &nbsp; |ψ|² = how likely the electron is to be found there",
					`E = −13.6 eV / n² = −${E < 1 ? E.toFixed(3) : E.toFixed(2)} eV, as in Bohr's model; ${nodes}`,
					`<span class="chaos-note">${this.story}</span>`
				]
			};
		}

		readout () {
			const { n, l } = this.state, exact = meanRadius(n, l);
			const width = 2 * this.L * 0.0529177;
			const mean = this.rCount ? (this.rSum / this.rCount).toFixed(2) : "–";
			return `measurements ${this.measured.toLocaleString("en")}    the square is ${(2 * this.L).toFixed(0)} a₀ = ${width.toFixed(1)} nm across\n` +
				`mean distance ${mean} a₀    exact ⟨r⟩ = ½(3n² − l(l+1)) a₀ = ${exact} a₀`;
		}
	}

	Orbital.STATES = STATES;
	Orbital.laguerre = laguerre;
	Orbital.legendre = legendre;
	Orbital.radial = radial;
	Orbital.inPlane = inPlane;
	Orbital.meanRadius = meanRadius;
	Orbital.info = { title: "The quantum atom", equations: [] };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.orbital = Orbital;
	if (typeof module !== "undefined") module.exports = { Orbital };
})(typeof window !== "undefined" ? window : globalThis);

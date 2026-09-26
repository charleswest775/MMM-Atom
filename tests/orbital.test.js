// Checks for the quantum atom: hydrogen's wavefunctions against textbook results, and Born's rule
// in the sampling. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Orbital } = require("../simulations/orbital.js");

const close = (a, b, tol) => Math.abs(a - b) <= tol;
// ∫ f(r) dr from 0 to rMax, midpoint rule
const integrate = (f, rMax, steps = 20000) => {
	let s = 0;
	const h = rMax / steps;
	for (let k = 0; k < steps; k++) s += f((k + 0.5) * h) * h;
	return s;
};

test("Laguerre and Legendre polynomials have their textbook values", () => {
	for (const x of [0, 0.3, 1.7, 5]) {
		for (const a of [1, 3, 5]) {
			assert.ok(close(Orbital.laguerre(1, a, x), 1 + a - x, 1e-12));
			assert.ok(close(Orbital.laguerre(2, a, x), (x * x - 2 * (a + 2) * x + (a + 1) * (a + 2)) / 2, 1e-12));
		}
	}
	for (const x of [-0.9, -0.2, 0, 0.5, 1]) {
		assert.ok(close(Orbital.legendre(2, 0, x), (3 * x * x - 1) / 2, 1e-12));
		assert.ok(close(Orbital.legendre(1, 1, x), -Math.sqrt(1 - x * x), 1e-12));
		assert.ok(close(Orbital.legendre(3, 0, x), (5 * x ** 3 - 3 * x) / 2, 1e-12));
	}
	assert.strictEqual(Orbital.legendre(3, 3, 0), -15);
});

test("the radial functions are normalised, orthogonal, and have n − l − 1 nodes", () => {
	assert.ok(close(Orbital.radial(1, 0, 0.7), 2 * Math.exp(-0.7), 1e-12), "R₁₀ = 2e^−r");
	for (let n = 1; n <= 6; n++) {
		for (let l = 0; l < n; l++) {
			const rMax = 12 * n * n + 20;
			const norm = integrate((r) => (r * Orbital.radial(n, l, r)) ** 2, rMax);
			assert.ok(close(norm, 1, 1e-6), `∫R²r² for n = ${n}, l = ${l}: ${norm}`);
			// nodes: sign changes of R away from the origin
			let nodes = 0, prev = Orbital.radial(n, l, 1e-3);
			for (let r = 0.01; r < rMax; r += 0.01) {
				const v = Orbital.radial(n, l, r);
				if (v * prev < 0) nodes++;
				if (v !== 0) prev = v;
			}
			assert.strictEqual(nodes, n - l - 1, `nodes of R${n}${l}`);
			if (n > l + 1) {
				const overlap = integrate((r) => r * r * Orbital.radial(n, l, r) * Orbital.radial(n - 1, l, r), rMax);
				assert.ok(Math.abs(overlap) < 1e-6, `R${n}${l} ⟂ R${n - 1}${l}`);
			}
		}
	}
});

test("⟨r⟩ = ½(3n² − l(l+1)) a₀, and for l = n − 1 the most likely distance is Bohr's n²a₀", () => {
	for (let n = 1; n <= 6; n++) {
		for (let l = 0; l < n; l++) {
			const mean = integrate((r) => r ** 3 * Orbital.radial(n, l, r) ** 2, 12 * n * n + 20);
			assert.ok(close(mean, Orbital.meanRadius(n, l), 1e-5), `⟨r⟩ for ${n}${l}: ${mean}`);
		}
		// the peak of r²R² for the circular state
		let best = 0, at = 0;
		for (let r = 0.001; r < 3 * n * n; r += 0.001) {
			const p = (r * Orbital.radial(n, n - 1, r)) ** 2;
			if (p > best) { best = p; at = r; }
		}
		assert.ok(close(at, n * n, 0.002), `most likely r for n = ${n}: ${at}`);
	}
});

test("the pictures have the right nodes: p_z has none in the plane z = 0, d_z² has cones at 54.7°", () => {
	const pz = { n: 2, l: 1, m: 0, plane: "xz" }, dz = { n: 3, l: 2, m: 0, plane: "xz" };
	for (const x of [0.5, 1, 3]) assert.ok(Orbital.inPlane(pz, x, 0)[0] < 1e-30, "p_z at z = 0");
	const theta = Math.acos(1 / Math.sqrt(3));
	for (const r of [1, 2, 5]) {
		assert.ok(Orbital.inPlane(dz, r * Math.sin(theta), r * Math.cos(theta))[0] < 1e-25, "d_z² on its cone");
		// lobes of opposite sign above and around
		assert.ok(Orbital.inPlane(dz, 0, r)[1] !== Orbital.inPlane(dz, r, 0)[1]);
	}
	// a circular state's density in its plane is a ring: the same all the way round
	const ring = { n: 4, l: 3, m: 3, plane: "xy" };
	const d0 = Orbital.inPlane(ring, 16, 0)[0];
	for (let a = 0; a < 2 * Math.PI; a += 0.3) assert.ok(close(Orbital.inPlane(ring, 16 * Math.cos(a), 16 * Math.sin(a))[0], d0, d0 * 1e-12));
});

test("measurements follow Born's rule: their mean distance converges on ⟨r⟩", () => {
	for (const state of [[1, 0, 0], [3, 2, 1], [5, 4, 4]]) {
		const o = new Orbital({ state, seed: 5, orbitalSeconds: 10, orbitalRate: 20000 });
		while (o.t < 12) o.step(1 / 12);
		const mean = o.rSum / o.rCount, exact = Orbital.meanRadius(state[0], state[1]);
		assert.ok(o.rCount >= 200000 && close(mean, exact, exact * 0.005), `${state}: ${mean} vs ${exact}`);
		// every measurement was counted in the picture
		let dots = 0;
		for (let k = 0; k < o.pos.length; k++) dots += o.pos[k] + o.neg[k];
		assert.strictEqual(dots, o.measured);
		assert.ok(!/NaN|undefined|Infinity/.test(o.readout() + o.info.subtitle + o.info.equations.join("")));
	}
});

test("each showing brings the next state of a shuffled deck, all before any repeats", () => {
	const seen = new Set();
	for (let k = 0; k < Orbital.STATES.length; k++) {
		const o = new Orbital({ grid: 16 });
		seen.add(`${o.state.n}${o.state.l}${o.state.m}${o.state.plane}`);
	}
	assert.strictEqual(seen.size, Orbital.STATES.length);
});

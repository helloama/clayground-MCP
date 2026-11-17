/**
 * An agent sculpts a stylized designer-toy figure through window.clayground:
 * a big head with sleepy half-lidded eyes, a blunt bob with coil buns, an
 * oversized hoodie with puffy checkered sleeves, chunky sneakers and a
 * keychain. It is a recipe for characters of this kind: every part sits on a
 * layer fine enough for its detail, and everything that has to touch the skin
 * is placed on the skin the door reports, not on a guess.
 *
 *   CLAYGROUND_URL=http://localhost:3000/sculpt node examples/designer-figure.mjs
 *
 * Pictures land in ~/clayground-agent (or CLAYGROUND_OUT). STOP=n stops after
 * stage n (1 hoodie, 2 head, 3 hair, 4 sleeves, 5 face, 6 shoes, 7 trims,
 * 8 finish and a head turn).
 *
 * What it shows that the other examples do not:
 *   - tube placement and a checker pick: squares that wrap a bent sleeve;
 *   - layer pose with a pivot: the head layers turn together on the neck;
 *   - clayground.nearest: strings, seams and a patch laid on the real skin;
 *   - posed finer layers (scale 0.19 to 0.42) for lashes, lettering-size
 *     details and thin parts, and 12 layers as the ceiling.
 */
import { openStudio } from "../page.mjs";

const studio = await openStudio({ height: 900 });
const say = (m) => console.log(m);
const STOP = Number(process.env.STOP || 99);
const must = (r, what) => {
  if (!r.ok)
    throw new Error(
      `${what}: ${JSON.stringify(r.error ?? r.results?.find((x) => !x.ok))}`,
    );
  return r;
};
const run = async (what, ops) => {
  const r = must(await studio.run(ops), what);
  say(`${what}: ${ops.length} ops, ${r.state.triangles} triangles`);
  return r;
};
const layer = (action, extra = {}) => ({ do: "layer", action, ...extra });
const pick = (name) => layer("select", { layer: name });
const V = (azimuth, elevation = 10) => ({ azimuth, elevation });
const shot = async (name, o = {}) => {
  const r = await studio.look({ views: [V(25, 10)], size: 800, ...o });
  say(`${name}: ${r.files[0]}`);
  return r;
};
const TAU = Math.PI * 2;
const add3 = (a, b) => a.map((v, i) => v + b[i]);
const mul3 = (a, k) => a.map((v) => v * k);

/** A point on an ellipsoid (center C, radii RAD) in direction dir, lifted along the normal. */
const onEll = (C, RAD, dir, lift = 0) => {
  const n = Math.hypot(dir[0] / RAD[0], dir[1] / RAD[1], dir[2] / RAD[2]);
  const p = dir.map((v, i) => C[i] + v / n);
  const nn = dir.map((v, i) => v / RAD[i]);
  const m = Math.hypot(...nn);
  return p.map((v, i) => v + (nn[i] / m) * lift);
};
/** A finish mix names all seven keys. */
const wet = (o = {}) => ({
  roughness: 0.14,
  metalness: 0,
  glow: 0,
  grain: 0,
  edge: 0.1,
  tint: "#ffffff",
  tintMix: 0,
  ...o,
});
/** A new layer by name; an older one of that name goes once the new one stands. */
const fresh = async (name, detail = 96, pose = null) => {
  const st = await studio.call("state");
  const old = st.layers.find((l) => l.name === name);
  if (old)
    await run(`old ${name}`, [layer("rename", { layer: name, name: "OLD" })]);
  const ops = [layer("add", { detail }), layer("rename", { name })];
  if (pose) ops.push(layer("pose", pose));
  await run(`add ${name}`, ops);
  if (old)
    await run(`drop ${name}`, [layer("delete", { layer: "OLD" }), pick(name)]);
};
/** Skin points of a layer nearest to the given points, lifted along the normal. */
const skinNear = async (name, qs, lift = 0) => {
  const r = await studio.call("nearest", qs, {
    layer: name,
    space: "world",
    within: 2,
  });
  return r.hits.map((h) => h.at.map((v, i) => v + h.normal[i] * lift));
};
/** Skin points seen from the front: ask from just in front of the figure. */
const onSkin = (name, pts, lift = 0, z = 0.45) =>
  skinNear(
    name,
    pts.map((p) => [p[0], p[1], z]),
    lift,
  );
/** A spiral that winds out from the middle and rises into a dome. */
const coilPath = (c, r0, r1, turns, rise, n = 56, start = 0) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = start + turns * TAU * t;
    const r = r0 + (r1 - r0) * t;
    return [
      c[0] + r * Math.cos(a),
      c[1] + r * Math.sin(a),
      c[2] + rise * (1 - t),
    ];
  });
/** A closed oval ring of clay: a torus is always round. */
const ring = (c, rx, rz, tube, color, blend = 0.04, n = 36) => ({
  do: "sweep",
  space: "world",
  color,
  blend,
  radius: tube,
  end: "ball",
  path: Array.from({ length: n + 2 }, (_, i) => {
    const a = (i / n) * TAU;
    return [c[0] + rx * Math.cos(a), c[1], c[2] + rz * Math.sin(a)];
  }),
});

// brand-flat colors: a few big areas, pale skin, one accent
const VIOLET = "#6741d9",
  FIELD = "#4527a8",
  LAV = "#c9aff4",
  MINT = "#9ce1bd";
const BEAD = "#f6dc8f",
  ROSE = "#efa4bf",
  INK = "#17131c",
  LILAC = "#efe8ff";
const BUTTER = "#ffd65a",
  SKIN = "#f6d3cc",
  SKIN2 = "#eeb9b8",
  HAIR = "#f5dc8e";
const POCKET = "#5732c4";

await studio.call("new", { detail: 96 });
await studio.call("backdrop", "#ece4ff");
await studio.call("look", { look: "glossy", light: "studio" });

// 1. the hoodie, the legs and socks
await run("rename", [layer("rename", { name: "Hoodie" })]);
await run("hoodie", [
  {
    do: "shape",
    shape: "sphere",
    at: [0, -0.16, 0],
    size: [0.4, 0.27, 0.29],
    color: VIOLET,
    blend: 0.12,
  },
  {
    do: "shape",
    shape: "sphere",
    at: [0, -0.3, 0],
    size: [0.43, 0.16, 0.3],
    color: VIOLET,
    blend: 0.12,
  },
  {
    do: "shape",
    shape: "sphere",
    at: [0, 0.02, 0],
    size: [0.34, 0.14, 0.24],
    color: VIOLET,
    blend: 0.12,
  },
  {
    do: "shape",
    shape: "box",
    mode: "cut",
    at: [0, -0.55, 0],
    size: [0.7, 0.14, 0.5],
    chamfer: true,
    blend: 0.01,
  },
  ring([0, -0.395, 0], 0.337, 0.238, 0.04, FIELD, 0.05), // hem band
  ring([0, 0.07, 0], 0.215, 0.17, 0.068, FIELD, 0.05), // the hood, rolled down
  {
    do: "shape",
    shape: "sphere",
    at: [0, 0.09, -0.16],
    size: [0.2, 0.12, 0.1],
    color: FIELD,
    blend: 0.08,
  },
]);
await run("legs", [
  ...[1, -1].flatMap((s) => [
    {
      do: "shape",
      shape: "cylinder",
      at: [s * 0.13, -0.6, 0],
      size: [0.05, 0.2, 0.05],
      color: SKIN,
      blend: 0.05,
    },
    {
      do: "shape",
      shape: "cylinder",
      at: [s * 0.13, -0.69, 0],
      size: [0.058, 0.085, 0.058],
      color: "#ffffff",
      blend: 0.03,
    },
    {
      do: "shape",
      shape: "cylinder",
      at: [s * 0.13, -0.63, 0],
      size: [0.06, 0.02, 0.06],
      color: ROSE,
      blend: 0.02,
    },
  ]),
]);
await shot("1 hoodie", { views: [V(0, 8), V(40, 10)], grid: true });
if (STOP <= 1) process.exit(0);

// 2. the head
await run("head", [
  layer("add", { detail: 96 }),
  layer("rename", { name: "Head" }),
  {
    do: "shape",
    shape: "sphere",
    at: [0, 0.42, 0],
    size: [0.38, 0.33, 0.34],
    color: SKIN,
    blend: 0.1,
  },
  {
    do: "shape",
    shape: "sphere",
    at: [0.2, 0.3, 0.1],
    size: [0.17, 0.12, 0.2],
    color: SKIN,
    blend: 0.1,
    mirror: "x",
  },
  {
    do: "shape",
    shape: "cylinder",
    at: [0, 0.14, 0],
    size: [0.07, 0.1, 0.07],
    color: SKIN,
    blend: 0.05,
  },
  layer("relax"),
]);
if (STOP <= 2) {
  await shot("2 head", { views: [V(0, 8), V(40, 10)], grid: true });
  process.exit(0);
}

// 3. the bob: a cap, a window for the face, blunt bangs that flow down from
// the crown, and a pair of coil buns on a finer layer
const HC = [0, 0.45, -0.02],
  HR = [0.415, 0.37, 0.375];
const bangs = [];
const N = 9;
for (let i = 0; i < N; i++) {
  const f = (i - (N - 1) / 2) / ((N - 1) / 2);
  const th = (f * 52 * Math.PI) / 180;
  const sx = Math.sin(th),
    cz = Math.cos(th);
  const a = onEll(HC, HR, [sx * 0.7, 0.62, cz * 0.7]);
  const b = onEll(HC, HR, [sx * 0.95, 0.24, cz * 0.95], 0.012);
  const e = onEll(HC, HR, [sx, 0, cz], 0.022);
  e[1] = 0.462 - 0.012 * Math.abs(f) + 0.008 * Math.sin(i * 2.3);
  e[0] += sx * 0.012;
  bangs.push({
    do: "sweep",
    space: "world",
    path: [a, b, e],
    radius: [0.05, 0.047, 0.034],
    color: HAIR,
    blend: 0.04,
    end: "ball",
  });
}
const side = (s) => ({
  do: "sweep",
  space: "world",
  path: [
    [s * 0.37, 0.52, 0.06],
    [s * 0.405, 0.36, 0.09],
    [s * 0.39, 0.2, 0.08],
    [s * 0.36, 0.13, 0.07],
  ],
  radius: [0.062, 0.056, 0.044, 0.026],
  color: HAIR,
  blend: 0.05,
  end: "ball",
});
await run("hair", [
  layer("add", { detail: 96 }),
  layer("rename", { name: "Hair" }),
  { do: "shape", shape: "sphere", at: HC, size: HR, color: HAIR, blend: 0.1 },
  {
    do: "shape",
    shape: "sphere",
    at: [0, 0.3, -0.05],
    size: [0.405, 0.27, 0.34],
    color: HAIR,
    blend: 0.1,
  },
  {
    do: "shape",
    shape: "sphere",
    mode: "cut",
    at: [0, 0.3, 0.36],
    size: [0.3, 0.265, 0.28],
    blend: 0.02,
  },
  ...bangs,
  side(1),
  side(-1),
  layer("relax"),
]);
// a spiral bun mirrors by turning the other way and starting half a turn on
const bun = (s) => ({
  do: "sweep",
  space: "world",
  path: coilPath(
    [s * 0.27, 0.8, 0],
    0.012,
    0.105,
    s * 1.65,
    0.06,
    64,
    s > 0 ? 0 : Math.PI,
  ),
  radius: 0.03,
  color: HAIR,
  blend: 0.02,
  end: "ball",
});
await run("buns", [
  layer("add", { detail: 96 }),
  layer("rename", { name: "Buns" }),
  layer("pose", { position: [0, 0.78, 0], scale: 0.4 }),
  ...[1, -1].flatMap((s) => [
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: [s * 0.27, 0.78, -0.01],
      size: [0.04, 0.04, 0.05],
      color: HAIR,
      blend: 0.03,
    },
    {
      do: "shape",
      space: "world",
      shape: "torus",
      at: [s * 0.27, 0.72, -0.01],
      size: [0.06, 0.02, 0.05],
      color: MINT,
      blend: 0.02,
    },
  ]),
  bun(1),
  bun(-1),
]);
if (STOP <= 3) {
  await shot("3 hair", {
    views: [V(0, 8), V(40, 12), V(180, 8)],
    grid: true,
    focus: { at: [0, 0.5, 0], radius: 0.6 },
  });
  process.exit(0);
}

// 4. the sleeves: a sweep with a swelling radius, a cuff, then the checker
// painted as boxes dealt out round the tube, light and dark by row plus column
const K = 0.42,
  P = [0.5, -0.2, 0.05];
const path = [
  [0.3, 0.05, 0],
  [0.43, -0.02, 0.02],
  [0.52, -0.2, 0.05],
  [0.53, -0.4, 0.08],
];
const radius = [0.1, 0.14, 0.16, 0.135];
await run("sleeve", [
  layer("add", { detail: 128 }),
  layer("rename", { name: "Sleeve R" }),
  layer("pose", { position: P, scale: K }),
  { do: "sweep", space: "world", path, radius, color: LILAC, blend: 0.05 },
  {
    do: "shape",
    space: "world",
    shape: "torus",
    at: [0.535, -0.45, 0.083],
    size: [0.125, 0.034, 0.125],
    color: FIELD,
    blend: 0.03,
  },
  {
    do: "shape",
    space: "world",
    shape: "sphere",
    at: [0.535, -0.54, 0.1],
    size: [0.045, 0.058, 0.04],
    color: SKIN,
    blend: 0.03,
  },
]);
const checker = await run("checker", [
  {
    do: "array",
    space: "world",
    item: {
      do: "shape",
      shape: "box",
      mode: "paint",
      size: [0.0185, 0.0185, 0.07],
      blend: 0,
    },
    place: { tube: { path, radius, rows: 7, cols: 26, from: 0.43, to: 0.8 } },
    color: [LILAC, INK],
    pick: "checker",
  },
]);
say(`checker cells: ${checker.results[0].made}`);
await run("sleeve L", [
  layer("mirror", { layer: "Sleeve R" }),
  layer("rename", { name: "Sleeve L" }),
]);
if (STOP <= 4) {
  await shot("4 sleeves", {
    views: [V(0, 8), V(50, 10)],
    grid: true,
    focus: { at: [0, -0.1, 0.05], radius: 0.75 },
  });
  process.exit(0);
}

// 5. the face on one fine layer: each eye is an iris, a pupil, two glints, a
// lid of skin laid over the top and a lash line; then the mouth and the blush
const eye = (s) => {
  const c = [s * 0.155, 0.335, 0.318];
  const r3 = (p) => [c[0] + s * p[0], c[1] + p[1], c[2] + p[2]];
  const lash = [
    [-0.066, 0.016, 0],
    [-0.035, 0, 0.027],
    [0.015, -0.004, 0.039],
    [0.058, 0.008, 0.022],
    [0.082, 0.03, 0],
  ].map(r3);
  return [
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: c,
      size: [0.056, 0.066, 0.034],
      turn: [0, 8 * s, 0],
      color: LAV,
      blend: 0.02,
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: r3([0.005, -0.006, 0.014]),
      size: [0.033, 0.042, 0.03],
      color: INK,
      blend: 0.02,
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: r3([-0.017, -0.004, 0.04]),
      size: 0.012,
      color: "#ffffff",
      blend: 0.015,
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: r3([0.018, -0.026, 0.034]),
      size: 0.007,
      color: "#ffffff",
      blend: 0.01,
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: r3([0, 0.043, 0.012]),
      size: [0.068, 0.036, 0.04],
      turn: [0, 0, -6 * s],
      color: SKIN,
      blend: 0.03,
    },
    {
      do: "sweep",
      space: "world",
      path: lash,
      radius: 0.0075,
      color: INK,
      blend: 0.01,
    },
  ];
};
await run("face", [
  layer("add", { detail: 128 }),
  layer("rename", { name: "Face" }),
  layer("pose", { position: [0, 0.33, 0.3], scale: 0.3 }),
  ...eye(1),
  ...eye(-1),
  {
    do: "sweep",
    space: "world",
    path: [
      [-0.042, 0.238, 0.326],
      [-0.022, 0.222, 0.334],
      [0, 0.236, 0.336],
    ],
    radius: 0.0062,
    color: INK,
    blend: 0.01,
  },
  {
    do: "sweep",
    space: "world",
    path: [
      [0, 0.236, 0.336],
      [0.022, 0.222, 0.334],
      [0.042, 0.238, 0.326],
    ],
    radius: 0.0062,
    color: INK,
    blend: 0.01,
  },
  {
    do: "shape",
    space: "world",
    shape: "sphere",
    at: [0, 0.272, 0.333],
    size: [0.014, 0.01, 0.012],
    color: SKIN2,
    blend: 0.01,
  },
]);
// paint only touches the layer's own clay, so the blush goes on the head
await run("blush", [
  pick("Head"),
  ...[1, -1].map((s) => ({
    do: "shape",
    space: "world",
    shape: "sphere",
    mode: "paint",
    at: [s * 0.2, 0.275, 0.31],
    size: [0.055, 0.03, 0.04],
    color: ROSE,
    blend: 0.03,
  })),
]);
if (STOP <= 5) {
  await shot("5 face", {
    views: [V(0, 4), V(30, 6)],
    grid: true,
    size: 1000,
    focus: { at: [0, 0.32, 0.3], radius: 0.3 },
  });
  process.exit(0);
}

// 6. both sneakers on one layer: a rounded sole with a flat floor and an air
// window, an upper, a toe cap, a heel counter, a collar, a tongue and laces
const shoe = (X) => {
  // the top of the upper at a spot, so the laces lie on it
  const top = (dx, z) =>
    -0.86 +
    0.08 *
      Math.sqrt(Math.max(0, 1 - (dx / 0.092) ** 2 - ((z - 0.04) / 0.14) ** 2));
  const laces = [0.075, 0.105, 0.135].map((z) =>
    [-0.05, -0.025, 0, 0.025, 0.05].map((dx) => [
      X + dx,
      top(dx, z) + 0.004,
      z,
    ]),
  );
  return [
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: [X, -0.945, 0.05],
      size: [0.106, 0.05, 0.19],
      color: "#ffffff",
      blend: 0.03,
    },
    {
      do: "shape",
      space: "world",
      shape: "box",
      mode: "cut",
      at: [X, -1.1, 0.05],
      size: [0.25, 0.14, 0.25],
      blend: 0.005,
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      mode: "cut",
      at: [X, -0.935, -0.065],
      size: [0.2, 0.012, 0.04],
      blend: 0.01,
    },
    ring([X, -0.935, 0.05], 0.098, 0.182, 0.012, MINT, 0.01),
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: [X, -0.86, 0.04],
      size: [0.092, 0.08, 0.14],
      color: LAV,
      blend: 0.05,
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: [X, -0.885, 0.125],
      size: [0.09, 0.064, 0.085],
      color: LILAC,
      blend: 0.04,
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: [X, -0.84, -0.088],
      size: [0.07, 0.05, 0.032],
      color: MINT,
      blend: 0.03,
    },
    {
      do: "shape",
      space: "world",
      shape: "torus",
      at: [X, -0.79, 0],
      size: [0.072, 0.022, 0.072],
      color: LILAC,
      blend: 0.03,
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: [X, -0.795, 0.07],
      size: [0.05, 0.03, 0.06],
      color: LILAC,
      blend: 0.03,
    },
    ...laces.map((p) => ({
      do: "sweep",
      space: "world",
      path: p,
      radius: 0.008,
      color: "#ffffff",
      blend: 0.01,
      end: "ball",
    })),
  ];
};
await run("shoes", [
  layer("add", { detail: 96 }),
  layer("rename", { name: "Shoes" }),
  layer("pose", { position: [0, -0.86, 0.05], scale: 0.36 }),
  ...shoe(0.13),
  ...shoe(-0.13),
]);
if (STOP <= 6) {
  await shot("6 shoes", {
    views: [V(0, 8), V(60, 10)],
    grid: true,
    size: 800,
    focus: { at: [0, -0.8, 0.05], radius: 0.5 },
  });
  process.exit(0);
}

// 7. the trims, each on a fine layer of its own and laid on the real skin:
// the pocket seams and drawstrings, a patch, and a keychain
const line = (a, b, n = 6) =>
  Array.from({ length: n }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / (n - 1),
    a[1] + ((b[1] - a[1]) * i) / (n - 1),
    0,
  ]);
const strings = (x, splay) =>
  onSkin(
    "Hoodie",
    [-0.012, -0.05, -0.09, -0.13, -0.17].map((y, i) => [x + splay * i, y, 0]),
    0.012,
  );
const [sL, sR] = [await strings(-0.06, -0.009), await strings(0.06, 0.009)];
const seam = (a, b, n) => onSkin("Hoodie", line(a, b, n), 0.004);
const [top, left, right] = [
  await seam([-0.235, -0.225], [0.235, -0.225], 9),
  await seam([-0.235, -0.225], [-0.15, -0.365], 6),
  await seam([0.235, -0.225], [0.15, -0.365], 6),
];
const aglet = (p) => ({
  do: "shape",
  space: "world",
  shape: "cylinder",
  at: [p[0], p[1] - 0.012, p[2]],
  size: [0.0135, 0.024, 0.0135],
  color: MINT,
  blend: 0.01,
});
await run("strings", [
  layer("add", { detail: 96 }),
  layer("rename", { name: "Strings" }),
  layer("pose", { position: [0, -0.12, 0.28], scale: 0.3 }),
  {
    do: "sweep",
    space: "world",
    path: sL,
    radius: 0.0125,
    color: LILAC,
    blend: 0.02,
    end: "ball",
  },
  {
    do: "sweep",
    space: "world",
    path: sR,
    radius: 0.0125,
    color: LILAC,
    blend: 0.02,
    end: "ball",
  },
  aglet(sL[sL.length - 1]),
  aglet(sR[sR.length - 1]),
  ...[top, left, right].map((p) => ({
    do: "sweep",
    space: "world",
    path: p,
    radius: 0.0075,
    color: FIELD,
    blend: 0.01,
    end: "ball",
  })),
]);
{
  // the patch lies along the skin's normal: turn the disc and the spiral with it
  const [p] = await onSkin("Hoodie", [[-0.19, -0.05, 0]]);
  const hit = (
    await studio.call("nearest", [[-0.19, -0.05, 0.45]], {
      layer: "Hoodie",
      space: "world",
      within: 2,
    })
  ).hits[0];
  const n = hit.normal;
  const yaw = Math.atan2(n[0], n[2]);
  const pitch = -Math.atan2(n[1], Math.hypot(n[0], n[2]));
  const rot = (d) => [
    d[0] * Math.cos(yaw) + d[2] * Math.sin(yaw),
    d[1],
    -d[0] * Math.sin(yaw) + d[2] * Math.cos(yaw),
  ];
  const spiral = coilPath([0, 0, 0.014], 0.004, 0.04, 1.7, 0, 48).map((d) =>
    add3(p, rot(d)),
  );
  const deg = 180 / Math.PI;
  await run("patch", [
    layer("add", { detail: 96 }),
    layer("rename", { name: "Patch" }),
    layer("pose", { position: p, scale: 0.14 }),
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: add3(p, mul3(n, -0.004)),
      size: [0.062, 0.062, 0.02],
      turn: [pitch * deg, yaw * deg, 0],
      color: BUTTER,
      blend: 0.02,
    },
    {
      do: "sweep",
      space: "world",
      path: spiral,
      radius: 0.0058,
      color: FIELD,
      blend: 0.01,
      end: "ball",
    },
  ]);
}
{
  const h = [0.262, -0.4, 0.15];
  const beads = Array.from({ length: 7 }, (_, i) => [
    h[0] + 0.008 * i,
    h[1] - 0.05 - 0.04 * i,
    h[2] + 0.008 * i,
  ]);
  const cc = [h[0] + 0.05, -0.77, h[2] + 0.05];
  await run("charm", [
    layer("add", { detail: 96 }),
    layer("rename", { name: "Charm" }),
    layer("pose", { position: [h[0] + 0.02, -0.6, h[2] + 0.03], scale: 0.24 }),
    {
      do: "shape",
      space: "world",
      shape: "torus",
      at: [h[0], h[1] - 0.012, h[2]],
      size: [0.03, 0.007, 0.03],
      turn: [90, 25, 0],
      color: LAV,
      blend: 0.01,
    },
    ...beads.map((b) => ({
      do: "shape",
      space: "world",
      shape: "sphere",
      at: b,
      size: 0.019,
      color: BEAD,
      blend: 0.01,
    })),
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: cc,
      size: [0.05, 0.05, 0.016],
      color: LAV,
      blend: 0.02,
    },
    {
      do: "sweep",
      space: "world",
      path: coilPath([cc[0], cc[1], cc[2] + 0.012], 0.004, 0.036, 1.6, 0, 48),
      radius: 0.0055,
      color: FIELD,
      blend: 0.01,
      end: "ball",
    },
    {
      do: "shape",
      space: "world",
      shape: "sphere",
      at: [cc[0], cc[1] + 0.056, cc[2]],
      size: 0.016,
      color: MINT,
      blend: 0.01,
    },
  ]);
}
if (STOP <= 7) {
  await shot("7 trims", {
    views: [V(0, 8), V(35, 8)],
    grid: true,
    size: 1000,
    focus: { at: [0.05, -0.35, 0.15], radius: 0.55 },
  });
  process.exit(0);
}

// 8. material: fabric matte, vinyl glossy; then the head turns on the neck,
// the four head layers swinging about one point
const finish = (names, o) =>
  names.map((n) => layer("finish", { layer: n, finish: wet(o) }));
await run("finishes", [
  ...finish(["Hoodie"], { roughness: 0.42, edge: 0.06 }),
  ...finish(["Sleeve R", "Sleeve L"], { roughness: 0.5, edge: 0.05 }),
  ...finish(["Strings"], { roughness: 0.45 }),
  ...finish(["Patch"], { roughness: 0.55 }),
  ...finish(["Head"], { roughness: 0.3, edge: 0.08 }),
  ...finish(["Hair", "Buns"], { roughness: 0.22 }),
  ...finish(["Face"], { roughness: 0.1, edge: 0.06 }),
  ...finish(["Shoes", "Charm"], { roughness: 0.16 }),
]);
await run(
  "head turn",
  ["Head", "Hair", "Buns", "Face"].map((n) =>
    layer("pose", { layer: n, pivot: [0, 0.07, 0], rotation: [0, -9, 5] }),
  ),
);
await shot("8 done", {
  views: [V(0, 8), V(35, 10), V(90, 8), V(180, 8)],
  grid: true,
  size: 1200,
});
const sheet = await studio.look({ views: [V(24, 9)], size: 1600 });
say(`hero: ${sheet.files[0]}`);
process.exit(0);

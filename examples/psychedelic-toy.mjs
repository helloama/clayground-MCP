/**
 * An agent sculpts a psychedelic chibi designer toy through window.clayground:
 * a big-headed character under a melting rainbow mushroom cap, with eyes
 * built from rings, a third eye that glows, spiral antennae, a sunburst
 * behind it, floating orbs and a rippling base. Run it against a dev server or
 * the live studio:
 *
 *   CLAYGROUND_URL=http://localhost:3000/sculpt node examples/psychedelic-toy.mjs
 *
 * Pictures land in ~/clayground-agent (or CLAYGROUND_OUT). STOP=n stops after
 * stage n (1 blockout, 2 face, 3 paint, 4 cap, 5 world, 6 finish).
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
const VIEW = (azimuth, elevation) => ({ azimuth, elevation });
const HERO = VIEW(28, 14);
const shot = async (name, o = {}) => {
  const r = await studio.look({ views: [HERO], size: 900, ...o });
  say(`${name}: ${r.files[0]}`);
  return r;
};

const PINK = "#ff3fa4",
  ORANGE = "#ff9a3d",
  YELLOW = "#ffd92e",
  LIME = "#9be84a",
  CYAN = "#19d9ff",
  BLUE = "#4a6bff",
  VIOLET = "#8f52ff",
  MAGENTA = "#ff3fe0",
  INK = "#140a22";
const RAINBOW = [PINK, ORANGE, YELLOW, LIME, CYAN, BLUE, VIOLET, MAGENTA];
const TAU = Math.PI * 2;
const at3 = (p, q) => p.map((v, i) => v + q[i]);

await studio.call("new", { detail: 96 });
await studio.call("backdrop", ["#190a3d", "#5a1ea6", "#ff5fb0"]);

/* ---------- 1. Blockout: a chibi, a mushroom cap, a base ---------- */
await run("blockout", [
  layer("rename", { name: "Body" }),
  {
    do: "shape",
    shape: "sphere",
    at: [0, -0.4, 0],
    size: [0.31, 0.33, 0.27],
    color: PINK,
    blend: 0.1,
  },
  {
    do: "shape",
    shape: "sphere",
    at: [0, -0.58, 0],
    size: [0.29, 0.2, 0.26],
    color: PINK,
    blend: 0.1,
  },
  {
    do: "sweep",
    path: [
      [0.15, -0.62, 0],
      [0.16, -0.74, 0.03],
      [0.17, -0.82, 0.06],
    ],
    radius: [0.115, 0.105, 0.1],
    color: PINK,
    blend: 0.1,
    mirror: "x",
  },
  {
    do: "sweep",
    path: [
      [0.27, -0.28, 0.03],
      [0.4, -0.36, 0.08],
      [0.47, -0.5, 0.15],
    ],
    radius: [0.08, 0.07, 0.065],
    color: PINK,
    blend: 0.1,
    mirror: "x",
  },
  layer("gradient", { from: PINK, to: ORANGE, axis: "y" }),
  {
    do: "shape",
    shape: "sphere",
    at: [0.17, -0.86, 0.1],
    size: [0.15, 0.085, 0.21],
    color: YELLOW,
    blend: 0.05,
    mirror: "x",
  },
  {
    do: "shape",
    shape: "sphere",
    at: [0.47, -0.53, 0.16],
    size: 0.1,
    color: CYAN,
    blend: 0.05,
    mirror: "x",
  },

  layer("add", { detail: 96 }),
  layer("rename", { name: "Head" }),
  {
    do: "shape",
    shape: "sphere",
    at: [0, 0.22, 0],
    size: [0.52, 0.47, 0.5],
    color: "#7ff2d4",
    blend: 0.1,
  },
  layer("gradient", { from: "#19e6d0", to: "#b36bff", axis: "y" }),
  {
    do: "shape",
    shape: "ear",
    at: [0.5, 0.2, 0],
    turn: [0, 90, 0],
    size: 0.1,
    color: MAGENTA,
    blend: 0.04,
  },
  {
    do: "shape",
    shape: "ear",
    at: [-0.5, 0.2, 0],
    turn: [0, -90, 0],
    size: 0.1,
    color: MAGENTA,
    blend: 0.04,
  },

  layer("add", { detail: 96 }),
  layer("rename", { name: "Cap" }),
  {
    do: "spin",
    at: [0, 0.55, 0],
    axis: [0, 1, 0],
    color: PINK,
    blend: 0.05,
    profile: [
      [0, 0.62],
      [0.16, 0.61],
      [0.34, 0.56],
      [0.5, 0.47],
      [0.62, 0.35],
      [0.71, 0.2],
      [0.76, 0.07],
      [0.75, -0.01],
      [0.64, -0.06],
      [0.4, -0.04],
      [0, -0.04],
    ],
  },
  layer("gradient", { from: PINK, to: ORANGE, axis: "y" }),

  layer("add", { detail: 64 }),
  layer("rename", { name: "Base" }),
  {
    do: "spin",
    at: [0, -0.96, 0],
    axis: [0, 1, 0],
    color: "#3a1c7a",
    blend: 0.05,
    profile: [
      [0, 0.06],
      [0.4, 0.06],
      [0.58, 0.03],
      [0.7, -0.02],
      [0.74, -0.08],
      [0.62, -0.12],
      [0, -0.12],
    ],
  },
  // Smooth the voxel grain off the big forms before anything is drawn on them.
  ...["Body", "Head", "Cap", "Base"].map((name) =>
    layer("relax", { layer: name }),
  ),
]);
const before = await shot("before");
await studio.call("checkpoint", "blockout");
if (STOP < 2) process.exit(await studio.close().then(() => 0));

/* ---------- 2. The face: eyes built from rings, on finer layers ---------- */
// Each eye is its own layer with voxels 0.22 times the size, posed on the eye,
// so the rings are crisp. The eyeball stands out of the head, so nothing needs
// to be cut from the head (that is what refine is for, see the pangolin).
// Written in world units (space: "world").
const E = (s) => [s * 0.2, 0.26, 0.44];
const eye = (s) => {
  const c = E(s),
    on = (dz, size, color, extra = {}) => ({
      do: "shape",
      shape: "sphere",
      space: "world",
      at: at3(c, [extra.dx ?? 0, extra.dy ?? 0, dz]),
      size,
      color,
      blend: 0.03,
      turn: [0, s * 10, 0],
    });
  return [
    on(0, [0.135, 0.16, 0.07], "#ffffff"),
    on(0.035, [0.105, 0.13, 0.06], CYAN),
    on(0.045, [0.088, 0.11, 0.062], VIOLET),
    on(0.055, [0.066, 0.083, 0.064], MAGENTA),
    on(0.065, [0.04, 0.058, 0.062], INK),
    on(0.105, 0.026, "#ffffff", { dx: -0.038, dy: 0.055 }),
    on(0.095, 0.014, "#ffffff", { dx: 0.036, dy: -0.05 }),
  ];
};
for (const [s, name] of [
  [-1, "Eye L"],
  [1, "Eye R"],
]) {
  await run(`${name} layer`, [
    layer("add", { detail: 96 }),
    layer("rename", { name }),
    layer("pose", { position: E(s), scale: 0.22 }),
  ]);
  await run(name, eye(s));
  // Specks of paint across the iris, like fibers.
  await run(`${name} fibers`, [
    {
      do: "texture",
      kind: "freckles",
      count: 260,
      size: [0.02, 0.035],
      color: [YELLOW, "#ffffff", PINK, LIME],
      shade: 0.15,
      seed: s + 3,
      region: { at: [0, 0, 0.5], radius: 0.4 },
      facing: { dir: [0, 0, 1], within: 75 },
    },
  ]);
}
await run("mouth", [
  pick("Head"),
  {
    do: "shape",
    shape: "mouth",
    at: [0, 0.0, 0.44],
    size: [0.08, 0.05, 0.04],
    color: "#2a0a2e",
    blend: 0.03,
  },
  {
    do: "shape",
    shape: "tongue",
    at: [0, -0.03, 0.45],
    size: [0.05, 0.035, 0.04],
    color: "#ff6fb0",
    blend: 0.03,
  },
]);
await shot("face");
await studio.call("checkpoint", "face");
if (STOP < 3) process.exit(await studio.close().then(() => 0));

/* ---------- 3. Paint: spirals, targets and bands ---------- */
// Paint goes on the skin, so a path is a list of points ON the skin: a helix
// on the body's ellipsoid, spirals on the cheeks, rings on the cap.
const paint = (path, color, radius = 0.035) => ({
  do: "brush",
  tool: "paint",
  path,
  radius,
  spacing: radius * 0.15,
  strength: 1,
  color,
  falloff: "even",
});
const helix = (turns, offset) => {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120,
      u = -0.8 + 1.6 * t,
      th = offset + t * turns * TAU,
      w = Math.sqrt(1 - u * u);
    pts.push([
      0.31 * w * Math.cos(th),
      -0.4 + 0.33 * u,
      0.27 * w * Math.sin(th),
    ]);
  }
  return pts;
};
const headZ = (x, y) =>
  0.5 * Math.sqrt(Math.max(0, 1 - (x / 0.52) ** 2 - ((y - 0.22) / 0.47) ** 2));
const cheek = (s, offset, color) => {
  const pts = [],
    cx = s * 0.33,
    cy = 0.02;
  for (let i = 0; i <= 80; i++) {
    const t = i / 80,
      r = 0.02 + 0.12 * t,
      th = offset + t * 2.2 * TAU * s;
    const x = cx + r * Math.cos(th),
      y = cy + r * Math.sin(th);
    pts.push([x, y, headZ(x, y)]);
  }
  return paint(pts, color, 0.026);
};
const target = (cx, cy, r, color) => {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const th = (i / 64) * TAU,
      x = cx + r * Math.cos(th),
      y = cy + r * Math.sin(th);
    const z =
      0.27 *
      Math.sqrt(Math.max(0, 1 - (x / 0.31) ** 2 - ((y + 0.4) / 0.33) ** 2));
    pts.push([x, y, z]);
  }
  return paint(pts, color, 0.028);
};
const CAP = [
  [0.16, 0.61],
  [0.34, 0.56],
  [0.5, 0.47],
  [0.62, 0.35],
  [0.71, 0.2],
  [0.76, 0.07],
];
const band = (out, up, color) => {
  const pts = [];
  for (let i = 0; i <= 72; i++) {
    const th = (i / 72) * TAU;
    pts.push([out * Math.cos(th), 0.55 + up, out * Math.sin(th)]);
  }
  return paint(pts, color, 0.05);
};
await run("paint body", [
  pick("Body"),
  paint(helix(3, 0), CYAN, 0.03),
  paint(helix(3, Math.PI), YELLOW, 0.03),
  target(0, -0.4, 0.17, YELLOW),
  target(0, -0.4, 0.12, CYAN),
  target(0, -0.4, 0.07, MAGENTA),
]);
await run("paint head", [
  pick("Head"),
  cheek(-1, 0, MAGENTA),
  cheek(-1, Math.PI, YELLOW),
  cheek(1, 0, MAGENTA),
  cheek(1, Math.PI, YELLOW),
]);
await run("paint cap", [
  pick("Cap"),
  ...CAP.map(([o, u], i) =>
    band(o, u, [CYAN, YELLOW, VIOLET, LIME, CYAN, YELLOW][i]),
  ),
]);
await shot("paint");
await studio.call("checkpoint", "painted");
if (STOP < 4) process.exit(await studio.close().then(() => 0));

/* ---------- 4. The cap: spots, melting drips, spiral antennae ---------- */
const drips = [];
[-150, -125, -105, -85, -65, -45, 45, 65, 85, 105, 125, 150].forEach(
  (deg, i) => {
    const a = (deg * Math.PI) / 180,
      x = 0.76 * Math.sin(a),
      z = 0.76 * Math.cos(a);
    const len = 0.14 + (0.2 * ((i * 37) % 7)) / 7,
      color = [LIME, CYAN, YELLOW][i % 3];
    drips.push({
      do: "sweep",
      path: [
        [x, 0.64, z],
        [x * 0.99, 0.62 - len * 0.5, z * 0.99],
        [x * 0.99, 0.6 - len, z * 0.99],
      ],
      radius: [0.05, 0.036, 0.058],
      color,
      blend: 0.08,
    });
    drips.push({
      do: "shape",
      shape: "sphere",
      at: [x * 0.99, 0.6 - len, z * 0.99],
      size: 0.06,
      color,
      blend: 0.05,
    });
  },
);
const antenna = (s, color) => {
  const pts = [];
  for (let i = 0; i <= 44; i++) {
    const t = i / 44,
      rad = 0.12 * (1 - 0.6 * t),
      th = t * 2.6 * TAU * s;
    pts.push([
      s * 0.24 + rad * Math.cos(th),
      1.1 + 0.4 * t,
      rad * Math.sin(th),
    ]);
  }
  return [
    {
      do: "sweep",
      path: pts,
      radius: [0.034, 0.026, 0.018],
      color,
      blend: 0.06,
    },
    {
      do: "shape",
      shape: "sphere",
      at: pts[pts.length - 1],
      size: 0.075,
      color: YELLOW,
      blend: 0.05,
    },
  ];
};
await run("cap spots", [
  pick("Cap"),
  {
    do: "array",
    item: {
      do: "shape",
      shape: "sphere",
      at: [0, 0, 0],
      size: [0.06, 0.06, 0.03],
    },
    scale: [0.8, 1.5],
    lift: 0.004,
    color: ["#ffffff", YELLOW, CYAN, LIME, "#ffe9fb"],
    shade: 0.05,
    seed: 2,
    place: {
      surface: {
        count: 34,
        spacing: 0.17,
        region: { box: { min: [-1, 0.62, -1], max: [1, 1.1, 1] } },
        facing: { dir: [0, 1, 0], within: 70 },
        seed: 5,
      },
    },
  },
]);
await run("drips and antennae", [
  ...drips,
  ...antenna(1, CYAN),
  ...antenna(-1, MAGENTA),
]);
await shot("cap");
await studio.call("checkpoint", "capped");
if (STOP < 5) process.exit(await studio.close().then(() => 0));

/* ---------- 5. The world around it: sunburst, orbs, ripples, a third eye ---------- */
const petals = [];
for (let i = 0; i < 18; i++) {
  const a = (i / 18) * TAU,
    d = [Math.cos(a), Math.sin(a), 0],
    c = [0, 0.38, -0.3];
  const from = at3(
      c,
      d.map((v) => v * 0.82),
    ),
    to = at3(
      c,
      d.map((v) => v * 1.22),
    );
  petals.push({
    do: "loft",
    path: [from, to],
    up: [0, 0, 1],
    size: [
      [0.02, 0.035],
      [0.085, 0.035],
      [0.02, 0.035],
    ],
    color: RAINBOW[i % RAINBOW.length],
    blend: 0.03,
  });
}
const orbit = [];
for (let i = 0; i <= 60; i++) {
  const t = i / 60,
    a = 0.5 + t * 3 * TAU;
  orbit.push([1.0 * Math.cos(a), -0.7 + 1.5 * t, 1.0 * Math.sin(a)]);
}
const ripples = [0.3, 0.42, 0.54, 0.64].map((r, i) => ({
  do: "shape",
  shape: "torus",
  at: [0, -0.9, 0],
  size: [r, 0.022, r],
  color: [CYAN, MAGENTA, YELLOW, LIME][i],
  blend: 0.03,
}));
await run("sunburst", [
  layer("add", { detail: 64 }),
  layer("rename", { name: "Sunburst" }),
  ...petals,
]);
await run("orbs", [
  layer("add", { detail: 64 }),
  layer("rename", { name: "Orbs" }),
  {
    do: "array",
    item: { do: "shape", shape: "sphere", at: [0, 0, 0], size: 0.07 },
    scale: [0.5, 1.3],
    color: RAINBOW,
    shade: 0.05,
    seed: 8,
    place: { along: { path: orbit, count: 16, normal: "tangent" } },
  },
]);
await run("ripples", [pick("Base"), ...ripples]);
// A third eye on the front of the cap, turned to look along the dome's skin.
const P = [0, 1.02, 0.5],
  N = [0, 0.6, 0.8];
const turn = await studio.script(
  `return clayground.geo.facing(${JSON.stringify(N)});`,
);
const ray = (dist) =>
  at3(
    P,
    N.map((v) => v * dist),
  );
const ring = (dist, size, color) => ({
  do: "shape",
  shape: "sphere",
  space: "world",
  at: ray(dist),
  turn,
  size,
  color,
  blend: 0.03,
});
await run("third eye", [
  layer("add", { detail: 96 }),
  layer("rename", { name: "Third eye" }),
  layer("pose", { position: P, scale: 0.3 }),
  ring(0, [0.1, 0.1, 0.045], "#ffffff"),
  ring(0.035, [0.078, 0.078, 0.05], CYAN),
  ring(0.045, [0.06, 0.06, 0.052], VIOLET),
  ring(0.055, [0.042, 0.042, 0.054], MAGENTA),
  ring(0.065, [0.024, 0.032, 0.056], INK),
  ring(0.1, 0.018, "#ffffff"),
]);
await shot("world");
await studio.call("checkpoint", "world");
if (STOP < 6) process.exit(await studio.close().then(() => 0));

/* ---------- 6. Finish: vinyl on the body, glow on the orbs ---------- */
const wet = (o = {}) => ({
  roughness: 0.12,
  metalness: 0,
  glow: 0,
  grain: 0,
  edge: 0.1,
  tint: "#ffffff",
  tintMix: 0,
  ...o,
});
// Designer-toy vinyl: smooth, glossy, no fingerprint grain. Small posed layers
// need grain 0 or the clay's grain (drawn in the layer's own units) shows as
// bumps, and a finish given as a mix names all seven keys.
await run("finishes", [
  layer("finish", { layer: "Body", finish: wet({ roughness: 0.18 }) }),
  layer("finish", { layer: "Head", finish: wet({ roughness: 0.18 }) }),
  layer("finish", { layer: "Cap", finish: wet({ roughness: 0.18 }) }),
  layer("finish", { layer: "Eye L", finish: wet() }),
  layer("finish", { layer: "Eye R", finish: wet() }),
  layer("finish", { layer: "Base", finish: "plastic" }),
  layer("finish", { layer: "Sunburst", finish: "plastic" }),
  layer("finish", { layer: "Orbs", finish: "glow" }),
  layer("finish", {
    layer: "Third eye",
    finish: wet({ glow: 0.8, roughness: 0.3 }),
  }),
]);

/* ---------- The result ---------- */
const critic = await studio.call("critique", { view: HERO, image: false });
say(`critic: ${critic.reading}`);
const after = await shot("after");
const face = await studio.look({
  view: VIEW(18, 8),
  focus: { at: [0, 0.3, 0.45], radius: 0.5 },
  size: 900,
});
const hero = await studio.look({
  view: HERO,
  focus: { at: [0, 0.21, 0], radius: 1.35 },
  size: 1200,
});
const sheet = await studio.look({
  views: [
    VIEW(0, 6),
    VIEW(90, 8),
    HERO,
    VIEW(180, 10),
    VIEW(-60, 18),
    VIEW(0, 80),
  ],
  size: 520,
  grid: true,
});
const normals = await studio.look({ views: [HERO], pass: "normal", size: 900 });
const layers = await studio.look({ views: [HERO], pass: "layers", size: 900 });
say(
  `hero: ${hero.files[0]}\nface: ${face.files[0]}\nsheet: ${sheet.files[0]}\nnormals: ${normals.files[0]}\nlayers: ${layers.files[0]}`,
);
say(`before: ${before.files[0]}\nafter: ${after.files[0]}`);
await studio.close();

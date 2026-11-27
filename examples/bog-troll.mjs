/**
 * An agent sculpts a bog troll through window.clayground, the way a sculptor
 * would start one: from an armature of spheres, then bigger to smaller.
 *
 *   CLAYGROUND_URL=http://localhost:3000/sculpt node examples/bog-troll.mjs
 *
 * Pictures land in ~/clayground-agent (or CLAYGROUND_OUT). STOP=n stops after
 * stage n (1 armature, 2 face, 3 colored parts, 4 clothes and lantern, 5 stage).
 *
 * What it shows, in the order a sculpt goes:
 *   1. Primary forms. One `armature` op writes the proportions as joints: a hump
 *      and a pot belly, a long arm that drags and a short one that holds a
 *      lantern, legs that do not match. `lumps` presses small spheres along the
 *      bones so the skin is uneven, and `asym` moves the mirrored side. The
 *      figure leans and has a weight and a side before any detail is made.
 *   2. Secondary forms, laid on the real skin (`nearest`, never a guess): the
 *      brow, a big nose, jowls, long ears. Grooves are real cuts (a sweep in
 *      mode cut): the mouth, forehead creases, the folds of the belly.
 *   3. Every colored part is a layer of its own: eyes, pupils, tusks, moss,
 *      belt, cloth, lantern, flame, claws. Each is posed over just its part.
 *   4. A stage, and a look from the side as well as the front.
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
const W = (o) => ({ ...o, space: "world" });
const TAU = Math.PI * 2;
/** A part's own layer, posed over just where it lives, so it has the voxels it needs. */
const part = (name, center, half, detail, finish) => [
  { do: "layer", action: "add", detail },
  { do: "layer", action: "rename", name },
  { do: "layer", action: "pose", position: center, scale: half },
  { do: "layer", action: "finish", finish },
];

const SKIN = "#7fae6e";

/* ---------- 1. the armature ---------- */
await run("armature", [
  { do: "new", detail: 96 },
  { do: "layer", action: "rename", name: "Troll" },
  { do: "layer", action: "finish", finish: "clay" },
  {
    do: "armature",
    color: SKIN,
    blend: 0.08,
    swell: 0.16,
    knob: 0.06,
    lumps: 0.5,
    asym: 0.5,
    seed: 11,
    joints: [
      { id: "pelvis", at: [0, -0.34, -0.06], r: 0.24 },
      { id: "belly", at: [0, -0.16, 0.17], r: 0.27, parent: "pelvis" },
      { id: "chest", at: [0, 0.12, 0], r: 0.27, parent: "pelvis" },
      { id: "hump", at: [0, 0.34, -0.16], r: 0.21, parent: "chest" },
      {
        id: "neck",
        at: [0.02, 0.36, 0.22],
        r: 0.11,
        parent: "chest",
        bow: [0, 0.04, 0.02],
      },
      { id: "head", at: [0.05, 0.47, 0.46], r: 0.22, parent: "neck" },
      { id: "jaw", at: [0.05, 0.34, 0.55], r: 0.14, parent: "head" },
      // the long arm drags, the short one holds a light up
      { id: "shoulderL", at: [0.34, 0.3, 0.06], r: 0.15, parent: "chest" },
      {
        id: "elbowL",
        at: [0.6, 0.02, 0.14],
        r: 0.12,
        parent: "shoulderL",
        bow: [0.04, 0.06, 0],
      },
      {
        id: "handL",
        at: [0.62, -0.56, 0.3],
        r: 0.15,
        parent: "elbowL",
        end: "hand",
        bow: [0.03, 0, 0.06],
      },
      { id: "shoulderR", at: [-0.32, 0.3, 0.1], r: 0.11, parent: "chest" },
      { id: "elbowR", at: [-0.5, 0.1, 0.28], r: 0.08, parent: "shoulderR" },
      {
        id: "handR",
        at: [-0.34, 0.3, 0.56],
        r: 0.07,
        parent: "elbowR",
        end: "hand",
      },
      // legs, mirrored, and the mirror is not exact
      {
        id: "hipJ",
        at: [0.16, -0.4, -0.03],
        r: 0.15,
        parent: "pelvis",
        mirror: true,
      },
      {
        id: "knee",
        at: [0.2, -0.64, 0.16],
        r: 0.12,
        parent: "hipJ",
        mirror: true,
        bow: [0, 0, -0.04],
      },
      {
        id: "ankle",
        at: [0.2, -0.84, 0.06],
        r: 0.12,
        parent: "knee",
        mirror: true,
        end: "foot",
        toe: [0, 0, 1],
      },
    ],
  },
]);
if (STOP < 2) process.exit(0);

/* ---------- 2. the face and the skin, on the real skin ---------- */
const HEAD = [0.05, 0.47, 0.46];
/** The direction at azimuth az (0 faces front, + towards the character's left) and elevation el. */
const dir = (az, el) => {
  const a = (az * Math.PI) / 180,
    e = (el * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
};
/** The skin of the layer nearest to a probe, with its normal. */
const skinNear = async (q, layer = "Troll") =>
  (await studio.call("nearest", [q], { layer, space: "world", within: 2 }))
    .hits[0];
/** The skin of the head at an azimuth and elevation, lifted along its normal. */
const onHead = async (az, el, lift = 0) => {
  const d = dir(az, el);
  const h = await skinNear(HEAD.map((c, i) => c + d[i] * 0.45));
  return { p: h.at.map((v, i) => v + h.normal[i] * lift), n: h.normal };
};
const along = (list) =>
  Promise.all(
    list.map(([az, el, lift]) => onHead(az, el, lift ?? 0).then((x) => x.p)),
  );

const features = [];
// the brow is heavy and one side is cocked
features.push(
  W({
    do: "sweep",
    path: await along([
      [6, 19, 0.02],
      [22, 23, 0.025],
      [40, 18, 0.02],
    ]),
    radius: [0.03, 0.034, 0.026],
    color: SKIN,
    blend: 0.05,
  }),
);
features.push(
  W({
    do: "sweep",
    path: await along([
      [-6, 17, 0.02],
      [-22, 18, 0.025],
      [-40, 14, 0.02],
    ]),
    radius: [0.03, 0.034, 0.026],
    color: SKIN,
    blend: 0.05,
  }),
);
// a big lumpy nose on a bridge, with nostrils that are not the same size
const nose = await onHead(0, -5, 0.04);
features.push(
  W({
    do: "shape",
    shape: "sphere",
    at: nose.p,
    size: [0.055, 0.05, 0.06],
    color: SKIN,
    blend: 0.05,
  }),
);
features.push(
  W({
    do: "sweep",
    path: await along([
      [0, 14, 0.01],
      [0, 5, 0.02],
      [0, -3, 0.03],
    ]),
    radius: [0.026, 0.03, 0.04],
    color: SKIN,
    blend: 0.05,
  }),
);
for (const x of [-1, 1]) {
  const n = await onHead(x * 13, -9, 0.026);
  features.push(
    W({
      do: "shape",
      shape: "sphere",
      at: n.p,
      size: x > 0 ? 0.028 : 0.024,
      color: SKIN,
      blend: 0.04,
    }),
  );
}
// jowls, and ears that are long and droop
for (const [az, el, r] of [
  [-50, -10, 0.048],
  [47, -13, 0.056],
]) {
  const c = await onHead(az, el, 0.005);
  features.push(
    W({
      do: "shape",
      shape: "sphere",
      at: c.p,
      size: r,
      color: SKIN,
      blend: 0.05,
    }),
  );
}
for (const x of [1, -1]) {
  const o = (await onHead(x * 86, 4, 0)).p;
  features.push(
    W({
      do: "sweep",
      path: [
        o,
        [o[0] + x * 0.09, o[1] + 0.04, o[2] - 0.05],
        [o[0] + x * 0.18, o[1] - 0.02, o[2] - 0.1],
        [o[0] + x * 0.24, o[1] - 0.11, o[2] - 0.12],
      ],
      radius: [0.055, 0.045, 0.028, 0.012],
      color: SKIN,
      blend: 0.04,
    }),
  );
}
// heavy upper lids over where the eyes will go
for (const a0 of [24, -24])
  features.push(
    W({
      do: "sweep",
      path: await along([
        [a0 - 12, 7, 0.016],
        [a0, 12, 0.024],
        [a0 + 12, 7, 0.016],
      ]),
      radius: 0.021,
      color: SKIN,
      blend: 0.03,
    }),
  );
await run("brow, nose, jowls, ears, lids", features);

// carved: real grooves, so the light finds them
const cuts = [
  W({
    do: "sweep",
    path: await along([
      [-34, -30, 0],
      [-16, -37, 0],
      [4, -39, 0],
      [22, -36, 0],
      [38, -29, 0],
    ]),
    radius: 0.012,
    mode: "cut",
    blend: 0,
  }),
];
for (const [el, a0, a1] of [
  [34, -28, 24],
  [40, -20, 30],
  [46, -8, 22],
])
  cuts.push(
    W({
      do: "sweep",
      path: await along([
        [a0, el, 0],
        [(a0 + a1) / 2, el + 2, 0],
        [a1, el, 0],
      ]),
      radius: 0.01,
      mode: "cut",
      blend: 0,
    }),
  );
// (probed from just outside the belly, so they find the belly and not an arm)
for (const y of [-0.08, -0.19]) {
  const arc = [];
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.26;
    arc.push(
      (
        await skinNear([
          Math.sin(a) * 0.34,
          y + Math.abs(i) * 0.014,
          0.17 + Math.cos(a) * 0.36,
        ])
      ).at,
    );
  }
  cuts.push(
    W({ do: "sweep", path: arc, radius: 0.012, mode: "cut", blend: 0 }),
  );
}
await run("mouth, creases, belly folds", cuts);
if (STOP < 3) process.exit(0);

/* ---------- 3. every colored part its own layer ---------- */
const eyeL = await onHead(29, 7, -0.006),
  eyeR = await onHead(-29, 5, -0.006);
const face = [0.05, 0.53, 0.64];
await run("eyes and pupils", [
  ...part("Eyes", face, 0.2, 64, "glossy"),
  W({
    do: "shape",
    shape: "sphere",
    at: eyeL.p,
    size: [0.04, 0.036, 0.03],
    color: "#efe9b4",
    blend: 0.01,
  }),
  W({
    do: "shape",
    shape: "sphere",
    at: eyeR.p,
    size: [0.03, 0.028, 0.026],
    color: "#efe9b4",
    blend: 0.01,
  }),
  ...part("Pupils", face, 0.2, 64, "glossy"),
  W({
    do: "shape",
    shape: "sphere",
    at: (await onHead(28, 7, 0.03)).p,
    size: [0.011, 0.022, 0.01],
    color: "#17160f",
    blend: 0.005,
  }),
  W({
    do: "shape",
    shape: "sphere",
    at: (await onHead(-32, 5, 0.022)).p,
    size: [0.01, 0.018, 0.009],
    color: "#17160f",
    blend: 0.005,
  }),
]);
const tusk = async (az) => {
  const b = (await onHead(az, -33, -0.005)).p,
    x = Math.sign(az);
  return W({
    do: "sweep",
    path: [
      b,
      [b[0] + x * 0.012, b[1] + 0.05, b[2] + 0.035],
      [b[0] + x * 0.005, b[1] + 0.115, b[2] + 0.05],
    ],
    radius: [0.03, 0.022, 0.011],
    color: "#efe4c8",
    blend: 0.02,
  });
};
await run("tusks", [
  ...part("Tusks", [0.05, 0.36, 0.62], 0.15, 64, "plastic"),
  await tusk(19),
  await tusk(-17),
]);

// moss: tons of small spheres in patches that hug the skin, different in size and place
const pts = (
  await studio.call("surface", {
    layer: "Troll",
    count: 1400,
    limit: 1000,
    space: "world",
    seed: 5,
  })
).points;
const far = (p) =>
  Math.hypot(p.at[0] - HEAD[0], p.at[1] - HEAD[1], p.at[2] - HEAD[2]) > 0.3;
const tops = pts.filter(
  (p) => p.normal[1] > 0.3 && p.at[1] > 0.15 && p.at[2] < 0.2 && far(p),
);
const patches = [0, 9, 21, 33, 47].map((i) => tops[i]).filter(Boolean);
const mossAt = patches.flatMap((c) =>
  tops
    .filter(
      (p) =>
        Math.hypot(p.at[0] - c.at[0], p.at[1] - c.at[1], p.at[2] - c.at[2]) <
        0.12,
    )
    .slice(0, 40),
);
await run("moss", [
  ...part("Moss", [0, 0.4, -0.05], 0.6, 96, "clay"),
  {
    do: "array",
    item: {
      do: "shape",
      shape: "sphere",
      at: [0, 0, 0],
      size: 0.02,
      color: "#5f8f2f",
      blend: 0.03,
    },
    place: { list: mossAt.map((p) => ({ at: p.at, normal: p.normal })) },
    scale: [0.6, 1.7],
    lift: [-0.004, 0.006],
    space: "world",
    seed: 3,
  },
]);
if (STOP < 4) process.exit(0);

/* ---------- 4. clothes and the light ---------- */
// a belt round the belly and rags that hang from it, laid on the real skin
const belt = [];
for (let i = 0; i <= 28; i++) {
  const a = (i / 28) * TAU;
  const h = await skinNear([
    Math.sin(a) * 0.32,
    -0.27,
    0.07 + Math.cos(a) * 0.36,
  ]);
  belt.push(h.at.map((v, k) => v + h.normal[k] * 0.02));
}
const rags = [];
for (const [a, drop, w] of [
  [-0.8, 0.2, 0.04],
  [-0.45, 0.3, 0.05],
  [-0.1, 0.24, 0.045],
  [0.25, 0.34, 0.05],
  [0.6, 0.22, 0.04],
]) {
  const path = [];
  for (const y of [-0.27, -0.27 - drop * 0.5, -0.27 - drop]) {
    const h = await skinNear([Math.sin(a) * 0.3, y, 0.05 + Math.cos(a) * 0.3]);
    path.push(h.at.map((v, k) => v + h.normal[k] * 0.026));
  }
  // a strip of cloth: wide, thin, and it frays to a point
  rags.push(
    W({
      do: "loft",
      path,
      size: [
        [w * 0.9, 0.011],
        [w, 0.011],
        [w * 0.45, 0.008],
      ],
      shape: "box",
      round: 0.6,
      up: [0, 0, 1],
      color: "#c9a36a",
      blend: 0.015,
    }),
  );
}
await run("belt and rags", [
  ...part("Belt", [0, -0.27, 0.05], 0.45, 64, "clay"),
  W({ do: "sweep", path: belt, radius: 0.03, color: "#6e4326", blend: 0.02 }),
  W({
    do: "shape",
    shape: "box",
    at: belt[14].map((v, k) => v + [0, 0, 0.012][k]),
    size: [0.035, 0.032, 0.016],
    round: 0.5,
    color: "#c9b26a",
    blend: 0.01,
  }),
  ...part("Rags", [0, -0.45, 0.1], 0.35, 64, "clay"),
  ...rags,
]);
// the lantern hangs from the small hand
const LH = [-0.34, 0.07, 0.57];
await run("lantern", [
  ...part("Lantern", LH, 0.25, 64, "metal"),
  W({
    do: "sweep",
    path: [
      [LH[0], 0.265, LH[2]],
      [LH[0], 0.19, LH[2]],
    ],
    radius: 0.012,
    color: "#4b4b54",
    blend: 0.01,
  }),
  W({
    do: "shape",
    shape: "box",
    at: [LH[0], 0.185, LH[2]],
    size: [0.07, 0.014, 0.07],
    round: 0.5,
    color: "#3c3c44",
    blend: 0.01,
  }),
  W({
    do: "shape",
    shape: "box",
    at: [LH[0], -0.045, LH[2]],
    size: [0.07, 0.014, 0.07],
    round: 0.5,
    color: "#3c3c44",
    blend: 0.01,
  }),
  ...[
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ].map(([sx, sz]) =>
    W({
      do: "sweep",
      path: [
        [LH[0] + sx * 0.058, -0.035, LH[2] + sz * 0.058],
        [LH[0] + sx * 0.058, 0.175, LH[2] + sz * 0.058],
      ],
      radius: 0.012,
      color: "#3c3c44",
      blend: 0.01,
    }),
  ),
  ...part("Flame", LH, 0.25, 64, "glow"),
  W({
    do: "shape",
    shape: "sphere",
    at: [LH[0], 0.06, LH[2]],
    size: [0.04, 0.055, 0.04],
    color: "#ffd25a",
    blend: 0.02,
  }),
]);
// claws on the toes
const claws = [];
for (const x of [0.17, 0.23, -0.17, -0.23]) {
  const h = await skinNear([x, -0.82, 0.8]);
  claws.push(
    W({
      do: "sweep",
      path: [h.at, [h.at[0], h.at[1] - 0.004, h.at[2] + 0.05]],
      radius: [0.02, 0.011],
      color: "#e8dcc0",
      blend: 0.01,
    }),
  );
}
await run("claws", [
  ...part("Claws", [0, -0.8, 0.3], 0.35, 64, "plastic"),
  ...claws,
]);
if (STOP < 5) process.exit(0);

/* ---------- 5. the stage, and a look from the front and the side ---------- */
await run("stage", [
  {
    do: "stage",
    style: "goo",
    backdrop: ["#2b2536", "#5d4b6f"],
    light: "warm",
    camera: false,
  },
]);
const shot = await studio.look({
  views: [
    { azimuth: -20, elevation: 7 },
    { azimuth: 70, elevation: 8 },
  ],
  size: 800,
});
say(`front and side: ${shot.files.join(", ")}`);
process.exit(0);

/**
 * An agent sculpts a pangolin through window.clayground, looking at its own
 * work between steps. Run it against a dev server or the live studio:
 *
 *   CLAYGROUND_URL=http://localhost:3000/sculpt node examples/pangolin.mjs
 *
 * Pictures land in ~/clayground-agent (or CLAYGROUND_OUT). The steps are the
 * ones an agent takes through the MCP server: block out the big forms, keep a
 * checkpoint, move the head to a finer layer (refine), work the surface at
 * scale (rows of scales, claws), close in on the head, read the critic, then
 * draw the face and the skin of the head at that finer detail.
 */
import { openStudio } from "../page.mjs";

const studio = await openStudio();
// refine is newer than the rest of the door: say so plainly if this studio lacks it.
if (!(await studio.script(`return /refine/.test(clayground.help("layer"))`))) {
  await studio.close();
  throw new Error(
    "This studio has no refine op yet. Set CLAYGROUND_URL to a studio that has it.",
  );
}
const say = (m) => console.log(m);
const must = (r, what) => {
  if (!r.ok)
    throw new Error(
      `${what}: ${JSON.stringify(r.error ?? r.results?.find((x) => !x.ok))}`,
    );
  return r;
};

const SKIN = "#d3bda4",
  NOSE = "#5a463b",
  CLAW = "#efe3d0",
  SCALES = ["#7d6a45", "#86704a", "#74623f"];
const VIEW = (azimuth, elevation) => ({ azimuth, elevation });
const HERO = VIEW(35, 20);
const HEAD = { at: [0, 0.3, 0.95], radius: 0.4 };
const K = 0.45; // the head's finer layer: voxels 0.45 times the size
// The finer layer sits at the head with scale K, so a point in the world is
// ((p - at) / K) in its own units, which is where texture regions are written.
const own = (p) => [(p[0] - 0) / K, (p[1] - 0.3) / K, (p[2] - 0.95) / K];

await studio.call("new", { detail: 128 });
await studio.call("backdrop", ["#f6efe4", "#e6dccb"]);

// 1. Block out the big forms: a torso in three overlapping masses, a thick
// tail, a neck with a skull and a snout, four legs. Mirrored legs are one op.
must(
  await studio.run([
    { do: "layer", action: "rename", name: "Body" },
    {
      do: "shape",
      shape: "sphere",
      at: [0, 0.34, 0.05],
      size: [0.4, 0.36, 0.52],
      color: SKIN,
      blend: 0.1,
    },
    {
      do: "shape",
      shape: "sphere",
      at: [0, 0.42, -0.15],
      size: [0.34, 0.3, 0.4],
      color: SKIN,
      blend: 0.12,
    },
    {
      do: "shape",
      shape: "sphere",
      at: [0, 0.3, -0.42],
      size: [0.32, 0.28, 0.3],
      color: SKIN,
      blend: 0.14,
    },
    {
      do: "sweep",
      path: [
        [0, 0.26, -0.6],
        [0, 0.14, -0.95],
        [0, 0.07, -1.3],
        [0.02, 0.1, -1.58],
      ],
      radius: [0.27, 0.21, 0.14, 0.06],
      color: SKIN,
      blend: 0.12,
    },
    {
      do: "sweep",
      path: [
        [0, 0.38, 0.4],
        [0, 0.35, 0.62],
        [0, 0.31, 0.8],
      ],
      radius: [0.26, 0.2, 0.15],
      color: SKIN,
      blend: 0.12,
    },
    {
      do: "shape",
      shape: "sphere",
      at: [0, 0.3, 0.88],
      size: [0.15, 0.14, 0.17],
      color: SKIN,
      blend: 0.1,
    },
    {
      do: "sweep",
      path: [
        [0, 0.28, 0.95],
        [0, 0.24, 1.1],
        [0, 0.21, 1.22],
      ],
      radius: [0.1, 0.065, 0.04],
      color: SKIN,
      blend: 0.1,
    },
    {
      do: "shape",
      shape: "sphere",
      at: [0, 0.21, 1.235],
      size: 0.03,
      color: NOSE,
      blend: 0.03,
    },
    {
      do: "sweep",
      path: [
        [0.22, 0.22, 0.36],
        [0.27, 0, 0.4],
        [0.27, -0.12, 0.46],
      ],
      radius: [0.15, 0.11, 0.08],
      color: SKIN,
      blend: 0.1,
      end: "paw",
      face: [0, 0, 1],
      mirror: "x",
    },
    {
      do: "sweep",
      path: [
        [0.24, 0.22, -0.3],
        [0.31, 0, -0.32],
        [0.31, -0.12, -0.4],
      ],
      radius: [0.17, 0.12, 0.09],
      color: SKIN,
      blend: 0.1,
      end: "paw",
      face: [0, 0, 1],
      mirror: "x",
    },
  ]),
  "blockout",
);
const before = await studio.look({ views: [HERO], size: 900 });
await studio.call("checkpoint", "blockout");
say(`before: ${before.files[0]}`);

// 2. Claws: three on each paw, long in front and short behind.
const claws = [];
for (const dx of [-0.07, 0, 0.07]) {
  claws.push({
    do: "sweep",
    path: [
      [0.27 + dx, -0.115, 0.52],
      [0.27 + dx * 1.4, -0.135, 0.6],
      [0.27 + dx * 1.7, -0.14, 0.68],
    ],
    radius: [0.028, 0.017, 0.007],
    color: CLAW,
    blend: 0.05,
    mirror: "x",
  });
  claws.push({
    do: "sweep",
    path: [
      [0.31 + dx, -0.115, -0.34],
      [0.31 + dx * 1.3, -0.135, -0.27],
      [0.31 + dx * 1.5, -0.14, -0.2],
    ],
    radius: [0.028, 0.017, 0.007],
    color: CLAW,
    blend: 0.05,
    mirror: "x",
  });
}
must(await studio.run(claws), "claws");

// 3. The head goes to a finer layer: the clay inside a sphere round it moves
// to a new layer whose voxels are 0.45 times the size, cut out of the body with
// the rim overlapping so no crack shows. That layer is now the active one.
const refined = must(
  await studio.run([
    { do: "refine", at: [0, 0.3, 0.95], radius: 0.4, scale: K, name: "Head" },
  ]),
  "refine",
);
say(`refine: ${refined.results[0].note} (voxel ${refined.results[0].voxel})`);

// 4. Scales on the body. One texture op lays rows that follow the body (flow
// runs nose to tail), skips the belly (facing), and tilts each scale like a
// shingle. The head is its own layer now, so this one stops at the neck.
must(
  await studio.run([{ do: "layer", action: "select", layer: "Body" }]),
  "select body",
);
const scales = must(
  await studio.run([
    {
      do: "texture",
      kind: "scales",
      layout: "rows",
      flow: [0, 0, -1],
      size: [0.07, 0.07],
      color: SCALES,
      shade: 0.12,
      tilt: 22,
      region: { box: { min: [-0.7, 0.04, -1.75], max: [0.7, 0.95, 0.6] } },
      facing: { dir: [0, 1, 0], within: 118 },
    },
  ]),
  "scales",
);
say(`scales: ${JSON.stringify(scales.results.map((r) => r.notes))}`);
await studio.call("checkpoint", "scaled");

// 5. The head, at its finer detail. Smaller scales on the skull (a texture
// writes in the layer's own units, so the region is converted), then the face
// in world units: eyes, brow ridges, ears, nostrils, the mouth line and the
// creases a snout has.
must(
  await studio.run([{ do: "layer", action: "select", layer: "Head" }]),
  "select head",
);
const skull = {
  box: { min: own([-0.28, 0.37, 0.62]), max: own([0.28, 0.6, 1.02]) },
};
must(
  await studio.run([
    {
      do: "texture",
      kind: "scales",
      layout: "rows",
      flow: [0, 0, -1],
      size: [0.085, 0.085],
      color: SCALES,
      shade: 0.12,
      tilt: 20,
      region: skull,
      facing: { dir: [0, 1, 0], within: 50 },
    },
  ]),
  "head scales",
);
const seat = await studio.script(`
  const c = [0, 0.3, 0.88], r = 0.15, geo = clayground.geo;
  return {
    eyeL: geo.onSphere(c, r, -52, 6, -0.004), eyeR: geo.onSphere(c, r, 52, 6, -0.004),
    browL: geo.onSphere(c, r, -50, 24, -0.004), browR: geo.onSphere(c, r, 50, 24, -0.004),
    earL: geo.onSphere(c, r, -112, 20, -0.012), earR: geo.onSphere(c, r, 112, 20, -0.012),
  };`);
const face = [];
for (const k of ["eyeL", "eyeR"])
  face.push({
    do: "shape",
    shape: "eye",
    space: "world",
    at: seat[k].at,
    turn: seat[k].turn,
    size: 0.036,
    color: "#1c1410",
    blend: 0.01,
  });
for (const k of ["browL", "browR"])
  face.push({
    do: "shape",
    shape: "brow",
    space: "world",
    at: seat[k].at,
    turn: seat[k].turn,
    size: [0.045, 0.014, 0.02],
    color: "#bda98b",
    blend: 0.02,
  });
for (const k of ["earL", "earR"])
  face.push({
    do: "shape",
    shape: "ear",
    space: "world",
    at: seat[k].at,
    turn: seat[k].turn,
    size: 0.04,
    color: SKIN,
    blend: 0.02,
  });
// Nostrils and the line of the mouth are cuts.
face.push({
  do: "sweep",
  space: "world",
  path: [
    [-0.03, 0.215, 1.205],
    [-0.012, 0.2, 1.226],
  ],
  radius: 0.007,
  mode: "cut",
});
face.push({
  do: "sweep",
  space: "world",
  path: [
    [0.03, 0.215, 1.205],
    [0.012, 0.2, 1.226],
  ],
  radius: 0.007,
  mode: "cut",
});
face.push({
  do: "sweep",
  space: "world",
  path: [
    [-0.06, 0.2, 1.04],
    [-0.02, 0.185, 1.14],
    [0.02, 0.185, 1.14],
    [0.06, 0.2, 1.04],
  ],
  radius: 0.006,
  mode: "cut",
});
must(await studio.run(face), "face");
// The fine skin: creases along the cheeks and the bridge of the snout.
must(
  await studio.run([
    {
      do: "texture",
      kind: "wrinkles",
      color: "surface",
      size: [0.03, 0.04],
      depth: 0.4,
      count: 26,
      length: 0.3,
      seed: 7,
      region: {
        box: { min: own([-0.2, 0.18, 0.78]), max: own([0.2, 0.36, 1.2]) },
      },
    },
  ]),
  "skin",
);

// 6. Look closer, the way a person leans in. The critic reads a normal pass of
// that close-up and says where the surface is still smooth.
const critic = await studio.call("critique", {
  view: VIEW(38, 12),
  focus: HEAD,
  image: false,
});
say(`critic, head: ${critic.reading}`);

// 7. The result, from the same camera as the blockout, and a close-up.
const after = await studio.look({ views: [HERO], size: 900 });
const close = await studio.look({ view: VIEW(38, 12), focus: HEAD, size: 900 });
const sheet = await studio.look({
  views: [
    VIEW(90, 8),
    HERO,
    VIEW(0, 8),
    VIEW(180, 15),
    VIEW(-60, 10),
    VIEW(0, 89),
  ],
  size: 520,
  grid: true,
});
const normals = await studio.look({
  views: [VIEW(90, 8)],
  pass: "normal",
  size: 900,
});
const layers = await studio.look({
  views: [VIEW(90, 8)],
  pass: "layers",
  size: 900,
});
say(`after: ${after.files[0]}`);
say(`close-up: ${close.files[0]}`);
say(`sheet: ${sheet.files[0]}`);
say(`normal pass: ${normals.files[0]}`);
say(`layers pass: ${layers.files[0]}`);
say(`state: ${JSON.stringify(await studio.call("state"))}`.slice(0, 400));
await studio.close();

#!/usr/bin/env node
/**
 * The Clayground studio as an MCP server (stdio), so an agent with no browser
 * of its own can sculpt: Claude Code, Claude Desktop or any MCP client.
 *
 *   claude mcp add clayground -- npx -y github:helloama/clayground-MCP
 *
 * It opens the studio (/sculpt) in a Chromium it controls and speaks to
 * window.clayground there (the manual is https://www.clayvr.com/llms-full.txt). Tools: read the manual,
 * look at the clay (color, normals, depth, layers, close-ups), change it with
 * ops and look again in one call, build from tested recipes (vase, mug,
 * planter, fella), critique the work, test whether it prints (PASS or FAIL
 * with one fix each), score its shape against a picture, keep and restore
 * checkpoints, run your own code in the page, and export files to a folder on
 * this computer. Every answer ends with a "Next:" line, and a notebook in the
 * output folder keeps the goal and every change that worked, so a run can be
 * rebuilt after a restart (sculpt_status). Nothing is uploaded: the studio
 * runs in that browser. The door cannot publish, mint or sign in.
 *
 * Options (or the same in the environment, as CLAYGROUND_URL, _OUT, _CDP):
 *   --url <studio url>   default https://www.clayvr.com/sculpt
 *   --headed             show the browser window so a person can watch
 *   --cdp <endpoint>     attach to your own Chrome started with
 *                        --remote-debugging-port=9222 (http://127.0.0.1:9222)
 *   --out <folder>       where pictures and exports go (default ~/clayground-agent)
 *   --width, --height    the window size (default 1280 by 900)
 *
 * Speaks MCP's newline-delimited JSON-RPC on stdin and stdout. Logs go to
 * stderr, never stdout.
 */
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { openStudio, pictureSource, bytesOf } from "./page.mjs";
import { createJournal } from "./journal.mjs";

const SERVER = { name: "clayground-studio", version: "2.2.0" };
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const config = {
  url: option("url"),
  cdp: option("cdp"),
  out: option("out"),
  headed: flag("headed"),
  width: option("width") ? Number(option("width")) : undefined,
  height: option("height") ? Number(option("height")) : undefined,
};
for (const k of Object.keys(config))
  if (config[k] === undefined) delete config[k];

const log = (m) => process.stderr.write(`[clayground-mcp] ${m}\n`);

/** The notebook sits with the pictures and exports (one agent per output folder). */
const OUT =
  config.out ??
  process.env.CLAYGROUND_OUT ??
  join(homedir(), "clayground-agent");
const journal = createJournal(join(OUT, "journal.json"));

/* ---------- the studio, opened on first use ---------- */

let opening = null;
const studio = () => (opening ??= openStudio({ ...config, log }));

/** Calls take their turn: the studio does one thing at a time. */
let queue = Promise.resolve();
const alone = (fn) => {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

/* ---------- turning an answer into text and pictures ---------- */

const ARRAY_LIMIT = 120;
let saved = 0;

/**
 * An answer from the door for the model: every `dataUrl` in it becomes an
 * image block (and a file in the output folder), and the rest is compact JSON.
 */
function present(value, s, label = "picture") {
  const images = [],
    files = [];
  const walk = (v, key) => {
    if (typeof v === "string") return v;
    if (Array.isArray(v))
      return v.length > ARRAY_LIMIT
        ? [
            ...v.slice(0, ARRAY_LIMIT).map((x) => walk(x)),
            `(${v.length - ARRAY_LIMIT} more)`,
          ]
        : v.map((x) => walk(x));
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        if (
          k === "dataUrl" &&
          typeof x === "string" &&
          x.startsWith("data:image/")
        ) {
          const type = x.slice(5, x.indexOf(";"));
          images.push({ type: "image", data: x.split(",")[1], mimeType: type });
          // A picture that already has a file (studio.look saves its own) is not saved twice.
          if (typeof v.file === "string") {
            files.push(v.file);
            continue;
          }
          const file = join(
            s.out,
            `${String(++saved).padStart(3, "0")}-${label}-${String(key ?? "image").replace(/[^a-z0-9]+/gi, "-")}.${type === "image/jpeg" ? "jpg" : "png"}`,
          );
          writeFileSync(file, bytesOf(x));
          files.push(file);
          out.file = file;
        } else out[k] = walk(x, k);
      }
      return out;
    }
    return v;
  };
  const text = JSON.stringify(walk(value, label));
  return {
    content: [
      {
        type: "text",
        text: text.length > 24000 ? `${text.slice(0, 24000)} ... (cut)` : text,
      },
      ...images,
    ],
  };
}

/** Pictures asked for after an op, in the shape clayground.render takes. */
const lookOf = (look) =>
  look && typeof look === "object"
    ? {
        size: 640,
        format: (look.pass ?? "color") === "color" ? "jpeg" : "png",
        ...look,
      }
    : null;

const LOOK = {
  type: "object",
  description:
    "Pictures to take after the change, so one call acts and looks: { views: ['front', 'side', 'three-quarter', { azimuth, elevation }], pass: 'color' | 'normal' | 'depth' | 'layers' | 'silhouette', size: 640, grid: true, focus: { at: [x, y, z], radius } }.",
  properties: {
    views: { type: "array", items: {} },
    pass: {
      type: "string",
      enum: ["color", "normal", "depth", "layers", "silhouette"],
    },
    size: { type: "number" },
    grid: { type: "boolean" },
    focus: { type: "object" },
  },
};

/** The studio's state in a line, for the notebook's answers. */
const brief = (st) => ({
  triangles: st.triangles,
  layers: st.layers?.map((l) => l.name),
});

/* ---------- the tools ---------- */

const TOOLS = [
  {
    name: "sculpt_manual",
    description:
      "Read how to sculpt in the Clayground studio. Start with no topic (or 'card' if your context is short), then read 'detail' (scales, studs, fur, wrinkles, arrays, lofts) and 'seeing' (normals, critique, compare, checkpoints) before sculpting. Topics: card (a short loop for small models), coordinates, shape, sweep, spin, fill, brush, layer, detail, camera, seeing, geo, workflow, recipes, looks (four art directions for characters), limits, all.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string" } },
    },
    annotations: { readOnlyHint: true },
    run: async (s, { topic }) => ({ text: await s.call("help", topic) }),
  },
  {
    name: "sculpt_recipes",
    description:
      "Tested recipes that make a whole object from a few numbers: vase, mug, planter, fella (a little designer-toy character), and four characters made for the looks in sculpt_looks: grin (a glossy one-color mascot with a huge grin), balloon (an inflated strongman), goo (a sagging clay goof in candy colors) and bruiser (a tiny-headed heavyweight). With no name it lists them; with a name it shows every setting with its range, unit and default, and examples. Build one with sculpt_do: { do: 'recipe', name: 'mug', height: 0.8 }. The vase, mug, planter and fella pass the print check with their defaults, so start here, look, then change it by hand.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
    },
    annotations: { readOnlyHint: true },
    run: async (s, { name }) => {
      const { recipes } = await s.call("recipes");
      if (!name)
        return {
          recipes,
          shown: recipes.map((r) => ({
            name: r.name,
            about: r.about,
            settings: Object.keys(r.settings),
          })),
        };
      const one = recipes.find((r) => r.name === name);
      if (!one)
        throw new Error(
          `"${name}" is not a recipe; the recipes are ${recipes.map((r) => r.name).join(", ")}`,
        );
      return { recipes, shown: one };
    },
    show: ({ shown }) => shown,
  },
  {
    name: "sculpt_looks",
    description:
      "Four art directions for sculpting a character, from glossy VR-sculpted toys: grin (a one-color vinyl mascot with a huge grin), balloon (inflated pillow shapes, primary colors), goo (sagging matte clay in candy colors with one chrome trinket) and bruiser (a tiny head on a huge V of a chest under hero light). With no name it lists them; with a name it gives that look's shapes, proportions, palette rules, material, stage and concept ideas. A look is a way of working: build your own character in it with the recipe it names (sculpt_recipes), then change it by hand. Stage the pictures with sculpt_do { do: 'stage', style } and read the colors against the look with sculpt_style_check.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
    },
    annotations: { readOnlyHint: true },
    run: async (s, { name }) => {
      const { looks } = await s.call("looks");
      if (!name)
        return {
          looks,
          shown: looks.map((l) => ({
            name: l.name,
            title: l.title,
            about: l.about,
            recipe: l.recipe,
            ideas: l.ideas,
          })),
        };
      const one = looks.find((l) => l.name === name);
      if (!one)
        throw new Error(
          `"${name}" is not a look; the looks are ${looks.map((l) => l.name).join(", ")}`,
        );
      return { looks, shown: one };
    },
    show: ({ shown }) => shown,
  },
  {
    name: "sculpt_style_check",
    description:
      "Does the clay follow a look? Reads the colors on the skin of every visible layer, in proportion to their area, and answers PASS or FAIL for the dominant color, the number of color families and the saturation, with one fix for each FAIL and the one thing to do next. Run it after the colors are blocked in and again after each fix. It reads color, not shape: judge the proportions from the pictures.",
    inputSchema: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["grin", "balloon", "goo", "bruiser"] },
      },
      required: ["style"],
    },
    annotations: { readOnlyHint: true },
    run: (s, { style }) => s.call("styleCheck", { style }),
    show: (a) => ({
      text: [...(a.lines ?? []), a.stats ? JSON.stringify(a.stats) : ""]
        .filter(Boolean)
        .join("\n"),
    }),
  },
  {
    name: "sculpt_craft_check",
    description:
      "Does it look hand-sculpted, or generated? Measures the tells from points on the skin of every visible layer: whether the two sides match to the voxel (mirror), whether it stands as a straight stack with no lean (stack), whether its outline is one lump from every side (lump), whether the skin is equally smooth at every size (smooth), and whether one layer carries everything (one-part). It answers with the numbers, and for each tell one op to try. It is a hint, not a score: a toy meant to be even may keep its symmetry. Call it after the big forms read from three sides, fix the first tell, look, call it again. sculpt_manual topic 'craft' is how a sculptor works, in order; { do: 'armature' } blocks a figure in from spheres and bones.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (s) => s.call("craftCheck"),
    show: (a) => ({
      text: [
        a.reading,
        a.ok
          ? `sides ${a.symmetry}, sway ${a.sway}, hunch ${a.hunch}, outline fill ${a.solidity.front}/${a.solidity.side}/${a.solidity.three} (front/side/three-quarter), fine detail ${a.detail.fine}, ${a.layers} layers (biggest ${a.share}), ${a.colors} colors`
          : "",
        ...(a.tells ?? []).slice(1).map((t) => `${t.id}: ${t.says} ${t.try}`),
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  },
  {
    name: "sculpt_state",
    description:
      "The layers, undo and redo counts, triangles, camera and whether the clay is still busy.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (s) => s.call("state"),
  },
  {
    name: "sculpt_do",
    description:
      "Change the sculpt with a list of operations, in order (shape, sweep, spin, fill, brush, layer, array, loft, texture, refine, recipe, armature, stage, camera, look, backdrop, reference, new, undo, redo, checkpoint, restore). A `recipe` op builds a whole vase, mug, planter, fella or character from a few settings: { do: 'recipe', name: 'vase', height: 1.2 } (sculpt_recipes lists them). An `armature` op blocks a figure in from spheres and bones, the way a sculptor starts one: { do: 'armature', joints: [{ id: 'chest', at: [0, 0.1, 0], r: 0.27 }, { id: 'head', at: [0, 0.5, 0.2], r: 0.2, parent: 'chest' }], lumps: 0.5, asym: 0.4 } (sculpt_manual topic 'armature'). A `stage` op sets the backdrop, light and camera for a look: { do: 'stage', style: 'balloon' } (sculpt_looks lists the looks). Each is one undo step, except refine, recipe and armature (several). A refused one stops the list and says which field was wrong; it changes nothing. Add `look` to get pictures after the change. Work in short runs and look between them.",
    inputSchema: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          description:
            "The operations. Each has a `do` field; sculpt_manual has the rest. A `reference` op may take a local file path as `src`.",
          items: {
            type: "object",
            properties: { do: { type: "string" } },
            required: ["do"],
          },
        },
        keepGoing: {
          type: "boolean",
          description: "Carry on past an operation that is refused.",
        },
        look: LOOK,
      },
      required: ["ops"],
    },
    run: async (s, { ops, keepGoing, look }) => {
      if (!Array.isArray(ops) || !ops.length)
        throw new Error(
          "Pass ops: a list of operations, each with a `do` field.",
        );
      const prepared = ops.map((op) =>
        op?.do === "reference" && typeof op.src === "string"
          ? { ...op, src: pictureSource(op.src) }
          : op,
      );
      const answer = await s.run(prepared, { keepGoing: keepGoing === true });
      const slim = {
        ...answer,
        state: answer.state && {
          ...answer.state,
          layers: answer.state.layers?.map(({ id: _id, ...l }) => l),
        },
      };
      const shots = lookOf(look);
      return shots ? { ...slim, look: await s.look(shots) } : slim;
    },
  },
  {
    name: "sculpt_look",
    description:
      "Take pictures of the clay. pass 'color' is the studio's look; 'normal' shows which way the skin faces (form without paint: ridges and folds show plainly); 'depth' near is white; 'layers' colors each layer (a legend says which); 'silhouette' is white on black. views is a list of names (front, back, side, left, top, bottom, three-quarter, hero) or { azimuth, elevation }. focus: { at: [x, y, z], radius } closes in on a spot in world units. grid: true joins the views into one picture.",
    inputSchema: {
      type: "object",
      properties: {
        views: {
          type: "array",
          items: {},
          description: "Default: front, side, three-quarter.",
        },
        pass: {
          type: "string",
          enum: ["color", "normal", "depth", "layers", "silhouette"],
        },
        size: {
          type: "number",
          description: "Longest side in pixels, 64 to 2400 (default 640).",
        },
        grid: { type: "boolean" },
        focus: {
          type: "object",
          properties: {
            at: { type: "array", items: { type: "number" } },
            radius: { type: "number" },
          },
        },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (s, o) =>
      s.look({
        views: ["front", "side", "three-quarter"],
        size: 640,
        grid: o.grid ?? false,
        ...o,
      }),
  },
  {
    name: "sculpt_critique",
    description:
      "A critic's reading of the work in one view: the share of the clay that shows form or texture at this scale, the biggest smooth stretches with the clay point under each (put the next detail there), and a heat picture (smooth is cool blue, worked is warm). Run it after each stage.",
    inputSchema: {
      type: "object",
      properties: {
        view: {
          description:
            "A view name or { azimuth, elevation }. Default: the current camera.",
        },
        size: { type: "number" },
      },
    },
    annotations: { readOnlyHint: true },
    run: (s, o) => s.call("critique", o),
  },
  {
    name: "sculpt_check",
    description:
      "Will it print? The slicer's questions about the clay as it is (60 mm tall, as an export would be): is the surface closed, is it one body, are there sealed hollows, does it stand, is there a flat first layer, is any part thinner than 1.2 mm, does too much hang out over nothing. Answers PASS or FAIL for each, with one fix for each FAIL and where it is, then the one thing to do next. Run it when the form is done and again after each fix.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (s) => s.call("check"),
    show: (a) => ({
      text: [
        ...(a.report?.lines ?? []),
        `size ${(a.sizeMm ?? []).join(" x ")} mm` +
          (a.thin?.length
            ? `; thin at ${a.thin
                .slice(0, 3)
                .map((t) => `(${t.at.join(", ")}) mm`)
                .join(", ")}`
            : ""),
      ].join("\n"),
    }),
  },
  {
    name: "sculpt_compare",
    description:
      "Score the clay's shape against a picture: iou (1 is the same silhouette), which side has extra outline, and a red and blue difference picture. Both outlines are fitted to their own boxes, so only shape counts. `reference` is a file path or URL; leave it out to use the picture set with a `reference` op.",
    inputSchema: {
      type: "object",
      properties: {
        reference: { type: "string" },
        view: {},
        size: { type: "number" },
      },
    },
    annotations: { readOnlyHint: true },
    run: (s, { reference, view, size }) =>
      s.call("compare", {
        ...(reference ? { src: pictureSource(reference) } : {}),
        view,
        size,
      }),
  },
  {
    name: "sculpt_checkpoint",
    description:
      "Keep the clay as it is under a name, put a kept copy back, or list them. Six at most. Keep one before trying a direction; restore it if the direction was worse.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["save", "restore", "list"] },
        name: { type: "string" },
      },
      required: ["action"],
    },
    run: async (s, { action, name }) =>
      action === "list"
        ? { checkpoints: await s.call("checkpoints") }
        : s.call(
            action === "save" ? "checkpoint" : "restore",
            name ?? "checkpoint",
          ),
  },
  {
    name: "sculpt_status",
    description:
      "The notebook: the goal, what was done (the last few calls), whether the clay has been looked at, critiqued and checked since it changed, the checkpoints, and what to do next. It is saved in the output folder after every change, so after the bridge restarts (a new browser has no clay) call it with resume: true to rebuild the sculpt from the saved steps. Set the goal in a sentence with `goal` so a later run knows what this was for. Cheap and read-only unless you pass `goal` or `resume`.",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "What this sculpt is for, one sentence.",
        },
        resume: {
          type: "boolean",
          description:
            "Rebuild the sculpt from the saved steps (the studio must be empty, or pass replace).",
        },
        replace: {
          type: "boolean",
          description:
            "With resume: start over from the saved steps even if the studio has clay.",
        },
      },
    },
    run: async (s, { goal, resume, replace }) => {
      if (typeof goal === "string" && goal.trim()) journal.setGoal(goal);
      if (resume !== true)
        return { ...journal.status(), studio: brief(await s.call("state")) };
      const have = await s.call("state");
      if (have.undo > 0 && replace !== true)
        throw new Error(
          `The studio already has work in it (${have.undo} undo steps, ${have.triangles} triangles). Pass replace: true to start over from the saved steps, or leave resume out to carry on from this clay.`,
        );
      const steps = journal.replay();
      if (!steps.length) throw new Error("There is no saved run to rebuild.");
      if (!journal.status().replayable)
        throw new Error(
          "The saved run is too long or has a script that was too long to keep, so it cannot be rebuilt exactly. Start again with { do: 'new' }.",
        );
      pending = false;
      untouched = false;
      if (!steps[0].ops?.some((o) => o?.do === "new"))
        await s.run([{ do: "new" }]);
      let n = 0;
      for (const step of steps) {
        n++;
        let failed = null;
        if (step.ops) {
          const r = await s.run(
            step.ops.map((op) =>
              op?.do === "reference" && typeof op.src === "string"
                ? { ...op, src: pictureSource(op.src) }
                : op,
            ),
          );
          if (!r.ok) failed = `${r.error} (op ${r.failedAt})`;
        } else if (step.script) await s.script(step.script);
        else if (step.checkpoint) await s.call("checkpoint", step.checkpoint);
        else if (step.restore) await s.call("restore", step.restore);
        if (failed)
          return {
            ok: false,
            rebuilt: n - 1,
            of: steps.length,
            stoppedAt: n,
            error: failed,
            ...journal.status(),
          };
      }
      journal.replayed();
      return {
        ok: true,
        rebuilt: steps.length,
        ops: journal.status().ops,
        studio: brief(await s.call("state")),
        ...journal.status(),
      };
    },
  },
  {
    name: "sculpt_script",
    description:
      "Run your own JavaScript in the studio page, where `clayground` is in scope (an async function body: use await and return a JSON-serializable value). For anything the other tools do not cover: clayground.surface({ ... }) for points on the skin, clayground.nearest, clayground.ray, clayground.geo helpers, loops that compute an op list from measurements. Any dataUrl in the answer becomes a picture.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    },
    run: (s, { code }) => s.script(String(code)),
  },
  {
    name: "sculpt_export",
    description:
      "Save the sculpt as a file in the output folder on this computer: glb, obj, stl, stl-layers, png or clayweb. Returns the file's path.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["glb", "obj", "stl", "stl-layers", "png", "clayweb"],
        },
      },
      required: ["kind"],
    },
    run: (s, { kind }) => s.export(kind),
  },
];

/* ---------- JSON-RPC over stdio ---------- */

const send = (message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

/** A saved run is waiting for this studio, which has had nothing done in it (the bridge was restarted). */
let pending = false;
let started = false;
/** The studio is as it opened: with its starting ball of clay and nothing made yet. */
let untouched = false;

async function callTool(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool)
    throw Object.assign(new Error(`Unknown tool ${name}`), { code: -32602 });
  return alone(async () => {
    try {
      const s = await studio();
      const notes = [];
      if (!started) {
        started = true;
        const have = await s.call("state").catch(() => null);
        untouched = have?.undo === 0;
        pending = untouched && journal.state.steps.length > 0;
        if (pending && name !== "sculpt_status")
          notes.push(
            `A saved run is waiting: ${journal.describe()}. sculpt_status { resume: true } rebuilds it.`,
          );
      }
      let given = input ?? {};
      if (name === "sculpt_do" && Array.isArray(given.ops)) {
        const fresh = given.ops.some((o) => o?.do === "new");
        if (pending) {
          // Never write over a saved run without being told to: starting with `new` is being told.
          if (!fresh)
            throw new Error(
              `A saved run is waiting for this empty studio (${journal.describe()}). Call sculpt_status { resume: true } to carry on from it, or start your ops with { do: "new" } to begin again (the saved run is kept as a file).`,
            );
          notes.push(`The saved run was kept as ${journal.setAside()}.`);
          pending = false;
        } else if (untouched && !fresh && !config.cdp) {
          // The studio opens with a ball of clay to build on; an agent almost never means that.
          given = { ...given, ops: [{ do: "new" }, ...given.ops] };
          notes.push(
            "The studio opens with a ball of clay, so the first op started from a clean sculpt ({ do: 'new' } first; send your own to choose the detail).",
          );
        }
        untouched = false;
      } else if (name === "sculpt_script") untouched = false;
      const answer = await tool.run(s, given);
      let next = "";
      try {
        next = journal.note(name, given, answer);
      } catch (e) {
        log(`notebook: ${e instanceof Error ? e.message : e}`);
      }
      const shown = tool.show ? tool.show(answer) : answer;
      const out =
        shown &&
        typeof shown === "object" &&
        typeof shown.text === "string" &&
        Object.keys(shown).length === 1
          ? { content: [{ type: "text", text: shown.text }] }
          : present(shown, s, name.replace(/^sculpt_/, ""));
      return {
        ...out,
        content: [
          ...out.content,
          ...notes.map((text) => ({ type: "text", text })),
          ...(next ? [{ type: "text", text: `Next: ${next}` }] : []),
        ],
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`${name}: ${message.slice(0, 200)}`);
      return {
        isError: true,
        content: [
          { type: "text", text: message },
          { type: "text", text: `Next: ${journal.refused(name)}` },
        ],
      };
    }
  });
}

async function handle(message) {
  const { id, method, params } = message;
  const reply = (result) => id !== undefined && send({ id, result });
  const fail = (code, text) =>
    id !== undefined && send({ id, error: { code, message: text } });
  try {
    if (method === "initialize") {
      const asked = params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER,
        instructions:
          "Sculpts in the Clayground browser studio. Call sculpt_manual first (topic 'card' if your context is short; then 'detail' and 'seeing'). For a quick start use sculpt_recipes (vase, mug, planter, fella, and the characters grin, balloon, goo, bruiser). To sculpt a character with an art direction, read sculpt_looks, build or sketch in a look, stage it with sculpt_do { do: 'stage', style }, and read the colors with sculpt_style_check. To make it look hand-sculpted and not generated, read sculpt_manual topic 'craft', block the figure in with an `armature` op (spheres joined by bones, then bigger to smaller), and run sculpt_craft_check. Work in short runs with sculpt_do and look between them with `look`; use sculpt_critique to find the blank stretches, sculpt_checkpoint before a risky direction, and sculpt_check to see whether it prints (PASS or FAIL, one fix each). Every answer ends with a 'Next:' line: when unsure, do that. sculpt_status is the notebook: set a goal, see what was done, and after a restart pass resume: true to rebuild the sculpt. What you make is marked as agent-made and cannot be published by this server.",
      });
    }
    if (
      method === "notifications/initialized" ||
      method?.startsWith("notifications/")
    )
      return;
    if (method === "ping") return reply({});
    if (method === "tools/list")
      return reply({
        tools: TOOLS.map(({ run: _run, ...tool }) => tool),
      });
    if (method === "tools/call")
      return reply(await callTool(params?.name, params?.arguments));
    return fail(-32601, `Method not found: ${method}`);
  } catch (e) {
    return fail(e?.code ?? -32603, e instanceof Error ? e.message : String(e));
  }
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: "Parse error" } });
  }
  // Requests are answered when done; a long sculpt step does not block the next read.
  void handle(message);
});
lines.on("close", async () => {
  try {
    if (opening) await (await opening).close();
  } finally {
    process.exit(0);
  }
});
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

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
 * ops and look again in one call, critique the work, score its shape against a
 * picture, keep and restore checkpoints, run your own code in the page, and
 * export files to a folder on this computer. Nothing is uploaded: the studio
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
import { join } from "node:path";
import { openStudio, pictureSource, bytesOf } from "./page.mjs";

const SERVER = { name: "clayground-studio", version: "2.0.0" };
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

/* ---------- the tools ---------- */

const TOOLS = [
  {
    name: "sculpt_manual",
    description:
      "Read how to sculpt in the Clayground studio. Start with no topic, then read 'detail' (scales, studs, fur, wrinkles, arrays, lofts) and 'seeing' (normals, critique, compare, checkpoints) before sculpting. Topics: coordinates, shape, sweep, spin, fill, brush, layer, detail, camera, seeing, geo, workflow, recipes, limits, all.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string" } },
    },
    annotations: { readOnlyHint: true },
    run: async (s, { topic }) => ({ text: await s.call("help", topic) }),
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
      "Change the sculpt with a list of operations, in order (shape, sweep, spin, fill, brush, layer, array, loft, texture, refine, camera, look, backdrop, reference, new, undo, redo, checkpoint, restore). Each is one undo step, except refine (finer clay for one part: several). A refused one stops the list and says which field was wrong; it changes nothing. Add `look` to get pictures after the change. Work in short runs and look between them.",
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

async function callTool(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool)
    throw Object.assign(new Error(`Unknown tool ${name}`), { code: -32602 });
  return alone(async () => {
    try {
      const s = await studio();
      const answer = await tool.run(s, input ?? {});
      if (
        answer &&
        typeof answer === "object" &&
        typeof answer.text === "string" &&
        Object.keys(answer).length === 1
      )
        return { content: [{ type: "text", text: answer.text }] };
      return present(answer, s, name.replace(/^sculpt_/, ""));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`${name}: ${message.slice(0, 200)}`);
      return { isError: true, content: [{ type: "text", text: message }] };
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
          "Sculpts in the Clayground browser studio. Call sculpt_manual first (and its 'detail' and 'seeing' topics). Work in short runs with sculpt_do and look between them with `look`; use sculpt_critique to find the blank stretches, sculpt_checkpoint before a risky direction. What you make is marked as agent-made and cannot be published by this server.",
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

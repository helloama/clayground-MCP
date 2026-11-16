/**
 * Open the Clayground studio in a browser the script controls, and talk to
 * window.clayground in it. Shared by the MCP server (mcp.mjs) and by scripts
 * that sculpt on their own (examples/).
 *
 *   const studio = await openStudio({ url: "http://localhost:3000/sculpt" });
 *   await studio.run([{ do: "shape", shape: "sphere", at: [0, 0, 0], size: 0.4 }]);
 *   const { files } = await studio.look({ views: ["front", "side"] });
 *   await studio.close();
 *
 * Needs the `playwright` package and a browser: Google Chrome, or Chromium from
 * `npx playwright install chromium`. Nothing is uploaded: the studio runs in
 * that browser and the clay stays on this computer. The door cannot publish,
 * mint or sign in, and what it makes is marked madeWith: agent.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, extname } from "node:path";

export const DEFAULT_URL = "https://www.clayvr.com/sculpt";

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** A local file path becomes a data: URL the page can load; anything else passes through. */
export function pictureSource(src) {
  if (typeof src !== "string" || /^(https?:|data:|blob:)/i.test(src))
    return src;
  const path = resolve(src.replace(/^~(?=$|\/)/, homedir()));
  if (!existsSync(path)) throw new Error(`There is no picture at ${path}`);
  const type = MIME[extname(path).toLowerCase()];
  if (!type) throw new Error(`${path} is not a png, jpg, webp or gif`);
  return `data:${type};base64,${readFileSync(path).toString("base64")}`;
}

/** The data: URL of an image, as bytes. */
export const bytesOf = (dataUrl) =>
  Buffer.from(String(dataUrl).split(",")[1] ?? "", "base64");

/**
 * Opens the studio. Options:
 *   url      the studio page (default the live site; use http://localhost:3000/sculpt for a dev server)
 *   headed   show the browser window, so a person can watch the sculpt grow
 *   cdp      attach to a Chrome you started with --remote-debugging-port=9222 instead of launching one
 *   width, height   the window (default 1280 by 900; the studio hides some labels when narrower than about 1200)
 *   out      where pictures and exports are saved (default ~/clayground-agent)
 *   software force software WebGL (the default on Linux without a display)
 */
export async function openStudio(options = {}) {
  const {
    url = process.env.CLAYGROUND_URL || DEFAULT_URL,
    headed = false,
    cdp = process.env.CLAYGROUND_CDP || "",
    width = 1280,
    height = 900,
    out = process.env.CLAYGROUND_OUT || join(homedir(), "clayground-agent"),
    software = process.platform === "linux" && !process.env.DISPLAY,
    log = (m) => process.stderr.write(`[clayground] ${m}\n`),
  } = options;
  const { chromium } = await import("playwright");
  mkdirSync(out, { recursive: true });
  let browser,
    context,
    owned = true;
  if (cdp) {
    browser = await chromium.connectOverCDP(cdp);
    context = browser.contexts()[0] ?? (await browser.newContext());
    owned = false;
  } else {
    const launch = {
      headless: !headed,
      args: software
        ? [
            "--use-angle=swiftshader",
            "--use-gl=angle",
            "--enable-unsafe-swiftshader",
          ]
        : [],
    };
    try {
      browser = await chromium.launch(launch);
    } catch (e) {
      // No bundled Chromium: use the Google Chrome that is already installed.
      if (!/Executable doesn't exist/i.test(String(e?.message))) throw e;
      browser = await chromium
        .launch({ ...launch, channel: "chrome" })
        .catch(() => {
          throw new Error(
            "No browser to drive. Install Google Chrome, or run: npx playwright install chromium",
          );
        });
    }
    context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
    });
  }
  const page = await context.newPage();
  if (cdp) await page.setViewportSize({ width, height }).catch(() => {});
  page.on("pageerror", (e) => log(`page error: ${e.message.slice(0, 300)}`));
  // Skip the first-visit tour and tips: a script is not a first-time visitor.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("clay.studio.starters", "1");
      localStorage.setItem("clay.phoneTips", "1");
    } catch {}
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .waitForFunction(() => !!window.clayground, null, { timeout: 180000 })
    .catch(() => {
      throw new Error(
        `${url} did not offer window.clayground in time. Is it the studio page (/sculpt) of a build that has the agent door?`,
      );
    });
  await page.waitForTimeout(1200);
  log(`studio open at ${url}`);

  let counter = 0;
  const stamp = () => String(++counter).padStart(3, "0");

  const studio = {
    page,
    out,
    /** Run ops (see clayground.help()). Resolves to the door's own answer; `ok` is false when one was refused. */
    run: (ops, o = {}) =>
      page.evaluate(([ops, o]) => window.clayground.run(ops, o), [ops, o]),
    /** Call any function of the door by name: studio.call("critique", { view: "front" }). */
    call: (name, ...args) =>
      page.evaluate(
        async ([name, args]) => {
          const f = window.clayground[name];
          if (typeof f !== "function")
            throw new Error(`clayground.${name} is not a function`);
          return f.apply(window.clayground, args);
        },
        [name, args],
      ),
    /** Run your own code in the page, where `clayground` is in scope: studio.script("return clayground.state()"). */
    script: (code) =>
      page.evaluate(
        async ([code]) => {
          const f = new Function(
            "clayground",
            `return (async () => { ${code}\n})()`,
          );
          return f(window.clayground);
        },
        [code],
      ),
    /** Pictures of the work, saved as files; returns their paths and the data too. */
    async look(o = {}) {
      const r = await studio.call("render", {
        size: 768,
        format: (o.pass ?? "color") === "color" ? "jpeg" : "png",
        ...o,
      });
      const files = r.images.map((img) => {
        const ext = img.dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
        const file = join(
          out,
          `look-${stamp()}-${r.pass}-${String(img.view)
            .replace(/[^a-z0-9]+/gi, "-")
            .slice(0, 40)}.${ext}`,
        );
        writeFileSync(file, bytesOf(img.dataUrl));
        img.file = file;
        return file;
      });
      return { ...r, files };
    },
    /** Download an export (glb, obj, stl, stl-layers, png, clayweb) into the output folder. */
    async export(kind = "glb") {
      const waiting = page.waitForEvent("download", { timeout: 120000 });
      const answer = await studio.call("export", kind);
      const download = await waiting;
      const file = join(out, `${stamp()}-${download.suggestedFilename()}`);
      await download.saveAs(file);
      return { ...answer, path: file };
    },
    /** Save a data: URL picture from any result (a critique's heat map, a compare's diff). */
    save(dataUrl, name = "picture") {
      const ext = String(dataUrl).startsWith("data:image/jpeg") ? "jpg" : "png";
      const file = join(out, `${stamp()}-${name}.${ext}`);
      writeFileSync(file, bytesOf(dataUrl));
      return file;
    },
    async close() {
      if (owned) await browser.close().catch(() => {});
      else await page.close().catch(() => {});
    },
  };
  return studio;
}

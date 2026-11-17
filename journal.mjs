/**
 * The bridge's notebook: what was asked for, every change that worked, and
 * what to do next. It lives in a file in the output folder, so a run can pick
 * up after the bridge restarts (a new browser starts with no clay), and every
 * answer can end with one line that says what to try next. That line is for
 * small models and short contexts: with no plan of their own they follow it.
 *
 * Pure apart from the one file it writes. Stands alone: the public repository
 * has a copy of this file and nothing else from the studio.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Ops kept for a replay. Past this the notebook still advises but cannot rebuild the sculpt. */
const MAX_OPS = 3000;
/** A script longer than this is not kept, and a replay says so. */
const MAX_SCRIPT = 20000;
/** Changes before the notebook asks for a critique, and for a print check. */
const CRITIQUE_AFTER = 3;
const CHECK_AFTER = 6;
/** Ops that leave the clay as it was. */
const QUIET = new Set([
  "look",
  "camera",
  "backdrop",
  "reference",
  "checkpoint",
]);

const fresh = () => ({
  version: 1,
  goal: "",
  updated: "",
  /** Calls that changed the clay, each with the ops that worked, in order. */
  steps: [],
  ops: 0,
  /** True when a replay would not match: ops were dropped, a script was too long. */
  inexact: false,
  /** Changes since the last look, critique and print check; 0 is up to date. */
  since: { look: 0, critique: 0, check: 0 },
  check: null,
  exported: null,
  checkpoints: [],
});

/** "shape x3, spin, layer x2": what a list of ops did, in a few words. */
export function summarize(ops) {
  const n = new Map();
  for (const o of ops) {
    const k = String(o?.do ?? o?.op ?? "?") + (o?.name ? ` ${o.name}` : "");
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n].map(([k, c]) => (c > 1 ? `${k} x${c}` : k)).join(", ");
}

const first = (text, n = 160) => {
  const t = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? `${t.slice(0, n - 1)}...` : t;
};

export function createJournal(file) {
  let st = fresh();
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    if (saved?.version === 1 && Array.isArray(saved.steps))
      st = {
        ...fresh(),
        ...saved,
        since: { ...fresh().since, ...saved.since },
      };
  } catch {
    // no notebook yet, or one that cannot be read: start a new one
  }

  const save = () => {
    st.updated = new Date().toISOString();
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(st));
    renameSync(tmp, file);
  };
  const changed = () => {
    st.since.look++;
    st.since.critique++;
    st.since.check++;
  };
  const keep = (step) => {
    const n = step.ops ? step.ops.length : 1;
    if (st.ops + n > MAX_OPS) {
      st.inexact = true;
      return;
    }
    st.steps.push({ at: new Date().toISOString(), ...step });
    st.ops += n;
  };

  /** What to try next, from where the notebook stands. One line, no "Next:". */
  function advise(tool, answer) {
    if (tool === "sculpt_do" && answer?.ok === false)
      return `fix the op at index ${answer.failedAt ?? 0} (${first(answer.error, 140)}) and send the ops from there again; the ${answer.done ?? 0} before it are done`;
    if (tool === "sculpt_manual")
      return answer?.topic
        ? "sculpt_do with a few ops and look: { views: ['three-quarter'] }"
        : "read the 'detail' and 'seeing' topics, then sculpt_recipes for a quick start or sculpt_do for your own shapes";
    if (tool === "sculpt_recipes")
      return 'sculpt_do { ops: [{ do: "recipe", name: "<one of these>", ...settings }], look: { views: ["three-quarter"] } }';
    if (tool === "sculpt_check") {
      const c = st.check;
      if (!c) return "sculpt_do to make something first";
      return c.ok
        ? "sculpt_export stl (or stl-layers); it passes"
        : first(c.next ?? "fix the first FAIL and run sculpt_check again", 240);
    }
    if (tool === "sculpt_export")
      return "done: the file is saved; sculpt_status lists the steps you took";
    if (tool === "sculpt_checkpoint")
      return answer?.restored
        ? "sculpt_look to see the restored clay"
        : "go on with the risky change; sculpt_checkpoint restore if it is worse";
    if (tool === "sculpt_compare")
      return "sculpt_do to close the gap on the side it names, then sculpt_compare again";
    if (tool === "sculpt_critique")
      return "sculpt_do on the biggest smooth stretch it names, then sculpt_look";
    if (tool === "sculpt_look") {
      if (st.since.critique >= 2)
        return "sculpt_critique: it names the blank stretches";
      if (st.since.check >= CHECK_AFTER - 2)
        return "sculpt_check: does it print? It says what to fix";
      return "sculpt_do to change what looks wrong (worst part first), or sculpt_check when the form looks right";
    }
    // sculpt_do, sculpt_state, sculpt_script, sculpt_status
    if (!st.steps.length)
      return "sculpt_recipes for a quick start, or sculpt_do with a big shape for the body, then look";
    if (st.since.look > 0)
      return "sculpt_look to see what changed (front, side, three-quarter)";
    if (st.check && !st.check.ok && st.since.check > 0)
      return `sculpt_check again; the last one said ${first(st.check.failing?.[0] ?? "it fails", 120)}`;
    if (st.since.critique >= CRITIQUE_AFTER)
      return "sculpt_critique: it names the blank stretches; put the next detail on the biggest";
    if (st.since.check >= CHECK_AFTER)
      return "sculpt_check: does it print? It says what to fix";
    return "add the next feature with sculpt_do and look; sculpt_check when the form is done";
  }

  return {
    get state() {
      return st;
    },
    /** Record a finished tool call, and say what to try next. */
    note(tool, input, answer) {
      if (tool === "sculpt_do" && Array.isArray(input?.ops)) {
        const results = Array.isArray(answer?.results) ? answer.results : [];
        const worked = input.ops.filter((_, i) =>
          results[i] === undefined ? i < (answer?.done ?? 0) : results[i].ok,
        );
        if (worked.some((o) => o?.do === "new")) {
          const goal = st.goal;
          st = { ...fresh(), goal };
        }
        if (worked.length) {
          keep({ ops: worked });
          if (worked.some((o) => !QUIET.has(o?.do ?? o?.op))) changed();
          for (const o of worked)
            if (
              o?.do === "checkpoint" &&
              o.name &&
              !st.checkpoints.includes(o.name)
            )
              st.checkpoints.push(o.name);
        }
        // A look asked for with the change has been looked at.
        if (input.look && answer?.look) st.since.look = 0;
      } else if (tool === "sculpt_look" && answer?.ok !== false)
        st.since.look = 0;
      else if (tool === "sculpt_critique") st.since.critique = 0;
      else if (tool === "sculpt_check") {
        const r = answer?.report;
        st.check = r
          ? {
              ok: r.ok === true,
              failing: (r.lines ?? []).filter((l) => l.startsWith("FAIL")),
              next: r.next,
            }
          : null;
        st.since.check = 0;
      } else if (tool === "sculpt_export" && answer?.path)
        st.exported = { kind: input?.kind, file: answer.path };
      else if (tool === "sculpt_checkpoint") {
        const name = input?.name ?? "checkpoint";
        if (input?.action === "save") {
          if (!st.checkpoints.includes(name)) st.checkpoints.push(name);
          keep({ checkpoint: name });
        } else if (input?.action === "restore") {
          keep({ restore: name });
          changed();
        }
      } else if (tool === "sculpt_script" && typeof input?.code === "string") {
        // A script may change the clay or only read it; either way it is kept, in order.
        if (input.code.length <= MAX_SCRIPT) keep({ script: input.code });
        else st.inexact = true;
        changed();
      }
      try {
        save();
      } catch {
        // an unwritable folder must not stop the sculpting
      }
      const about =
        tool === "sculpt_checkpoint"
          ? { restored: input?.action === "restore" }
          : tool === "sculpt_manual"
            ? { topic: input?.topic }
            : answer;
      return advise(tool, about);
    },
    /** The advice for a call that was refused before it ran. */
    refused(tool) {
      return `fix what the message says and send the call again (sculpt_manual has the fields${tool === "sculpt_do" ? "; try topic 'workflow'" : ""})`;
    },
    /** Put a saved run aside under a dated name and start a clean notebook. */
    setAside() {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const kept = file.replace(/\.json$/, `-${stamp}.json`);
      try {
        if (st.steps.length) {
          save();
          renameSync(file, kept);
        }
      } catch {
        // if it cannot be kept, it is replaced
      }
      st = fresh();
      return kept;
    },
    /** A saved run in a sentence, for the first call after a restart. */
    describe() {
      return `goal ${st.goal ? `"${first(st.goal, 100)}"` : "not set"}, ${st.steps.length} calls and ${st.ops} ops, last saved ${st.updated || "never"}`;
    },
    setGoal(text) {
      st.goal = first(text, 400);
      try {
        save();
      } catch {
        // see note()
      }
    },
    /** The notebook in a few lines, for sculpt_status. */
    status() {
      return {
        goal: st.goal || null,
        calls: st.steps.length,
        ops: st.ops,
        recent: st.steps
          .slice(-6)
          .map((s) =>
            s.ops
              ? summarize(s.ops)
              : s.script
                ? `script (${s.script.length} characters)`
                : s.checkpoint
                  ? `checkpoint ${s.checkpoint}`
                  : `restore ${s.restore}`,
          ),
        needs: {
          look: st.since.look > 0,
          critique: st.since.critique >= CRITIQUE_AFTER,
          check: st.since.check > 0,
        },
        lastCheck: st.check,
        exported: st.exported,
        checkpoints: st.checkpoints,
        replayable: st.steps.length > 0 && !st.inexact,
        notebook: file,
      };
    },
    /** The saved steps, in order, for a replay: each is { ops } | { script } | { checkpoint } | { restore }. */
    replay() {
      return st.steps.map(({ at: _at, ...step }) => step);
    },
    /** After a replay the clay is as it was, but nothing has been looked at in this session. */
    replayed() {
      st.since = { look: 1, critique: 0, check: st.check ? 1 : 0 };
      try {
        save();
      } catch {
        // see note()
      }
    },
  };
}

// The scorer (program/v1, node22). It runs after the entry, in a container of its own: the entry's outputs read-only
// at /output, the instance's reference read-only at /reference (generator/draw.ts writes it: manifest.json and a copy of
// every instance file under <id>/), and /scores writable. It never runs the entry's code: it reads the entry's answer
// files and hands them to the checker (checker/check.mjs), a pure module that reads no file.
//
// Each instance's answer is its OUTPUTS files at /output/<id>/<name>, each a regular file (never through a link) of at
// most its max_bytes, a text one UTF-8. An instance missing any of them, or one the checker calls invalid, is
// unanswered: 0 points. Otherwise its points are the checker's points(files, key, outputs), 0 to 1000.
//
// It writes
//   /scores/scores.json  score (1000 x the mean points, rounded half up: 0 to 1000000), passed (1 when every instance
//                        is answered in its stated format: the gate), answered, instances, and each instance's points x
//                        1000, rounded half up (i001, ...: hidden columns)
//   /scores/checks.json  one row per instance: its points of 1000, passing when answered, the checker's detail
//
// A reference that does not read, or a checker that throws or answers outside {points 0 to 1000, valid, detail} (points
// for an answer it calls invalid included), is the scorer's fault: it exits 1, never the entry's. Outside a container
// MAKEFUN_OUTPUT_DIR, MAKEFUN_REFERENCE_DIR and MAKEFUN_SCORES_DIR stand in for the mounts.

import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The subject's checker, imported by its URL (a .mjs or .js module carries no types) and typed by its contract. */
const { points } = (await import(new URL("./checker/check.mjs", import.meta.url).href)) as {
  points: (files: Record<string, string | Uint8Array>, key: unknown, outputs: Record<string, string | Uint8Array>) => unknown;
};

const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const REFERENCE_DIR = process.env.MAKEFUN_REFERENCE_DIR ?? '/reference';
const SCORES_DIR = process.env.MAKEFUN_SCORES_DIR ?? '/scores';

const MANIFEST_FORMAT = "makefun/solver-home/manifest/v1";
/** How many instances a set holds. */
const INSTANCES = 40;
/** Each instance's answer files. */
const OUTPUTS: readonly { name: string; kind: 'text' | 'bytes'; max_bytes: number }[] = [
  { name: "stdout.bin", kind: "bytes", max_bytes: 65536 },
  { name: "exit.txt", kind: "text", max_bytes: 16 },
];
const POINTS_MAX = 1000;
/** The longest detail a check row carries. */
const DETAIL_MAX = 2000;

type Kind = 'text' | 'bytes';
interface Instance {
  id: string;
  files: { name: string; kind: Kind; sha256: string }[];
  key: unknown;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const idOf = (k: number): string => 'i' + String(k + 1).padStart(3, '0');

function readManifest(): Instance[] {
  const file = join(REFERENCE_DIR, 'manifest.json');
  if (!lstatSync(file).isFile()) throw new Error('the reference manifest.json is not a regular file');
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { format?: unknown; instances?: unknown };
  if (doc.format !== MANIFEST_FORMAT || !Array.isArray(doc.instances)) throw new Error('the reference manifest.json is not ' + MANIFEST_FORMAT);
  if (doc.instances.length !== INSTANCES) throw new Error('the reference manifest.json lists ' + doc.instances.length + ' instances, not ' + INSTANCES);
  const list = doc.instances as Instance[];
  list.forEach((inst, k) => {
    if (inst.id !== idOf(k) || !Array.isArray(inst.files) || inst.files.length === 0) throw new Error('the reference manifest.json holds a malformed instance at ' + k);
  });
  return list;
}

/** The instance's files as generate wrote them, each checked against the manifest's sha256. */
function filesOf(inst: Instance): Record<string, string | Uint8Array> {
  const out: Record<string, string | Uint8Array> = {};
  for (const f of inst.files) {
    const path = join(REFERENCE_DIR, inst.id, f.name);
    if (!lstatSync(path).isFile()) throw new Error('reference/' + inst.id + '/' + f.name + ' is not a regular file');
    const bytes = new Uint8Array(readFileSync(path));
    if (sha256(bytes) !== f.sha256) throw new Error('reference/' + inst.id + '/' + f.name + ' does not match the manifest');
    out[f.name] = f.kind === 'text' ? utf8.decode(bytes) : bytes;
  }
  return out;
}

/** The entry's answer files of instance id, or why it has none to score. */
function outputsOf(id: string): { outputs: Record<string, string | Uint8Array> } | { why: string } {
  const dir = join(OUTPUT_DIR, id);
  let st;
  try {
    st = lstatSync(dir);
  } catch {
    return { why: 'no /output/' + id + '/' };
  }
  if (!st.isDirectory()) return { why: '/output/' + id + ' is not a directory' };
  const outputs: Record<string, string | Uint8Array> = {};
  for (const o of OUTPUTS) {
    const path = join(dir, o.name);
    const shown = '/output/' + id + '/' + o.name;
    let f;
    try {
      f = lstatSync(path);
    } catch {
      return { why: 'no ' + shown };
    }
    if (!f.isFile()) return { why: shown + ' is not a regular file' };
    if (f.size > o.max_bytes) return { why: shown + ' is ' + f.size + ' bytes, over its ' + o.max_bytes };
    const bytes = new Uint8Array(readFileSync(path));
    if (o.kind === 'bytes') outputs[o.name] = bytes;
    else {
      try {
        outputs[o.name] = utf8.decode(bytes);
      } catch {
        return { why: shown + ' is not UTF-8 text' };
      }
    }
  }
  return { outputs };
}

/** The checker's verdict on one answer, held to its shape (the header). */
async function verdictOf(inst: Instance, outputs: Record<string, string | Uint8Array>): Promise<{ points: number; valid: boolean; detail: string | null }> {
  const r = (await points(filesOf(inst), inst.key, outputs)) as { points?: unknown; valid?: unknown; detail?: unknown } | null;
  const where = 'the checker\'s points() on ' + inst.id;
  if (r === null || typeof r !== 'object') throw new Error(where + ' answered no {points, valid, detail}');
  if (typeof r.points !== 'number' || !Number.isFinite(r.points) || r.points < 0 || r.points > POINTS_MAX) throw new Error(where + ' gave points ' + String(r.points) + ', not 0 to ' + POINTS_MAX);
  if (typeof r.valid !== 'boolean') throw new Error(where + ' answered no valid boolean');
  if (!r.valid && r.points !== 0) throw new Error(where + ' gave ' + r.points + ' points to an answer it calls invalid');
  if (r.detail !== undefined && r.detail !== null && typeof r.detail !== 'string') throw new Error(where + ' answered a detail that is not a string');
  return { points: r.points, valid: r.valid, detail: typeof r.detail === 'string' && r.detail !== '' ? r.detail : null };
}

const rows: { id: string; points: number; valid: boolean; detail: string | null }[] = [];
for (const inst of readManifest()) {
  const read = outputsOf(inst.id);
  if ('why' in read) rows.push({ id: inst.id, points: 0, valid: false, detail: read.why });
  else rows.push({ id: inst.id, ...(await verdictOf(inst, read.outputs)) });
}

const half = (x: number): number => Math.floor(x + 0.5);
const total = rows.reduce((a, r) => a + r.points, 0);
const answered = rows.filter((r) => r.valid).length;
const scores: Record<string, number> = { score: half((total * POINTS_MAX) / rows.length), passed: answered === rows.length ? 1 : 0, answered, instances: rows.length };
for (const r of rows) scores[r.id] = half(r.points * POINTS_MAX);
const checks = rows.map((r) => ({
  key: r.id,
  group: 'Instances',
  title: 'Instance ' + r.id,
  points: POINTS_MAX,
  earned: Math.round(r.points * 1000) / 1000,
  pass: r.valid,
  ...(r.detail === null ? {} : { detail: r.detail.slice(0, DETAIL_MAX) }),
}));

mkdirSync(SCORES_DIR, { recursive: true });
writeFileSync(join(SCORES_DIR, 'scores.json'), JSON.stringify(scores) + '\n');
writeFileSync(join(SCORES_DIR, 'checks.json'), JSON.stringify(checks) + '\n');

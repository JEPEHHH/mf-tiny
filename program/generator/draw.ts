// The instance generator (program/v1, node22): draws one set of 40 instances from /input/seed.json
// (server/competitions/instance.ts instanceSeedFile: a drand round's seed). Instance k (0-based, its id i001 for k 0)
// is the subject's generate(rng, k) (subject/generate.mjs) on a stream of its own (rng.ts streamFor: the seed, "instance"
// and k), and it writes
//
//   /output/input/<id>/<name>       each instance file, what an entry reads at /input/<id>/<name>
//   /output/reference/<id>/<name>   the same bytes again, for the scorer (it sees /reference and /output alone)
//   /output/reference/manifest.json {format, instances: [{id, files: [{name, kind, sha256}], key}]}: each instance's
//                                   files (text or bytes, as generate wrote them) and its key, a JSON value
//
// Pure: no clock, no network, no environment but the two directories (MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in
// for /input and /output outside a container), so two runs on one seed write the same bytes (grader/instance.ts draws
// twice and compares). A generate that answers anything but {files, key} (a file name off FILE_NAME, text that is not
// a well-formed string, a key that is no JSON value) fails the draw: the instance's fault, never an entry's.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { streamFor, type Rng } from './rng.ts';

/** The subject's generator, imported by its URL (a .mjs or .js module carries no types) and typed by its contract. */
const { generate } = (await import(new URL("./subject/generate.mjs", import.meta.url).href)) as { generate: (rng: Rng, index: number) => unknown };

export const MANIFEST_FORMAT = "makefun/solver-home/manifest/v1";
/** How many instances a set holds. */
export const INSTANCES = 40;
/** An instance file's name. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const seedFile = JSON.parse(readFileSync(join(INPUT_DIR, 'seed.json'), 'utf8')) as { schema?: unknown; seed?: unknown };
if (seedFile.schema !== 'agent-fun/instance-seed/v1' || typeof seedFile.seed !== 'string' || !/^[0-9a-f]{64}$/.test(seedFile.seed)) {
  throw new Error('/input/seed.json is not an agent-fun/instance-seed/v1 seed');
}
const seed = seedFile.seed;

const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const idOf = (k: number): string => 'i' + String(k + 1).padStart(3, '0');

type Drawn = { files: { name: string; kind: 'text' | 'bytes'; bytes: Uint8Array }[]; key: unknown };

/** generate's answer for instance id, held to its shape (the header). */
function checked(v: unknown, id: string): Drawn {
  const fail = (why: string): never => {
    throw new Error('generate answered ' + id + ' with ' + why);
  };
  if (v === null || typeof v !== 'object') fail('no {files, key}');
  const { files, key } = v as { files?: unknown; key?: unknown };
  if (files === null || typeof files !== 'object' || Array.isArray(files)) fail('no files object');
  const names = Object.keys(files as object).sort();
  if (names.length === 0) fail('no file');
  const out: Drawn['files'] = [];
  for (const name of names) {
    if (!FILE_NAME.test(name)) fail('the file name ' + JSON.stringify(name));
    const f = (files as Record<string, unknown>)[name];
    if (typeof f === 'string') {
      if (!f.isWellFormed()) fail('text that is not a well-formed string in ' + name);
      out.push({ name, kind: 'text', bytes: Buffer.from(f, 'utf8') });
    } else if (f instanceof Uint8Array) out.push({ name, kind: 'bytes', bytes: Uint8Array.from(f) });
    else fail('a file ' + name + ' that is neither text nor bytes');
  }
  const text = JSON.stringify(key);
  if (text === undefined) fail('no key (a JSON value)');
  return { files: out, key: JSON.parse(text) as unknown };
}

const instances: { id: string; files: { name: string; kind: 'text' | 'bytes'; sha256: string }[]; key: unknown }[] = [];
for (let k = 0; k < INSTANCES; k++) {
  const id = idOf(k);
  const drawn = checked(await generate(streamFor(seed, 'instance', k), k), id);
  for (const side of ['input', 'reference']) {
    mkdirSync(join(OUTPUT_DIR, side, id), { recursive: true });
    for (const f of drawn.files) writeFileSync(join(OUTPUT_DIR, side, id, f.name), f.bytes);
  }
  instances.push({ id, files: drawn.files.map((f) => ({ name: f.name, kind: f.kind, sha256: sha256(f.bytes) })), key: drawn.key });
}
writeFileSync(join(OUTPUT_DIR, 'reference', 'manifest.json'), JSON.stringify({ format: MANIFEST_FORMAT, instances }) + '\n');

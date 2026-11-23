// tiny-stack-vm-01's generator (scripts/releases/new-solver-home.ts's contract): instance k of a set is one bytecode
// program of make.fun's tiny stack ISA (ISA.md beside this file) and its input bytes. Instances i001 to i026 draw a
// NORMAL kind (programs.mjs: expressions, generator loops, collatz, recursion, sorting, input, primes, bit counting),
// one after another by index; i027 to i040, the edge cases, each draw one of the EDGE kinds uniformly (one hard rule
// of the ISA each: wrapping, signed and unsigned division, shifts, sign extension, every trap, the step and output
// limits, the end of input). The expected output and exit code are the reference VM's (vm.mjs) on the drawn program,
// and the key holds them: {kind, exit, stdout (base64)}.

import { Buffer } from 'node:buffer';
import { assemble } from './asm.mjs';
import { EDGE, NORMAL } from './programs.mjs';
import { run } from './vm.mjs';

/** How many programs a set holds, and the first edge case's index (0-based): 14 edge cases of 40. */
export const PROGRAMS = 40;
export const EDGE_FROM = 26;
/** Draws a kind may take before the instance fails (each kind keeps nearly every draw). */
const ATTEMPTS = 200;

export function generate(rng, index) {
  // The kind is drawn once, then its program until the kind keeps one, so every kind is as likely as the next.
  const kind = index >= EDGE_FROM ? rng.pick(EDGE) : NORMAL[index % NORMAL.length];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const { items, input } = kind.make(rng);
    const program = assemble(items);
    const stdin = Uint8Array.from(input);
    const r = run(program, stdin);
    if (!kind.accept(r)) continue;
    return {
      files: { 'program.bin': program, 'input.bin': stdin },
      key: { kind: kind.name, exit: r.exit, stdout: Buffer.from(r.stdout).toString('base64') },
    };
  }
  throw new Error('instance ' + index + ': no program kept in ' + ATTEMPTS + ' draws');
}

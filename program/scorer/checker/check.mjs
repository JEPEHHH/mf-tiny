// tiny-stack-vm-01's checker (scripts/releases/new-solver-home.ts's contract): an instance is one program, and the
// entry's answer is what its VM wrote for it, stdout.bin (bytes), and the exit code it ended with, exit.txt (one whole
// number 0 to 255 in decimal, a newline after it or not). 800 points when stdout.bin is byte for byte the reference
// VM's output, 200 when the exit code is its exit code (a trap's code included), each on its own. An exit.txt in any
// other form makes the answer invalid. The key is the generator's: {kind, exit, stdout (base64)}.

import { Buffer } from 'node:buffer';

export const STDOUT_POINTS = 800;
export const EXIT_POINTS = 200;

export function points(files, key, outputs) {
  const m = /^(0|[1-9][0-9]{0,2})\n?$/.exec(outputs['exit.txt']);
  if (m === null || Number(m[1]) > 255) return { points: 0, valid: false, detail: 'exit.txt is not one exit code, 0 to 255 in decimal' };
  const exit = Number(m[1]);
  const want = Buffer.from(key.stdout, 'base64');
  const got = Buffer.from(outputs['stdout.bin']);
  const sameOut = got.equals(want);
  const sameExit = exit === key.exit;
  const said = [];
  if (!sameOut) {
    let at = 0;
    while (at < got.length && at < want.length && got[at] === want[at]) at++;
    said.push(`stdout differs from byte ${at} (${got.length} bytes written, ${want.length} expected)`);
  }
  if (!sameExit) said.push(`exit code ${exit}, expected ${key.exit}`);
  return { points: (sameOut ? STDOUT_POINTS : 0) + (sameExit ? EXIT_POINTS : 0), valid: true, detail: said.join('; ') };
}

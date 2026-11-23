import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STACK_MAX = 256;
const CALLS_MAX = 64;
const MEMORY_WORDS = 256;
const STEP_LIMIT = 1_000_000;
const OUTPUT_MAX = 65_536;

const TRAP_UNDERFLOW = 2;
const TRAP_OVERFLOW = 3;
const TRAP_DIV_ZERO = 4;
const TRAP_BAD_OPCODE = 5;
const TRAP_MEMORY = 6;
const TRAP_CALL_DEPTH = 7;
const TRAP_RET_EMPTY = 8;
const TRAP_PC = 9;
const TRAP_STEPS = 10;
const TRAP_OUTPUT = 11;

// Opcode metadata: [immBytes, pops, pushes]
const OP_INFO = new Map<number, readonly [number, number, number]>([
  [0x00, [0, 0, 0]], // HALT
  [0x01, [1, 0, 1]], // PUSH8
  [0x02, [4, 0, 1]], // PUSH32
  [0x03, [0, 1, 0]], // POP
  [0x04, [0, 1, 2]], // DUP
  [0x05, [0, 2, 2]], // SWAP
  [0x06, [0, 2, 3]], // OVER
  [0x07, [0, 3, 3]], // ROT
  [0x10, [0, 2, 1]], // ADD
  [0x11, [0, 2, 1]], // SUB
  [0x12, [0, 2, 1]], // MUL
  [0x13, [0, 2, 1]], // DIV
  [0x14, [0, 2, 1]], // MOD
  [0x15, [0, 2, 1]], // DIVU
  [0x16, [0, 2, 1]], // MODU
  [0x17, [0, 1, 1]], // NEG
  [0x18, [0, 2, 1]], // AND
  [0x19, [0, 2, 1]], // OR
  [0x1a, [0, 2, 1]], // XOR
  [0x1b, [0, 1, 1]], // NOT
  [0x1c, [0, 2, 1]], // SHL
  [0x1d, [0, 2, 1]], // SHR
  [0x1e, [0, 2, 1]], // SHRU
  [0x20, [0, 2, 1]], // EQ
  [0x21, [0, 2, 1]], // LT
  [0x22, [0, 2, 1]], // LTU
  [0x30, [2, 0, 0]], // JMP
  [0x31, [2, 1, 0]], // JZ
  [0x32, [2, 1, 0]], // JNZ
  [0x33, [2, 0, 0]], // CALL
  [0x34, [0, 0, 0]], // RET
  [0x40, [0, 1, 1]], // LOAD
  [0x41, [0, 2, 0]], // STORE
  [0x50, [0, 1, 0]], // PRINT
  [0x51, [0, 1, 0]], // PUTC
  [0x52, [0, 0, 1]], // IN
  [0x53, [0, 1, 0]], // EXIT
]);

function runVm(program: Uint8Array, input: Uint8Array): { stdout: Uint8Array; exit: number } {
  const n = program.length;
  const D = new Int32Array(STACK_MAX);
  const C = new Int32Array(CALLS_MAX);
  const M = new Int32Array(MEMORY_WORDS);
  const out = new Uint8Array(OUTPUT_MAX);
  let sp = 0;
  let csp = 0;
  let olen = 0;
  let inPos = 0;
  let pc = 0;
  let steps = 0;

  const done = (exit: number) => ({ stdout: out.subarray(0, olen), exit });

  for (;;) {
    if (steps === STEP_LIMIT) return done(TRAP_STEPS);
    if (pc < 0 || pc >= n) return done(TRAP_PC);
    const op = program[pc];
    const meta = OP_INFO.get(op);
    if (meta === undefined) return done(TRAP_BAD_OPCODE);
    const [imm, pops, pushes] = meta;
    if (pc + imm >= n) return done(TRAP_PC);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return done(TRAP_UNDERFLOW);
    if (sp - pops + pushes > STACK_MAX) return done(TRAP_OVERFLOW);
    pc = next;

    switch (op) {
      case 0x00:
        return done(0);
      case 0x01:
        D[sp++] = (program[next - 1] << 24) >> 24;
        break;
      case 0x02:
        D[sp++] =
          program[next - 4] |
          (program[next - 3] << 8) |
          (program[next - 2] << 16) |
          (program[next - 1] << 24);
        break;
      case 0x03:
        sp--;
        break;
      case 0x04:
        D[sp] = D[sp - 1];
        sp++;
        break;
      case 0x05: {
        const t = D[sp - 1];
        D[sp - 1] = D[sp - 2];
        D[sp - 2] = t;
        break;
      }
      case 0x06:
        D[sp] = D[sp - 2];
        sp++;
        break;
      case 0x07: {
        const a = D[sp - 3];
        D[sp - 3] = D[sp - 2];
        D[sp - 2] = D[sp - 1];
        D[sp - 1] = a;
        break;
      }
      case 0x17:
        D[sp - 1] = -D[sp - 1] | 0;
        break;
      case 0x1b:
        D[sp - 1] = ~D[sp - 1];
        break;
      case 0x10:
      case 0x11:
      case 0x12:
      case 0x13:
      case 0x14:
      case 0x15:
      case 0x16:
      case 0x18:
      case 0x19:
      case 0x1a:
      case 0x1c:
      case 0x1d:
      case 0x1e:
      case 0x20:
      case 0x21:
      case 0x22: {
        const b = D[sp - 1];
        const a = D[sp - 2];
        let r = 0;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) {
          if (b === 0) return done(TRAP_DIV_ZERO);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 0x14) {
          if (b === 0) return done(TRAP_DIV_ZERO);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 0x15) {
          if (b === 0) return done(TRAP_DIV_ZERO);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 0x16) {
          if (b === 0) return done(TRAP_DIV_ZERO);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        D[sp++] = r;
        break;
      }
      case 0x30:
      case 0x31:
      case 0x32: {
        const rel = ((program[next - 2] | (program[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) {
          const v = D[--sp];
          take = op === 0x31 ? v === 0 : v !== 0;
        }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === CALLS_MAX) return done(TRAP_CALL_DEPTH);
        C[csp++] = next;
        pc = program[next - 2] | (program[next - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) return done(TRAP_RET_EMPTY);
        pc = C[--csp];
        break;
      case 0x40: {
        const addr = D[sp - 1];
        if (addr < 0 || addr >= MEMORY_WORDS) return done(TRAP_MEMORY);
        D[sp - 1] = M[addr];
        break;
      }
      case 0x41: {
        const addr = D[sp - 1];
        const v = D[sp - 2];
        if (addr < 0 || addr >= MEMORY_WORDS) return done(TRAP_MEMORY);
        sp -= 2;
        M[addr] = v;
        break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (olen + s.length > OUTPUT_MAX) return done(TRAP_OUTPUT);
        sp--;
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (olen + 1 > OUTPUT_MAX) return done(TRAP_OUTPUT);
        out[olen++] = D[--sp] & 255;
        break;
      case 0x52:
        D[sp++] = inPos < input.length ? input[inPos++] : -1;
        break;
      case 0x53:
        return done(D[--sp] & 255);
    }
  }
}

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const id of readdirSync(INPUT_DIR).sort()) {
  const program = new Uint8Array(readFileSync(join(INPUT_DIR, id, 'program.bin')));
  const input = new Uint8Array(readFileSync(join(INPUT_DIR, id, 'input.bin')));
  const res = runVm(program, input);
  const outDir = join(OUTPUT_DIR, id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'stdout.bin'), res.stdout);
  writeFileSync(join(outDir, 'exit.txt'), `${res.exit}\n`);
}

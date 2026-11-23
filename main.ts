import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Machine bounds (ISA.md)
const STACK_MAX = 256;
const CALLS_MAX = 64;
const MEMORY_WORDS = 256;
const STEP_LIMIT = 1_000_000;
const OUTPUT_MAX = 65_536;

// Trap codes (2..11)
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
  void program;
  void input;
  void STACK_MAX;
  void CALLS_MAX;
  void MEMORY_WORDS;
  void STEP_LIMIT;
  void OUTPUT_MAX;
  void TRAP_UNDERFLOW;
  void TRAP_OVERFLOW;
  void TRAP_DIV_ZERO;
  void TRAP_BAD_OPCODE;
  void TRAP_MEMORY;
  void TRAP_CALL_DEPTH;
  void TRAP_RET_EMPTY;
  void TRAP_PC;
  void TRAP_STEPS;
  void TRAP_OUTPUT;
  void OP_INFO;
  return { stdout: new Uint8Array(0), exit: 0 };
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

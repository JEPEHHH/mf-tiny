// The generator's assembler for the tiny stack ISA (ISA.md): a program is a list of items, and it answers the bytes.
//
//   'ADD'                   an opcode with no immediate
//   ['PUSH', v]             PUSH8 when v fits a signed byte, else PUSH32 (v a 32-bit integer)
//   ['PUSH8', v], ['PUSH32', v]
//   ['JMP' | 'JZ' | 'JNZ', label]   a 16-bit offset from the next instruction to the label
//   ['JMP' | 'JZ' | 'JNZ', { rel }] a literal 16-bit offset (an edge program's jump out of the program)
//   ['CALL', label] or ['CALL', { abs }]
//   { label: name }         a label at this address
//   { bytes: [...] }        raw bytes (an edge program's unknown opcode or truncated immediate)

import { OP_BYTE } from './vm.mjs';

const IMM = { PUSH8: 1, PUSH32: 4, JMP: 2, JZ: 2, JNZ: 2, CALL: 2 };

/** The opcode an item assembles to, with PUSH resolved. */
function opOf(item) {
  if (typeof item === 'string') return item;
  if (Array.isArray(item)) {
    if (item[0] !== 'PUSH') return item[0];
    return item[1] >= -128 && item[1] <= 127 ? 'PUSH8' : 'PUSH32';
  }
  return null;
}

/** The size in bytes of one item. */
function sizeOf(item) {
  if (item !== null && typeof item === 'object' && !Array.isArray(item)) return item.bytes === undefined ? 0 : item.bytes.length;
  const op = opOf(item);
  if (OP_BYTE[op] === undefined) throw new Error('no opcode ' + op);
  return 1 + (IMM[op] ?? 0);
}

/** The bytes of `items`. */
export function assemble(items) {
  const labels = new Map();
  let at = 0;
  for (const item of items) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item) && item.label !== undefined) {
      if (labels.has(item.label)) throw new Error('label ' + item.label + ' twice');
      labels.set(item.label, at);
    }
    at += sizeOf(item);
  }
  const out = new Uint8Array(at);
  let pc = 0;
  const put16 = (v) => {
    out[pc++] = v & 255;
    out[pc++] = (v >> 8) & 255;
  };
  const target = (ref) => {
    if (typeof ref === 'string') {
      if (!labels.has(ref)) throw new Error('no label ' + ref);
      return labels.get(ref);
    }
    return null;
  };
  for (const item of items) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      if (item.bytes !== undefined) for (const b of item.bytes) out[pc++] = b & 255;
      continue;
    }
    const op = opOf(item);
    out[pc++] = OP_BYTE[op];
    const arg = Array.isArray(item) ? item[1] : undefined;
    if (op === 'PUSH8') out[pc++] = arg & 255;
    else if (op === 'PUSH32') {
      for (let k = 0; k < 4; k++) out[pc++] = (arg >> (8 * k)) & 255;
    } else if (op === 'JMP' || op === 'JZ' || op === 'JNZ') {
      const abs = target(arg);
      const rel = abs === null ? arg.rel : abs - (pc + 2);
      if (rel < -32768 || rel > 32767) throw new Error('a jump past 16 bits');
      put16(rel);
    } else if (op === 'CALL') {
      const abs = target(arg);
      put16(abs === null ? arg.abs : abs);
    }
  }
  return out;
}

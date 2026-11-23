// The seeded grammar of tiny-stack-vm-01's programs (ISA.md): each kind draws a program (assembler items, asm.mjs) and
// its input bytes from the rng, and says which runs of the reference VM it keeps. A NORMAL kind's program runs to an
// EXIT of a value whose low byte is not 0, with no trap; an EDGE kind's program exercises one of ISA.md's hard rules,
// most of them a trap with output both before it and after it (the output after it is what a VM that misses the trap
// writes). Every kind is a function of its rng alone.

const INT_MIN = -2147483648;

/** A 32-bit draw, as a signed integer. */
const i32 = (rng) => rng.u32() | 0;
/** A small or a full-range 32-bit constant. */
const constant = (rng) => (rng.chance(0.5) ? rng.int(-100, 100) : i32(rng));

/** Items that print the number on top and a separator. */
const printSep = (sep) => ['PRINT', ['PUSH', sep], 'PUTC'];

/** A unique label maker for one program. */
function labels() {
  let n = 0;
  return (name) => `${name}${++n}`;
}

/** Items that print a few drawn constants and a newline (the output of an edge program before and after its rule). */
function chatter(rng) {
  const items = [];
  const k = rng.int(1, 4);
  for (let i = 0; i < k; i++) items.push(['PUSH', constant(rng)], ...printSep(32));
  items.push(['PUSH', 10], 'PUTC');
  return items;
}

/** A random expression tree in postfix: depth levels of ops over constants. */
function expr(rng, depth) {
  if (depth === 0 || rng.chance(0.2)) return [['PUSH', constant(rng)]];
  if (rng.chance(0.12)) return [...expr(rng, depth - 1), rng.pick(['NEG', 'NOT'])];
  const op = rng.pick(['ADD', 'SUB', 'MUL', 'MUL', 'DIV', 'MOD', 'DIVU', 'MODU', 'AND', 'OR', 'XOR', 'SHL', 'SHR', 'SHRU', 'EQ', 'LT', 'LTU', 'ADD', 'SUB']);
  return [...expr(rng, depth - 1), ...expr(rng, depth - 1), op];
}

const exited = (r) => r.trap === null && r.exit !== 0 && r.stdout.length > 0;
const trapped = (code) => (r) => r.trap === code && r.stdout.length > 0;

/** The normal kinds: arithmetic, loops, calls and recursion, memory, input. */
export const NORMAL = Object.freeze([
  {
    name: 'expressions',
    make(rng) {
      const items = [];
      const k = rng.int(3, 7);
      for (let i = 0; i < k; i++) items.push(...expr(rng, rng.int(2, 4)), ...printSep(rng.pick([32, 10])));
      items.push(...expr(rng, 2), 'EXIT');
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'generator-loop',
    make(rng) {
      const L = labels();
      const loop = L('loop');
      const lcg = rng.chance(0.5);
      const step = lcg
        ? [['PUSH', 0], 'LOAD', ['PUSH', i32(rng) | 1], 'MUL', ['PUSH', i32(rng)], 'ADD']
        : [['PUSH', 0], 'LOAD', 'DUP', ['PUSH', 13], 'SHL', 'XOR', 'DUP', ['PUSH', 17], 'SHRU', 'XOR', 'DUP', ['PUSH', 5], 'SHL', 'XOR'];
      const items = [
        ['PUSH', i32(rng) || 1], ['PUSH', 0], 'STORE',
        ['PUSH', rng.int(10, 60)], ['PUSH', 1], 'STORE',
        { label: loop },
        ...step, 'DUP', ['PUSH', 0], 'STORE',
        ...printSep(32),
        ['PUSH', 1], 'LOAD', ['PUSH', 1], 'SUB', 'DUP', ['PUSH', 1], 'STORE',
        ['JNZ', loop],
        ['PUSH', 10], 'PUTC',
        ['PUSH', 0], 'LOAD', 'EXIT',
      ];
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'collatz',
    make(rng) {
      const L = labels();
      const items = [['PUSH', 0], ['PUSH', 2], 'STORE'];
      const k = rng.int(3, 8);
      for (let i = 0; i < k; i++) {
        const s = rng.int(2, 99_999);
        const [top, even, inc, done] = [L('top'), L('even'), L('inc'), L('done')];
        items.push(
          ['PUSH', s], ['PUSH', 0], 'STORE',
          ['PUSH', 0], ['PUSH', 1], 'STORE',
          { label: top },
          ['PUSH', 0], 'LOAD', ['PUSH', 1], 'EQ', ['JNZ', done],
          ['PUSH', 0], 'LOAD', ['PUSH', 2], 'MOD', ['JZ', even],
          ['PUSH', 0], 'LOAD', ['PUSH', 3], 'MUL', ['PUSH', 1], 'ADD', ['PUSH', 0], 'STORE', ['JMP', inc],
          { label: even },
          ['PUSH', 0], 'LOAD', ['PUSH', 2], 'DIV', ['PUSH', 0], 'STORE',
          { label: inc },
          ['PUSH', 1], 'LOAD', ['PUSH', 1], 'ADD', ['PUSH', 1], 'STORE', ['JMP', top],
          { label: done },
          ['PUSH', s], 'PRINT', ['PUSH', 58], 'PUTC', ['PUSH', 1], 'LOAD', ...printSep(10),
          ['PUSH', 2], 'LOAD', ['PUSH', 1], 'LOAD', 'ADD', ['PUSH', 2], 'STORE',
        );
      }
      items.push(['PUSH', 2], 'LOAD', 'EXIT');
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'recursion',
    make(rng) {
      const which = rng.pick(['fact', 'fib', 'gcd']);
      const items = [['PUSH', 0], ['PUSH', 0], 'STORE'];
      const k = rng.int(2, 4);
      for (let i = 0; i < k; i++) {
        if (which === 'gcd') items.push(['PUSH', rng.int(1, 2_000_000_000)], ['PUSH', rng.int(1, 2_000_000)]);
        else items.push(['PUSH', which === 'fact' ? rng.int(3, 20) : rng.int(5, 19)]);
        items.push(['CALL', which], 'DUP', ...printSep(10), ['PUSH', 0], 'LOAD', 'XOR', ['PUSH', 0], 'STORE');
      }
      items.push(['PUSH', 0], 'LOAD', 'EXIT');
      if (which === 'fact') {
        items.push({ label: 'fact' }, 'DUP', ['PUSH', 2], 'LT', ['JNZ', 'factBase'], 'DUP', ['PUSH', 1], 'SUB', ['CALL', 'fact'], 'MUL', 'RET', { label: 'factBase' }, 'POP', ['PUSH', 1], 'RET');
      } else if (which === 'fib') {
        items.push({ label: 'fib' }, 'DUP', ['PUSH', 2], 'LT', ['JNZ', 'fibRet'], 'DUP', ['PUSH', 1], 'SUB', ['CALL', 'fib'], 'SWAP', ['PUSH', 2], 'SUB', ['CALL', 'fib'], 'ADD', { label: 'fibRet' }, 'RET');
      } else {
        // gcd (a b -- g): b == 0 ? a : gcd(b, a mod b)
        items.push({ label: 'gcd' }, 'DUP', ['JZ', 'gcdBase'], 'DUP', 'ROT', 'SWAP', 'MOD', ['CALL', 'gcd'], 'RET', { label: 'gcdBase' }, 'POP', 'RET');
      }
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'sort',
    make(rng) {
      const k = rng.int(8, 40);
      const unsigned = rng.chance(0.5);
      const items = [];
      for (let i = 0; i < k; i++) items.push(['PUSH', rng.chance(0.7) ? rng.int(-1000, 1000) : i32(rng)], ['PUSH', i], 'STORE');
      const lt = unsigned ? 'LTU' : 'LT';
      items.push(
        ['PUSH', 0], ['PUSH', 200], 'STORE',
        { label: 'outer' },
        ['PUSH', 200], 'LOAD', ['PUSH', k - 1], 'LT', ['JZ', 'print'],
        ['PUSH', 0], ['PUSH', 201], 'STORE',
        { label: 'inner' },
        ['PUSH', 201], 'LOAD', ['PUSH', k - 1], ['PUSH', 200], 'LOAD', 'SUB', 'LT', ['JZ', 'nexti'],
        ['PUSH', 201], 'LOAD', ['PUSH', 1], 'ADD', 'LOAD',
        ['PUSH', 201], 'LOAD', 'LOAD',
        lt, ['JZ', 'noswap'],
        ['PUSH', 201], 'LOAD', 'LOAD',
        ['PUSH', 201], 'LOAD', ['PUSH', 1], 'ADD', 'LOAD',
        ['PUSH', 201], 'LOAD', 'STORE',
        ['PUSH', 201], 'LOAD', ['PUSH', 1], 'ADD', 'STORE',
        { label: 'noswap' },
        ['PUSH', 201], 'LOAD', ['PUSH', 1], 'ADD', ['PUSH', 201], 'STORE', ['JMP', 'inner'],
        { label: 'nexti' },
        ['PUSH', 200], 'LOAD', ['PUSH', 1], 'ADD', ['PUSH', 200], 'STORE', ['JMP', 'outer'],
        { label: 'print' },
        ['PUSH', 0], ['PUSH', 200], 'STORE',
        { label: 'ploop' },
        ['PUSH', 200], 'LOAD', 'LOAD', ...printSep(32),
        ['PUSH', 200], 'LOAD', ['PUSH', 1], 'ADD', 'DUP', ['PUSH', 200], 'STORE', ['PUSH', k], 'LT', ['JNZ', 'ploop'],
        ['PUSH', 10], 'PUTC',
        ['PUSH', 0], 'LOAD', ['PUSH', k - 1], 'LOAD', 'SUB', 'EXIT',
      );
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'input',
    make(rng) {
      const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:!?-_()[]{}';
      const input = Array.from({ length: rng.int(20, 200) }, () => alphabet.charCodeAt(rng.int(0, alphabet.length - 1)));
      const count = [['PUSH', 0], 'LOAD', ['PUSH', 1], 'ADD', ['PUSH', 0], 'STORE'];
      const tail = [['PUSH', 10], 'PUTC', ['PUSH', 0], 'LOAD', ...printSep(10), ['PUSH', 0], 'LOAD', 'EXIT'];
      const items = rng.chance(0.5)
        ? [
            { label: 'read' }, 'IN', 'DUP', ['PUSH', -1], 'EQ', ['JNZ', 'end'],
            'DUP', ['PUSH', 97], 'LT', ['JNZ', 'out'], 'DUP', ['PUSH', 123], 'LT', ['JZ', 'out'], ['PUSH', 32], 'SUB',
            { label: 'out' }, 'PUTC', ...count, ['JMP', 'read'],
            { label: 'end' }, 'POP', ...tail,
          ]
        : [
            ['PUSH', -1],
            { label: 'read' }, 'IN', 'DUP', ['PUSH', -1], 'EQ', ['JNZ', 'endread'], ...count, ['JMP', 'read'],
            { label: 'endread' }, 'POP',
            { label: 'put' }, 'DUP', ['PUSH', -1], 'EQ', ['JNZ', 'fin'], 'PUTC', ['JMP', 'put'],
            { label: 'fin' }, 'POP', ...tail,
          ];
      return { items, input };
    },
    accept: exited,
  },
  {
    name: 'primes',
    make(rng) {
      const N = rng.int(50, 400);
      const items = [
        ['PUSH', 2], ['PUSH', 0], 'STORE', ['PUSH', 0], ['PUSH', 2], 'STORE',
        { label: 'outer' }, ['PUSH', 0], 'LOAD', ['PUSH', N + 1], 'LT', ['JZ', 'end'],
        ['PUSH', 2], ['PUSH', 1], 'STORE',
        { label: 'inner' }, ['PUSH', 1], 'LOAD', 'DUP', 'MUL', ['PUSH', 0], 'LOAD', 'SWAP', 'LT', ['JNZ', 'prime'],
        ['PUSH', 0], 'LOAD', ['PUSH', 1], 'LOAD', 'MOD', ['JZ', 'next'],
        ['PUSH', 1], 'LOAD', ['PUSH', 1], 'ADD', ['PUSH', 1], 'STORE', ['JMP', 'inner'],
        { label: 'prime' }, ['PUSH', 0], 'LOAD', ...printSep(32), ['PUSH', 2], 'LOAD', ['PUSH', 1], 'ADD', ['PUSH', 2], 'STORE',
        { label: 'next' }, ['PUSH', 0], 'LOAD', ['PUSH', 1], 'ADD', ['PUSH', 0], 'STORE', ['JMP', 'outer'],
        { label: 'end' }, ['PUSH', 10], 'PUTC', ['PUSH', 2], 'LOAD', ...printSep(10), ['PUSH', 2], 'LOAD', 'EXIT',
      ];
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'bits',
    make(rng) {
      const L = labels();
      const items = [['PUSH', 0], ['PUSH', 2], 'STORE'];
      const k = rng.int(2, 5);
      for (let i = 0; i < k; i++) {
        const v = i32(rng);
        const [top, done] = [L('top'), L('done')];
        items.push(
          ['PUSH', v], ['PUSH', 0], 'STORE', ['PUSH', 0], ['PUSH', 1], 'STORE',
          { label: top }, ['PUSH', 0], 'LOAD', ['JZ', done],
          ['PUSH', 0], 'LOAD', ['PUSH', 1], 'AND', ['PUSH', 1], 'LOAD', 'ADD', ['PUSH', 1], 'STORE',
          ['PUSH', 0], 'LOAD', ['PUSH', 1], 'SHRU', ['PUSH', 0], 'STORE', ['JMP', top],
          { label: done },
          ['PUSH', v], 'PRINT', ['PUSH', 58], 'PUTC', ['PUSH', 1], 'LOAD', ...printSep(32),
          ['PUSH', v], ['PUSH', rng.int(0, 31)], 'SHR', ...printSep(32),
          ['PUSH', v], ['PUSH', rng.int(0, 31)], 'SHRU', ...printSep(10),
          ['PUSH', 2], 'LOAD', ['PUSH', 1], 'LOAD', 'ADD', ['PUSH', 2], 'STORE',
        );
      }
      items.push(['PUSH', 2], 'LOAD', 'EXIT');
      return { items, input: [] };
    },
    accept: exited,
  },
]);

/** The edge kinds: one hard rule of ISA.md each. */
export const EDGE = Object.freeze([
  {
    name: 'mul-wrap',
    make(rng) {
      const items = [];
      for (let i = 0; i < rng.int(3, 6); i++) items.push(['PUSH', i32(rng)], ['PUSH', i32(rng)], 'MUL', ...printSep(32));
      items.push(['PUSH', 65_537 + rng.int(0, 1000)], 'DUP', 'MUL', 'DUP', 'MUL', ...printSep(10), ['PUSH', i32(rng)], ['PUSH', i32(rng)], 'MUL', 'EXIT');
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'signed-division',
    make(rng) {
      const items = [
        ['PUSH', INT_MIN], ['PUSH', -1], 'DIV', ...printSep(32),
        ['PUSH', INT_MIN], ['PUSH', -1], 'MOD', ...printSep(32),
        ['PUSH', INT_MIN], 'NEG', ...printSep(32),
      ];
      for (let i = 0; i < rng.int(3, 6); i++) items.push(['PUSH', -rng.int(1, 100_000)], ['PUSH', rng.pick([1, -1]) * rng.int(2, 97)], rng.pick(['DIV', 'MOD']), ...printSep(32));
      items.push(['PUSH', 10], 'PUTC', ['PUSH', -rng.int(1, 1000)], ['PUSH', rng.int(2, 9)], 'MOD', 'EXIT');
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'divide-by-zero',
    make(rng) {
      const z = rng.int(1, 1000);
      const op = rng.pick(['DIV', 'MOD', 'DIVU', 'MODU']);
      return { items: [...chatter(rng), ['PUSH', rng.int(1, 1000)], ['PUSH', z], ['PUSH', z], 'SUB', op, ...printSep(10), ...chatter(rng), 'HALT'], input: [] };
    },
    accept: trapped(4),
  },
  {
    name: 'stack-underflow',
    make(rng) {
      const tail = rng.pick([['POP'], ['DUP'], [['PUSH', 1], 'ADD'], [['PUSH', 1], 'SWAP'], [['PUSH', 1], ['PUSH', 2], 'ROT']]);
      return { items: [...chatter(rng), ...tail, ...chatter(rng), 'HALT'], input: [] };
    },
    accept: trapped(2),
  },
  {
    name: 'stack-overflow',
    make(rng) {
      const v = rng.int(-50, 50);
      return { items: [...chatter(rng), { label: 'push' }, ['PUSH', v], rng.chance(0.5) ? 'DUP' : ['PUSH', v], ['JMP', 'push']], input: [] };
    },
    accept: trapped(3),
  },
  {
    name: 'bad-opcode',
    make(rng) {
      const unused = [];
      for (let b = 0; b < 256; b++) if (![0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x20, 0x21, 0x22, 0x30, 0x31, 0x32, 0x33, 0x34, 0x40, 0x41, 0x50, 0x51, 0x52, 0x53].includes(b)) unused.push(b);
      return { items: [...chatter(rng), { bytes: [rng.pick(unused)] }, ...chatter(rng), 'HALT'], input: [] };
    },
    accept: trapped(5),
  },
  {
    name: 'memory-load',
    make(rng) {
      const addr = rng.chance(0.5) ? rng.int(256, 100_000) : -rng.int(1, 100_000);
      return { items: [...chatter(rng), ['PUSH', addr], 'LOAD', ...printSep(10), ...chatter(rng), 'HALT'], input: [] };
    },
    accept: trapped(6),
  },
  {
    name: 'memory-store',
    make(rng) {
      const addr = rng.chance(0.5) ? rng.int(256, 100_000) : -rng.int(1, 100_000);
      return { items: [...chatter(rng), ['PUSH', rng.int(1, 9)], ['PUSH', addr], 'STORE', ...chatter(rng), 'HALT'], input: [] };
    },
    accept: trapped(6),
  },
  {
    name: 'call-depth',
    make(rng) {
      const c = rng.int(33, 126);
      return { items: [...chatter(rng), ['CALL', 'f'], ...chatter(rng), 'HALT', { label: 'f' }, ['PUSH', c], 'PUTC', ['CALL', 'f'], 'RET'], input: [] };
    },
    accept: trapped(7),
  },
  {
    name: 'return-empty',
    make(rng) {
      return { items: [...chatter(rng), ['CALL', 'f'], ...chatter(rng), 'RET', ...chatter(rng), 'HALT', { label: 'f' }, ['PUSH', rng.int(33, 126)], 'PUTC', 'RET'], input: [] };
    },
    accept: trapped(8),
  },
  {
    name: 'jump-outside',
    make(rng) {
      const jump = rng.chance(0.5) ? ['JMP', { rel: rng.chance(0.5) ? rng.int(200, 30_000) : -rng.int(200, 30_000) }] : ['CALL', { abs: rng.int(5_000, 65_535) }];
      return { items: [...chatter(rng), jump, ...chatter(rng), 'HALT'], input: [] };
    },
    accept: trapped(9),
  },
  {
    name: 'step-limit',
    make(rng) {
      const c = rng.int(150_000, 400_000);
      return {
        items: [
          ...chatter(rng),
          ['PUSH', c], ['PUSH', 0], 'STORE',
          { label: 'spin' }, ['PUSH', 0], 'LOAD', ['PUSH', 1], 'SUB', 'DUP', ['PUSH', 0], 'STORE', ['JNZ', 'spin'],
          ...chatter(rng), 'HALT',
        ],
        input: [],
      };
    },
    accept: trapped(10),
  },
  {
    name: 'output-limit',
    make(rng) {
      return { items: [...chatter(rng), { label: 'spew' }, ['PUSH', rng.int(-128, 127)], 'PUTC', ['JMP', 'spew']], input: [] };
    },
    accept: trapped(11),
  },
  {
    name: 'shifts',
    make(rng) {
      const items = [];
      for (let i = 0; i < rng.int(4, 8); i++) items.push(['PUSH', i32(rng) | INT_MIN], ['PUSH', rng.chance(0.5) ? rng.int(32, 200) : -rng.int(1, 200)], rng.pick(['SHL', 'SHR', 'SHRU']), ...printSep(32));
      items.push(['PUSH', 10], 'PUTC', ['PUSH', -rng.int(2, 1000)], ['PUSH', rng.int(33, 40)], 'SHRU', 'EXIT');
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'unsigned',
    make(rng) {
      const items = [];
      for (let i = 0; i < rng.int(4, 8); i++) items.push(['PUSH', i32(rng) | INT_MIN], ['PUSH', rng.chance(0.5) ? rng.int(2, 1000) : i32(rng) || 3], rng.pick(['DIVU', 'MODU', 'LTU']), ...printSep(32));
      items.push(['PUSH', 10], 'PUTC', ['PUSH', -rng.int(2, 1000)], ['PUSH', rng.int(2, 30)], 'MODU', 'EXIT');
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'sign-extension',
    make(rng) {
      const items = [['PUSH8', -rng.int(1, 128)], ...printSep(32), ['PUSH8', rng.int(0, 127)], ...printSep(32), ['PUSH32', INT_MIN], ...printSep(32), ['PUSH32', -rng.int(1, 127)], ...printSep(32)];
      items.push(['PUSH', i32(rng)], 'NOT', ...printSep(32), ['PUSH', 1], ['PUSH', 31], 'SHL', ['PUSH', 1], 'SUB', ...printSep(10), ['PUSH8', -rng.int(1, 127)], 'EXIT');
      return { items, input: [] };
    },
    accept: exited,
  },
  {
    name: 'truncated-immediate',
    make(rng) {
      const n = rng.int(0, 3);
      return { items: [...chatter(rng), { bytes: [0x02, ...Array.from({ length: n }, () => rng.int(0, 255))] }], input: [] };
    },
    accept: trapped(9),
  },
  {
    name: 'fall-off-end',
    make(rng) {
      return { items: [...chatter(rng), ['PUSH', rng.int(1, 9)], 'POP'], input: [] };
    },
    accept: trapped(9),
  },
  {
    name: 'input-end',
    make(rng) {
      const input = Array.from({ length: rng.int(0, 4) }, () => rng.int(0, 255));
      const items = [];
      for (let i = 0; i < rng.int(6, 10); i++) items.push('IN', ...printSep(32));
      items.push(['PUSH', 10], 'PUTC', 'IN', 'IN', 'ADD', 'EXIT');
      return { items, input };
    },
    accept: exited,
  },
]);

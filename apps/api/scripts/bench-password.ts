// pnpm bench:password
//
// Measures Argon2id with the API's real parameters (src/modules/auth/password.ts) on this machine:
//   1. latency: how long one hash and one verify take, one at a time (median of 20 runs);
//   2. throughput: how many verifications per second the process manages when 32 arrive at once.
//
// Why both: latency is what one user feels at login; throughput is the ceiling on logins per second
// for one API instance. Argon2 runs on libuv's thread pool (4 threads unless UV_THREADPOOL_SIZE says
// otherwise), so at most 4 hashes run in parallel, each holding 19 MiB of memory.
import { availableParallelism } from 'node:os';
import { hashPassword, PASSWORD_HASH_OPTIONS, verifyPassword } from '../src/modules/auth/password';

const RUNS = 20;
const CONCURRENT = 32;
const password = 'correct horse battery staple';

async function time(task: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await task();
  return performance.now() - started;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

const stored = await hashPassword(password); // warm-up (loads the native module), not measured

const hashTimes: number[] = [];
const verifyTimes: number[] = [];
for (let run = 0; run < RUNS; run += 1) {
  hashTimes.push(await time(() => hashPassword(password)));
  verifyTimes.push(await time(() => verifyPassword(stored, password)));
}

const burst = await time(() =>
  Promise.all(Array.from({ length: CONCURRENT }, () => verifyPassword(stored, password))),
);

const ms = (value: number) => `${value.toFixed(1)} ms`;
console.log(`Argon2id ${JSON.stringify(PASSWORD_HASH_OPTIONS)}`);
console.log(
  `CPU threads: ${availableParallelism()}, libuv thread pool: ${process.env.UV_THREADPOOL_SIZE ?? '4 (default)'}`,
);
console.table({
  hash: {
    median: ms(median(hashTimes)),
    min: ms(Math.min(...hashTimes)),
    max: ms(Math.max(...hashTimes)),
  },
  verify: {
    median: ms(median(verifyTimes)),
    min: ms(Math.min(...verifyTimes)),
    max: ms(Math.max(...verifyTimes)),
  },
});
console.log(
  `${CONCURRENT} verifications at once: ${ms(burst)} in total = ` +
    `${Math.round((CONCURRENT / burst) * 1000)} verifications per second`,
);

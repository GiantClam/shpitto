type Loop = Readonly<{name: 'dispatch' | 'sweep' | 'inbox' | 'cleanup'; intervalMs: number; staleMs: number; run: () => Promise<unknown>}>;
type LoopState = Readonly<{lastSuccessAt: string | null; busy: boolean}>;

/** Each maintenance loop owns its freshness; dispatch cannot mask recovery failure. */
export function startWorkerLoops(input: Readonly<{
  loops: readonly Loop[];
  now?: () => Date;
  onError?: (name: Loop['name'], error: unknown) => void;
  schedule?: (tick: () => void, intervalMs: number) => () => void;
}>) {
  for (const loop of input.loops) {
    if (!Number.isInteger(loop.intervalMs) || loop.intervalMs < 1 || loop.intervalMs > 60_000 || loop.staleMs < loop.intervalMs) throw new Error('Worker loop interval must be at most 60000 ms and below its freshness threshold.');
  }
  const now = input.now ?? (() => new Date());
  const onError = input.onError ?? (() => undefined);
  const schedule = input.schedule ?? ((tick, intervalMs) => { const timer = setInterval(tick, intervalMs); return () => clearInterval(timer); });
  const states = new Map<string, LoopState>();
  const pending = new Set<Promise<void>>();
  const cancels: Array<() => void> = [];
  let stopping = false;
  let errors = 0;
  for (const loop of input.loops) {
    states.set(loop.name, {lastSuccessAt: null, busy: false});
    const tick = () => {
      const state = states.get(loop.name)!;
      if (stopping || state.busy) return;
      states.set(loop.name, {...state, busy: true});
      const operation = Promise.resolve().then(loop.run).then(() => {
        states.set(loop.name, {lastSuccessAt: now().toISOString(), busy: true});
      }, (error: unknown) => { errors++; onError(loop.name, error); }).finally(() => {
        states.set(loop.name, {...states.get(loop.name)!, busy: false});
        pending.delete(operation);
      });
      pending.add(operation);
    };
    cancels.push(schedule(tick, loop.intervalMs));
    tick();
  }
  return Object.freeze({
    snapshot: () => {
      const at = now().getTime();
      const ready = input.loops.every((loop) => { const last = states.get(loop.name)!.lastSuccessAt; return last !== null && at - new Date(last).getTime() < loop.staleMs; });
      return {ready, errors, loops: Object.fromEntries(states),
        lastDispatchAt: states.get('dispatch')?.lastSuccessAt ?? null,
        lastSweepAt: states.get('sweep')?.lastSuccessAt ?? null,
        lastInboxAt: states.get('inbox')?.lastSuccessAt ?? null,
        lastCleanupAt: states.get('cleanup')?.lastSuccessAt ?? undefined};
    },
    stop: async () => {
      if (!stopping) { stopping = true; for (const cancel of cancels) cancel(); }
      await Promise.all([...pending]);
    },
  });
}

/** Binding failure must not start any provider or maintenance side effect. */
export async function startWorkerLoopsAfterBind(listen: () => Promise<void>, input: Parameters<typeof startWorkerLoops>[0]): Promise<ReturnType<typeof startWorkerLoops>> {
  await listen();
  return startWorkerLoops(input);
}

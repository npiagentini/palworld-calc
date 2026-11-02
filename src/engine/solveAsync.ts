import type { SolveRequest, SolveResult } from './solver'

export interface SolveJob {
  promise: Promise<SolveResult>
  cancel: () => void
}

/** Runs one solve in a fresh worker; cancel() terminates it. */
export function solveInWorker(req: SolveRequest): SolveJob {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
  let cancel = () => {}
  const promise = new Promise<SolveResult>((resolve, reject) => {
    cancel = () => {
      worker.terminate()
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    worker.onmessage = (e: MessageEvent<{ ok: true; result: SolveResult } | { ok: false; error: string }>) => {
      worker.terminate()
      if (e.data.ok) resolve(e.data.result)
      else reject(new Error(e.data.error))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'Solver crashed'))
    }
    worker.postMessage(req)
  })
  return { promise, cancel }
}

import { solve, type SolveRequest } from './solver'

// Runs the solver off the main thread so the UI stays responsive.
const scope = self as unknown as { postMessage(message: unknown): void }

self.onmessage = (event: MessageEvent<SolveRequest>) => {
  try {
    scope.postMessage({ ok: true, result: solve(event.data) })
  } catch (e) {
    scope.postMessage({ ok: false, error: (e as Error).message })
  }
}

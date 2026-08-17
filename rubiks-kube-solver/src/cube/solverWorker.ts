import Cube from 'cubejs';
import 'cubejs/lib/solve';

export type SolverRequest = { type: 'init' } | { type: 'solve'; facelets: string; id: number };

export type SolverResponse =
  | { type: 'ready' }
  | { type: 'solved'; id: number; solution: string }
  | { type: 'error'; id?: number; message: string };

let ready = false;

self.onmessage = (event: MessageEvent<SolverRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      if (!ready) {
        Cube.initSolver();
        ready = true;
      }
      const response: SolverResponse = { type: 'ready' };
      self.postMessage(response);
      return;
    }

    if (message.type === 'solve') {
      if (!ready) {
        Cube.initSolver();
        ready = true;
      }
      const cube = Cube.fromString(message.facelets);
      const solution = cube.solve();
      const response: SolverResponse = { type: 'solved', id: message.id, solution };
      self.postMessage(response);
    }
  } catch (error) {
    const response: SolverResponse = {
      type: 'error',
      id: 'id' in message ? message.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

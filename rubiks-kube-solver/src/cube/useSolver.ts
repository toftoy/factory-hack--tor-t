import { useCallback, useEffect, useState } from 'react';
import type { SolverRequest, SolverResponse } from './solverWorker';

export type SolverStatus = 'initializing' | 'ready' | 'solving';

type Listener = (message: SolverResponse) => void;

// A single worker instance is shared for the lifetime of the page: the solver's lookup
// tables are expensive to precompute, so this must survive component remounts
// (e.g. React StrictMode's mount/unmount/mount cycle in development).
let worker: Worker | null = null;
let nextId = 0;
const listeners = new Set<Listener>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./solverWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<SolverResponse>) => {
      for (const listener of listeners) listener(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      console.error('Solver worker failed to load:', event.message, event.filename, event.lineno);
    };
    const initRequest: SolverRequest = { type: 'init' };
    worker.postMessage(initRequest);
  }
  return worker;
}

export function useSolver() {
  const [status, setStatus] = useState<SolverStatus>('initializing');

  useEffect(() => {
    const listener: Listener = (message) => {
      if (message.type === 'ready') {
        setStatus('ready');
      } else if (message.type === 'solved') {
        setStatus('ready');
      } else if (message.type === 'error') {
        console.error('Solver error:', message.message);
        setStatus('ready');
      }
    };
    listeners.add(listener);
    getWorker();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const solve = useCallback((facelets: string): Promise<string> => {
    return new Promise((resolve) => {
      const activeWorker = getWorker();
      const id = nextId++;
      const listener: Listener = (message) => {
        if (message.type === 'solved' && message.id === id) {
          listeners.delete(listener);
          resolve(message.solution);
        }
      };
      listeners.add(listener);
      setStatus('solving');
      const request: SolverRequest = { type: 'solve', facelets, id };
      activeWorker.postMessage(request);
    });
  }, []);

  return { status, solve };
}

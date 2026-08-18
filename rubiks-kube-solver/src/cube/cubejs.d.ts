declare module 'cubejs' {
  export default class Cube {
    constructor(state?: Cube);
    static random(): Cube;
    static fromString(facelets: string): Cube;
    static inverse(algorithm: string): string;
    static initSolver(): void;

    asString(): string;
    clone(): Cube;
    identity(): void;
    isSolved(): boolean;
    move(algorithm: string): Cube;
    randomize(): void;
    solve(maxDepth?: number): string;
  }
}

declare module 'cubejs/lib/solve' {
  const solve: unknown;
  export default solve;
}

export type TrainingTrack = 'beginner' | 'oll-pll-2look';

export interface AlgorithmCase {
  id: string;
  track: TrainingTrack;
  name: string;
  setupMoves: string;
  solutionMoves: string;
  description: string;
}

export const BEGINNER_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'beginner-f2l-left',
    track: 'beginner',
    name: 'F2L-kant venstre',
    setupMoves: "F U F' U' L' U' L U",
    solutionMoves: "U' L' U L U F U' F'",
    description: 'Sett inn en kant-brikke fra toppen ned i mellomlaget, til venstre.',
  },
  {
    id: 'beginner-f2l-right',
    track: 'beginner',
    name: 'F2L-kant høyre',
    setupMoves: "F' U' F U R U R' U'",
    solutionMoves: "U R U' R' U' F' U F",
    description: 'Sett inn en kant-brikke fra toppen ned i mellomlaget, til høyre.',
  },
  {
    id: 'beginner-yellow-cross',
    track: 'beginner',
    name: 'Gult kors',
    setupMoves: "F U R U' R' F'",
    solutionMoves: "F R U R' U' F'",
    description: 'Orienter kantene i toppsjiktet slik at gult kors dannes.',
  },
  {
    id: 'beginner-sune',
    track: 'beginner',
    name: 'Sune',
    setupMoves: "R U2 R' U' R U' R'",
    solutionMoves: "R U R' U R U2 R'",
    description: 'Orienter de tre siste hjørnene i toppsjiktet (ett er allerede riktig).',
  },
];

export const OLL_PLL_2LOOK_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'oll-sune',
    track: 'oll-pll-2look',
    name: 'Sune (OLL)',
    setupMoves: "R U2 R' U' R U' R'",
    solutionMoves: "R U R' U R U2 R'",
    description: 'Orienter de tre siste hjørnene i toppsjiktet.',
  },
  {
    id: 'oll-antisune',
    track: 'oll-pll-2look',
    name: 'Anti-Sune (OLL)',
    setupMoves: "R U R' U R U2 R'",
    solutionMoves: "R U2 R' U' R U' R'",
    description: 'Speilvendt Sune - orienter de tre siste hjørnene motsatt vei.',
  },
  {
    id: 'pll-t-perm',
    track: 'oll-pll-2look',
    name: 'T-perm (PLL)',
    setupMoves: "F R U' R' U R U R2 F' R U R U' R'",
    solutionMoves: "R U R' U' R' F R2 U' R' U' R U R' F'",
    description: 'Bytt om to hjørner og to kanter i toppsjiktet.',
  },
  {
    id: 'pll-ua-perm',
    track: 'oll-pll-2look',
    name: 'Ua-perm (PLL)',
    setupMoves: "R2 U R U R' U' R' U' R' U R'",
    solutionMoves: "R U' R U R U R U' R' U' R2",
    description: 'Sykle tre kanter i toppsjiktet mot klokken.',
  },
  {
    id: 'pll-ub-perm',
    track: 'oll-pll-2look',
    name: 'Ub-perm (PLL)',
    setupMoves: "R U' R U R U R U' R' U' R2",
    solutionMoves: "R2 U R U R' U' R' U' R' U R'",
    description: 'Sykle tre kanter i toppsjiktet med klokken.',
  },
];

export const TRACKS: Record<TrainingTrack, AlgorithmCase[]> = {
  beginner: BEGINNER_ALGORITHMS,
  'oll-pll-2look': OLL_PLL_2LOOK_ALGORITHMS,
};

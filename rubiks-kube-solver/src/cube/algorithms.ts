export type TrainingTrack = 'notation' | 'beginner' | 'oll-pll-2look' | 'guided-basics';

export interface AlgorithmCase {
  id: string;
  track: TrainingTrack;
  name: string;
  setupMoves: string;
  solutionMoves: string;
  description: string;
}

export const NOTATION_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'notation-u',
    track: 'notation',
    name: 'U',
    setupMoves: "U'",
    solutionMoves: 'U',
    description: 'U snur toppen ett hakk med klokken.',
  },
  {
    id: 'notation-u-prime',
    track: 'notation',
    name: "U'",
    setupMoves: 'U',
    solutionMoves: "U'",
    description: "Apostrofen (') betyr mot klokken - U' snur toppen ett hakk mot klokken.",
  },
  {
    id: 'notation-u2',
    track: 'notation',
    name: 'U2',
    setupMoves: 'U2',
    solutionMoves: 'U2',
    description: '2-tallet betyr dobbelt så mye - U2 snur toppen et helt halvt hakk.',
  },
  {
    id: 'notation-r',
    track: 'notation',
    name: 'R',
    setupMoves: "R'",
    solutionMoves: 'R',
    description: 'Hver bokstav er en side av kuben - R snur høyre side med klokken.',
  },
  {
    id: 'notation-r-prime',
    track: 'notation',
    name: "R'",
    setupMoves: 'R',
    solutionMoves: "R'",
    description: "R' snur høyre side mot klokken - samme regel som for U.",
  },
  {
    id: 'notation-l',
    track: 'notation',
    name: 'L',
    setupMoves: "L'",
    solutionMoves: 'L',
    description:
      'L snur venstre side med klokken. Drei kameraet litt (dra utenfor kuben) så du ser den godt - trykk 🧭 for å komme tilbake.',
  },
  {
    id: 'notation-f',
    track: 'notation',
    name: 'F',
    setupMoves: "F'",
    solutionMoves: 'F',
    description: 'F snur forsiden (den som er mot deg) med klokken.',
  },
  {
    id: 'notation-f-prime',
    track: 'notation',
    name: "F'",
    setupMoves: 'F',
    solutionMoves: "F'",
    description: "F' snur forsiden mot klokken - samme regel som for U og R.",
  },
  {
    id: 'notation-d',
    track: 'notation',
    name: 'D',
    setupMoves: "D'",
    solutionMoves: 'D',
    description:
      'D snur bunnen med klokken (sett nedenfra). Drei kameraet (dra utenfor kuben) til du ser bunnen godt - trykk 🧭 for å komme tilbake til vanlig visning.',
  },
  {
    id: 'notation-b',
    track: 'notation',
    name: 'B',
    setupMoves: "B'",
    solutionMoves: 'B',
    description:
      '🔄 Baksiden er gjemt! Dra utenfor kuben for å dreie kameraet helt rundt til du ser den, snu den så B med klokken. Sitter du fast, trykk 🧭 for å komme tilbake. Nå har du lært alle seks sidene!',
  },
];

export const CROSS_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'cross-flip-in-place',
    track: 'guided-basics',
    name: 'Kors: vend kanten',
    setupMoves: 'F2',
    solutionMoves: 'F2',
    description:
      'Kuben ser blandet ut - finn kant-brikken med korsets to farger. Den står rett over plassen, snudd feil vei. Ett trekk retter den opp.',
  },
  {
    id: 'cross-free-then-place',
    track: 'guided-basics',
    name: 'Kors: løsne og sett på plass',
    setupMoves: "R F'",
    solutionMoves: "F R'",
    description:
      'Kuben ser blandet ut - finn kant-brikken med korsets to farger et sted på kuben. Løsne den, så setter den seg selv på plass.',
  },
];

export const CORNER_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'corner-pocket',
    track: 'guided-basics',
    name: 'Hjørne: lomme-trikset',
    setupMoves: "R U R'",
    solutionMoves: "R U' R'",
    description:
      'Kuben ser blandet ut - finn hjørnet med korsets farge. Løft det ut av lomma, vend det riktig, og sett laget tilbake.',
  },
  {
    id: 'corner-from-the-side',
    track: 'guided-basics',
    name: 'Hjørne: fra siden',
    setupMoves: "F' D F",
    solutionMoves: "F' D' F",
    description:
      'Kuben ser blandet ut - finn hjørnet med korsets farge på siden. Dette trikset drar det ut og setter det ned riktig vei.',
  },
];

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
  {
    id: 'beginner-corner-perm',
    track: 'beginner',
    name: 'Hjørne-permutasjon',
    setupMoves: "R2 F2 R' B' R F2 R' B R'",
    solutionMoves: "R B' R F2 R' B R F2 R2",
    description: 'Bytt om tre hjørner i toppsjiktet slik at alle havner på riktig plass.',
  },
  {
    id: 'beginner-edge-perm',
    track: 'beginner',
    name: 'Kant-permutasjon',
    setupMoves: "R U' R U R U R U' R' U' R2",
    solutionMoves: "R2 U R U R' U' R' U' R' U R'",
    description: 'Bytt om tre kanter i toppsjiktet slik at alle havner på riktig plass.',
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
    id: 'oll-sune-mirror',
    track: 'oll-pll-2look',
    name: 'Sune speilvendt (OLL)',
    setupMoves: "L' U2 L U L' U L",
    solutionMoves: "L' U' L U' L' U2 L",
    description: 'Sune utført på venstre side - orienter de tre siste hjørnene.',
  },
  {
    id: 'oll-antisune-mirror',
    track: 'oll-pll-2look',
    name: 'Anti-Sune speilvendt (OLL)',
    setupMoves: "L' U' L U' L' U2 L",
    solutionMoves: "L' U2 L U L' U L",
    description: 'Anti-Sune utført på venstre side - orienter de tre siste hjørnene motsatt vei.',
  },
  {
    id: 'oll-pi',
    track: 'oll-pll-2look',
    name: 'Pi (OLL)',
    setupMoves: "R' U2 R2 U R2 U R2 U2 R'",
    solutionMoves: "R U2 R2 U' R2 U' R2 U2 R",
    description: 'Orienter alle fire hjørnene i toppsjiktet - ingen er riktig fra start.',
  },
  {
    id: 'oll-h',
    track: 'oll-pll-2look',
    name: 'H (OLL)',
    setupMoves: "R U2 R' U' R U R' U' R U' R'",
    solutionMoves: "R U R' U R U' R' U R U2 R'",
    description: 'Orienter fire hjørner i toppsjiktet i et H-mønster.',
  },
  {
    id: 'oll-u',
    track: 'oll-pll-2look',
    name: 'U (OLL)',
    setupMoves: "R U2 R D R' U2 R D' R2",
    solutionMoves: "R2 D R' U2 R D' R' U2 R'",
    description: 'Orienter fire hjørner i toppsjiktet i et U-mønster.',
  },
  {
    id: 'oll-edge-line',
    track: 'oll-pll-2look',
    name: 'Linje (OLL kant)',
    setupMoves: "F U R U' R' F'",
    solutionMoves: "F R U R' U' F'",
    description: 'Orienter kantene i toppsjiktet - to motstående kanter mangler.',
  },
  {
    id: 'oll-edge-l-shape',
    track: 'oll-pll-2look',
    name: 'L-form (OLL kant)',
    setupMoves: "F R U R' U' F'",
    solutionMoves: "F U R U' R' F'",
    description: 'Orienter kantene i toppsjiktet - to nabokanter mangler.',
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
  {
    id: 'pll-h-perm',
    track: 'oll-pll-2look',
    name: 'H-perm (PLL)',
    setupMoves: "R2 U2 R' U2 R2 U2 R2 U2 R' U2 R2",
    solutionMoves: "R2 U2 R U2 R2 U2 R2 U2 R U2 R2",
    description: 'Bytt om to par motstående kanter i toppsjiktet.',
  },
  {
    id: 'pll-aa-perm',
    track: 'oll-pll-2look',
    name: 'Aa-perm (PLL)',
    setupMoves: "R2 B2 R F R' B2 R F' R",
    solutionMoves: "R' F R' B2 R F' R' B2 R2",
    description: 'Sykle tre hjørner i toppsjiktet mot klokken.',
  },
  {
    id: 'pll-ab-perm',
    track: 'oll-pll-2look',
    name: 'Ab-perm (PLL)',
    setupMoves: "R2 F2 R' B' R F2 R' B R'",
    solutionMoves: "R B' R F2 R' B R F2 R2",
    description: 'Sykle tre hjørner i toppsjiktet med klokken.',
  },
];

export const TRACKS: Record<TrainingTrack, AlgorithmCase[]> = {
  notation: NOTATION_ALGORITHMS,
  beginner: BEGINNER_ALGORITHMS,
  'oll-pll-2look': OLL_PLL_2LOOK_ALGORITHMS,
  'guided-basics': [...CROSS_ALGORITHMS, ...CORNER_ALGORITHMS],
};

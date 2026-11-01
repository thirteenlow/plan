import React, { useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';
import type { Mood } from '@/engine/pet';
import type { PetKind } from '@/store/types';

/*
 * Pixel-art companions: a hand-drawn 16×16 sprite per animal and a face that changes with mood. Legs have two frames for walking. Drawn as merged SVG rects; use sizes that are
 * multiples of 16 so every pixel lands on whole screen pixels.
 */

type Grid = string[];
type Palette = Record<string, string>;

// Each animal is drawn whole (16×16) so its silhouette reads as that animal: the frog's eyes bulge on top of a
// wide head, the penguin has a white face, beak and flippers, the fox a pointed muzzle and tail, and so on.
// Letters are palette keys; '.' is empty. o = outline (a darker shade of the fur), b = fur, l = light fur/belly,
// d = dark markings, s = patch, k = whiskers, p = pink, n = nose, y = beak/feet orange, f = feet.
// The face (eyes, mouth, blush) is drawn on top at each animal's anchors and changes with mood.

type Px = [number, number, string];
const px = (cells: [number, number][], c: string): Px[] => cells.map(([x, y]) => [x, y, c]);
const rect = (x0: number, y0: number, x1: number, y1: number, c: string): Px[] => {
  const out: Px[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y, c]);
  return out;
};

const FEET: Grid = ['....ofo..ofo....', '....ooo..ooo....'];
const FEET_STEP: Grid = ['....ofo..ofo....', '.........ooo....'];

interface Animal {
  /** Rows 0–13; feet (rows 14–15) are added, or the animal supplies all 16 rows with its own two step frames */
  body: Grid;
  feet?: [Grid, Grid];
  palette: Palette;
  marks?: Px[];
  /** Top-left of each 2×2 eye, the mouth's left-centre pixel, and where the blush goes */
  eyes: [number, number, number];
  mouth?: [number, number];
  blush: [number, number, number];
}

const ANIMALS: Record<PetKind, Animal> = {
  cat: {
    body: [
      '................',
      '.o............o.',
      '.oo..........oo.',
      '.opo........opo.',
      '.oppboooooobppo.',
      '.obbbbbddbbbbbo.',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      '.obbbbbbbbbbbbo.',
      '..oobbbbbbbboo..',
      '....obllllbo....',
      '....obllllbo....',
    ],
    palette: { o: '#B5652A', b: '#F7B267', l: '#FFE6C7', p: '#FF9FB0', d: '#E58B42', n: '#FF7A93', k: '#B5652A', e: '#3B2314' },
    // Pink nose, whiskers, and a tail curling up behind.
    marks: [...px([[7, 9], [8, 9]], 'n'), ...px([[1, 9], [2, 9], [13, 9], [14, 9]], 'k'), ...px([[12, 13], [13, 12], [14, 11], [14, 10]], 'd')],
    eyes: [4, 10, 7],
    mouth: [7, 10],
    blush: [2, 12, 10],
  },
  dog: {
    body: [
      '................',
      '................',
      '................',
      '...oooooooooo...',
      '.ddobbbbbbbbodd.',
      'dddobbbbbbbboddd',
      'dddobbbbbbbboddd',
      'dddobbbbbbbboddd',
      'dddobbbbbbbboddd',
      '.ddobbbbbbbbodd.',
      '..dobllllllbod..',
      '...obllllllbo...',
      '....oobbbboo....',
      '....obllllbo....',
    ],
    palette: { o: '#8A5A3B', b: '#F2D2A9', l: '#FFF4E3', p: '#FF9AA2', d: '#9C6440', s: '#E2B482', n: '#2B1A10', e: '#2B1A10' },
    // Floppy ears are in the drawing; add an eye patch, a black nose and a wagging tail.
    marks: [...rect(9, 5, 11, 8, 's'), ...px([[7, 9], [8, 9]], 'n'), ...px([[13, 12], [14, 11]], 'd')],
    eyes: [5, 9, 6],
    mouth: [7, 10],
    blush: [4, 10, 9],
  },
  bunny: {
    body: [
      '....oo....oo....',
      '...opo....opo...',
      '...opo....opo...',
      '...opo....opo...',
      '...opoooooopo...',
      '..obbbbbbbbbbo..',
      '.obbbbbbbbbbbbo.',
      '.obbbbbbbbbbbbo.',
      '.obbbbbbbbbbbbo.',
      '.obbbbbbbbbbbbo.',
      '..obbbbbbbbbbo..',
      '...obbbbbbbbo...',
      '...obllllllbo...',
      '....obllllbo....',
    ],
    palette: { o: '#B9A7A7', b: '#FBF7F4', l: '#FFFFFF', p: '#FFB3C6', n: '#FF8FAB', e: '#3A2C2C' },
    marks: px([[7, 9], [8, 9]], 'n'),
    eyes: [4, 10, 7],
    mouth: [7, 10],
    blush: [2, 12, 9],
  },
  fox: {
    body: [
      '.o............o.',
      '.oo..........oo.',
      '.odo........odo.',
      '.oddo......oddo.',
      '.obbboooooobbbo.',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      'ollbbbbbbbbbbllo',
      '.olllbbbbbblllo.',
      '..ollllllllllo..',
      '....ollllllo.oo.',
      '....obbbbbbobbbo',
      '....obllllbobllo',
    ],
    feet: [
      ['....ofo..ofooo..', '....ooo..ooo....'],
      ['....ofo..ofooo..', '.........ooo....'],
    ],
    palette: { o: '#A8481E', b: '#F08A4B', l: '#FFF3E6', p: '#FFB0A0', d: '#4A2E22', n: '#2A160C', e: '#2A160C' },
    marks: px([[7, 10], [8, 10]], 'n'),
    eyes: [4, 10, 6],
    mouth: [7, 11],
    blush: [2, 12, 8],
  },
  panda: {
    body: [
      '................',
      '.dd..........dd.',
      'dddd.oooooo.dddd',
      'ddddobbbbbbodddd',
      '.ddobbbbbbbbodd.',
      '..obbbbbbbbbbo..',
      '.obbddbbbbddbbo.',
      '.obddddbbddddbo.',
      '.obddddbbddddbo.',
      '.obbddbbbbddbbo.',
      '.obbbbbddbbbbbo.',
      '..obbbbbbbbbbo..',
      '...oobbbbbboo...',
      '..dddbbbbbbddd..',
    ],
    feet: [
      ['...ddd....ddd...', '...ddd....ddd...'],
      ['...ddd....ddd...', '..........ddd...'],
    ],
    // Eyes sit on the black patches, so they're drawn light with a dark shine.
    palette: { o: '#3A3A3A', b: '#FFFFFF', l: '#F0F0F0', p: '#FFB3C6', d: '#262626', e: '#FFFFFF', h: '#262626', m: '#262626' },
    eyes: [4, 10, 7],
    mouth: [7, 11],
    blush: [2, 12, 10],
  },
  frog: {
    body: [
      '................',
      '..oooo....oooo..',
      '.ollllo..ollllo.',
      '.ollllo..ollllo.',
      '.obbbboooobbbbo.',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      '.obbbbbbbbbbbbo.',
      '.obbllllllllbbo.',
      '..obllllllllbo..',
      '..obllllllllbo..',
      '...obbbbbbbbo...',
      '..obbo....obbo..',
    ],
    feet: [
      ['.obbbo....obbbo.', '.ooooo....ooooo.'],
      ['.obbbo....obbbo.', '..........ooooo.'],
    ],
    palette: { o: '#3E7A34', b: '#7ED66B', l: '#E3F8C9', p: '#FF9AA2', e: '#1E3A17' },
    // Eyes sit in the bulges on top of the head.
    eyes: [3, 11, 2],
    mouth: [7, 6],
    blush: [3, 11, 6],
  },
  penguin: {
    body: [
      '................',
      '.....oooooo.....',
      '....obbbbbbo....',
      '...obbbbbbbbo...',
      '...obllbbllbo...',
      '..obllllllllbo..',
      '..obllllllllbo..',
      '..obllllllllbo..',
      '.obbllllllllbbo.',
      'obbbllllllllbbbo',
      'obbollllllllobbo',
      '.oobllllllllboo.',
      '...obllllllbo...',
      '....obbbbbbo....',
    ],
    feet: [
      ['....yyy..yyy....', '...yyyy..yyyy...'],
      ['....yyy..yyy....', '.........yyyy...'],
    ],
    palette: { o: '#1E2638', b: '#33415E', l: '#FFFFFF', p: '#FFB3C6', y: '#FFA62B', e: '#1E2638' },
    // The beak is its mouth.
    marks: px([[6, 7], [7, 7], [8, 7], [9, 7], [7, 8], [8, 8]], 'y'),
    eyes: [5, 9, 5],
    blush: [4, 10, 7],
  },
  hamster: {
    body: [
      '................',
      '................',
      '..ooo......ooo..',
      '.oppo......oppo.',
      '..oooooooooooo..',
      '.obbbbbbbbbbbbo.',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbo',
      'obbbbllllllbbbbo',
      'obbbllllllllbbbo',
      '.obllllllllllbo.',
      '..oolllllllloo..',
    ],
    palette: { o: '#B07A45', b: '#F3C88B', l: '#FFF3DE', p: '#FF9FB0', d: '#E0A55F', n: '#FF7A93', e: '#3A2410' },
    marks: [...rect(7, 5, 8, 6, 'd'), ...px([[7, 9], [8, 9]], 'n')],
    eyes: [4, 10, 7],
    mouth: [7, 10],
    blush: [1, 13, 10],
  },
};

/** Mood faces placed at the animal's anchors. */
function face(a: Animal, mood: Mood): Px[] {
  const [lx, rx, y] = a.eyes;
  const eyes = [...px([[lx + 1, y], [lx, y + 1], [lx + 1, y + 1], [rx + 1, y], [rx, y + 1], [rx + 1, y + 1]], 'e'), ...px([[lx, y], [rx, y]], 'h')];
  const [bl, br, by] = a.blush;
  const blush = px([[bl, by], [bl + 1, by], [br, by], [br + 1, by]], 'p');
  const mouth = (cells: [number, number][], c = 'm'): Px[] => (a.mouth ? px(cells.map(([dx, dy]) => [a.mouth![0] + dx, a.mouth![1] + dy]), c) : []);
  const smile = mouth([[-1, 0], [0, 1], [1, 1], [2, 0]]);
  const frown = mouth([[-1, 1], [0, 0], [1, 0], [2, 1]]);
  switch (mood) {
    case 'thriving':
      return [
        ...blush,
        ...px([[lx - 1, y + 1], [lx, y], [lx + 1, y], [lx + 2, y + 1], [rx - 1, y + 1], [rx, y], [rx + 1, y], [rx + 2, y + 1]], 'e'),
        ...mouth([[-1, 0], [0, 0], [1, 0], [2, 0]]),
        ...mouth([[0, 1], [1, 1]], 'r'),
      ];
    case 'happy':
      return [...blush, ...eyes, ...smile];
    case 'okay':
      return [...eyes, ...mouth([[0, 1], [1, 1]])];
    case 'worried':
      return [...eyes, ...px([[lx, y - 1], [lx + 1, y - 2], [rx, y - 2], [rx + 1, y - 1]], 'e'), ...frown];
    case 'stressed':
      return [...px([[lx, y], [lx + 1, y + 1], [lx, y + 2], [rx + 1, y], [rx, y + 1], [rx + 1, y + 2]], 'e'), ...frown, ...px([[lx - 1, y + 2], [lx - 1, y + 3]], 'w')];
  }
}

function build(kind: PetKind, mood: Mood, frame: 0 | 1): { grid: string[][]; palette: Palette } {
  const a = ANIMALS[kind];
  const feet = (a.feet ?? [FEET, FEET_STEP])[frame];
  const grid = [...a.body, ...feet].map((r) => r.split(''));
  for (const [x, y, c] of a.marks ?? []) if (grid[y]?.[x] !== undefined) grid[y][x] = c;
  // The face only paints over the animal, never empty space.
  for (const [x, y, c] of face(a, mood)) if (grid[y]?.[x] && grid[y][x] !== '.') grid[y][x] = c;
  return { grid, palette: { m: a.palette.e, f: a.palette.b, h: '#FFFFFF', r: '#FF6B81', w: '#5AB8F0', ...a.palette } };
}

/** Renders a grid of palette letters as pixels, merging runs of the same colour into one rect. */
export function PixelArt({ grid, palette, size }: { grid: string[][] | Grid; palette: Palette; size: number }) {
  const rows = grid.map((r) => (typeof r === 'string' ? r.split('') : r));
  const w = Math.max(...rows.map((r) => r.length));
  const rects: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let end = x;
      while (end + 1 < row.length && row[end + 1] === c) end++;
      if (c !== '.' && palette[c]) rects.push(<Rect key={`${x}-${y}`} x={x} y={y} width={end - x + 1} height={1} fill={palette[c]} />);
      x = end + 1;
    }
  });
  return (
    <Svg width={size} height={(size * rows.length) / w} viewBox={`0 0 ${w} ${rows.length}`}>
      {rects}
    </Svg>
  );
}

export function PixelPet({ kind, mood, size, frame = 0 }: { kind: PetKind; mood: Mood; size: number; frame?: 0 | 1 }) {
  const { grid, palette } = useMemo(() => build(kind, mood, frame), [kind, mood, frame]);
  return <PixelArt grid={grid} palette={palette} size={size} />;
}

/** Small pixel badges shown above the pet for some moods. */
export const BADGES: Partial<Record<Mood, { grid: Grid; palette: Palette }>> = {
  thriving: { grid: ['...y...', '...y...', '.yyyyy.', 'yyywyyy', '.yyyyy.', '...y...', '...y...'], palette: { y: '#FFD23F', w: '#FFFFFF' } },
  happy: { grid: ['..kkkk', '..kkkk', '..k..k', '..k..k', 'kkk.kk', 'kkk.kk'], palette: { k: '#B48CFF' } },
  worried: { grid: ['..b..', '.bbb.', 'bbwbb', 'bbbbb', '.bbb.'], palette: { b: '#5AB8F0', w: '#D6F0FF' } },
  stressed: { grid: ['.gggg...', 'gggggg..', 'gggggggg', 'gggggggg', '..b..b..', '.b..b...', '....b..b'], palette: { g: '#9AA3B5', b: '#5AB8F0' } },
};

/** Shown while it's being tickled. */
export const HEART = { grid: ['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], palette: { r: '#FF5C8A', w: '#FFD1DE' } };

export const EGG = {
  grid: ['....oooo....', '...owwwwo...', '..owwwwwwo..', '..owwswwwo..', '.owwwwwwwwo.', '.owswwwwswo.', '.owwwwwwwwo.', '.owwwwswwwo.', '..owwwwwwo..', '...oooooo...'],
  palette: { o: '#7A6A58', w: '#FFF6E5', s: '#E9B872' },
};

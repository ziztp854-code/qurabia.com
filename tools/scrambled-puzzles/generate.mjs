/**
 * Generates the 20 scrambled-words-live puzzle images as SVG, converts them
 * to webp via sharp, and prints the matching seed manifest JSON.
 *
 * Run:  node tools/scrambled-puzzles/generate.mjs
 * Out:  tools/scrambled-puzzles/out/*.webp + tools/scrambled-puzzles/manifest.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('C:/Projects/qurabia/node_modules/.pnpm/sharp@0.35.3_@types+node@26.1.2/node_modules/sharp/package.json');
const sharp = require('sharp');

const W = 720;
const H = 540;

const GOLD = '#FFB40C';
const GOLD_SOFT = '#F2C14E';
const GOLD_DEEP = '#B8860B';
const CYAN = '#00D4FF';
const CYAN_SOFT = '#8DEBFF';
const INK = '#F8F3E7';
const NAVY = '#121A24';
const NAVY_2 = '#1B2735';
const SLATE = '#0D121A';

function bg(topGlow) {
  return `
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY_2}"/>
      <stop offset="1" stop-color="${SLATE}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${topGlow[0]}" cy="${topGlow[1]}" r="0.62">
      <stop offset="0" stop-color="${topGlow[2]}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${topGlow[2]}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${GOLD}" stroke-opacity="0.35" stroke-width="2" rx="14"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="${GOLD}" stroke-opacity="0.12" stroke-width="1" rx="10"/>`;
}

function stars(seed, count, area) {
  let out = '';
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i += 1) {
    const x = 34 + rnd() * (W - 68);
    const y = area[0] + rnd() * (area[1] - area[0]);
    const r = 1.1 + rnd() * 1.7;
    const c = rnd() > 0.75 ? CYAN : INK;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" opacity="${(0.35 + rnd() * 0.5).toFixed(2)}"/>`;
  }
  return out;
}

function frame() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
}

const scenes = {
  beach() {
    return `${frame()}${bg([0.5, 0.25, GOLD])}
    ${stars(7, 14, [40, 150])}
    <circle cx="360" cy="150" r="56" fill="${GOLD}"/>
    <circle cx="360" cy="150" r="72" fill="none" stroke="${GOLD}" stroke-opacity="0.3" stroke-width="2"/>
    <rect y="330" width="${W}" height="90" fill="${NAVY_2}"/>
    <path d="M0 330 Q 90 316 180 330 T 360 330 T 540 330 T 720 330 V 420 H 0 Z" fill="${CYAN}" opacity="0.55"/>
    <path d="M0 352 Q 90 338 180 352 T 360 352 T 540 352 T 720 352 V 430 H 0 Z" fill="${CYAN}" opacity="0.3"/>
    <path d="M0 420 Q 180 396 360 420 T 720 420 V 540 H 0 Z" fill="${GOLD_DEEP}"/>
    <path d="M0 420 Q 180 396 360 420 T 720 420" fill="none" stroke="${GOLD_SOFT}" stroke-width="3" stroke-opacity="0.5"/>
    <ellipse cx="150" cy="470" rx="46" ry="8" fill="${GOLD}" opacity="0.5"/>
    <ellipse cx="560" cy="492" rx="60" ry="9" fill="${GOLD}" opacity="0.35"/>
    </svg>`;
  },
  'city-night'() {
    let towers = '';
    const xs = [60, 140, 220, 300, 400, 480, 560, 640];
    xs.forEach((x, i) => {
      const h = 150 + ((i * 53) % 130);
      towers += `<rect x="${x}" y="${420 - h}" width="56" height="${h}" rx="6" fill="${NAVY}" stroke="${CYAN}" stroke-opacity="0.25"/>`;
      for (let r = 0; r < Math.floor(h / 34); r += 1) {
        towers += `<rect x="${x + 10}" y="${426 - h + r * 34}" width="${(i % 2 ? 36 : 26)}" height="7" rx="2" fill="${CYAN}" opacity="${0.5 + ((r + i) % 3) * 0.16}"/>`;
      }
    });
    return `${frame()}${bg([0.5, 0.15, CYAN])}
    ${stars(11, 26, [30, 240])}
    <circle cx="600" cy="90" r="34" fill="${GOLD}" opacity="0.9"/>
    <circle cx="588" cy="82" r="30" fill="${NAVY_2}"/>
    ${towers}
    <rect y="420" width="${W}" height="60" fill="${SLATE}"/>
    <line x1="0" y1="420" x2="720" y2="420" stroke="${CYAN}" stroke-opacity="0.4"/>
    </svg>`;
  },
  desert() {
    return `${frame()}${bg([0.5, 0.2, GOLD])}
    <circle cx="360" cy="130" r="60" fill="${GOLD}" opacity="0.95"/>
    <path d="M0 360 Q 180 300 360 360 T 720 360 V 540 H 0 Z" fill="${GOLD_DEEP}" opacity="0.85"/>
    <path d="M0 420 Q 240 360 480 420 T 720 430 V 540 H 0 Z" fill="${GOLD}" opacity="0.5"/>
    <path d="M0 470 Q 200 430 400 470 T 720 480 V 540 H 0 Z" fill="${NAVY_2}"/>
    <path d="M300 360 q 30 -46 60 0 q 8 14 -6 14 h -48 q -14 0 -6 -14 Z" fill="${GOLD_SOFT}" opacity="0.8"/>
    </svg>`;
  },
  mosque() {
    return `${frame()}${bg([0.5, 0.12, CYAN])}
    ${stars(3, 20, [30, 200])}
    <path d="M620 84 a 26 26 0 1 0 20 42 a 30 30 0 0 1 -20 -42 Z" fill="${GOLD}" opacity="0.9"/>
    <rect x="240" y="300" width="240" height="120" rx="6" fill="${GOLD_DEEP}"/>
    <path d="M240 300 a 120 120 0 0 1 240 0 Z" fill="${GOLD}"/>
    <path d="M270 300 a 90 90 0 0 1 180 0" fill="${GOLD_SOFT}" opacity="0.55"/>
    <circle cx="360" cy="180" r="9" fill="${GOLD}"/>
    <line x1="360" y1="188" x2="360" y2="200" stroke="${GOLD}" stroke-width="5"/>
    <path d="M300 420 v -50 a 24 24 0 0 1 48 0 v 50 Z" fill="${NAVY}"/>
    <path d="M384 420 v -50 a 24 24 0 0 1 24 24 v 26 Z" fill="${NAVY}" opacity="0.7"/>
    <rect x="150" y="230" width="30" height="190" rx="6" fill="${GOLD_SOFT}"/>
    <rect x="142" y="258" width="46" height="12" rx="6" fill="${GOLD}"/>
    <path d="M150 230 a 15 15 0 0 1 30 0 Z" fill="${GOLD}"/>
    <path d="M160 212 a 10 10 0 1 0 8 16 a 12 12 0 0 1 -8 -16 Z" fill="${GOLD_SOFT}"/>
    <rect x="540" y="230" width="30" height="190" rx="6" fill="${GOLD_SOFT}"/>
    <rect x="534" y="258" width="46" height="12" rx="6" fill="${GOLD}"/>
    <path d="M540 230 a 15 15 0 0 1 30 0 Z" fill="${GOLD}"/>
    <path d="M550 212 a 10 10 0 1 0 8 16 a 12 12 0 0 1 -8 -16 Z" fill="${GOLD_SOFT}"/>
    <rect x="60" y="420" width="600" height="14" rx="7" fill="${SLATE}"/>
    </svg>`;
  },
  coffee() {
    return `${frame()}${bg([0.5, 0.35, GOLD])}
    <ellipse cx="360" cy="470" rx="190" ry="18" fill="${NAVY}" opacity="0.8"/>
    <path d="M250 300 h 190 l -22 130 a 16 16 0 0 1 -16 14 h -114 a 16 16 0 0 1 -16 -14 Z" fill="${NAVY}" stroke="${GOLD}" stroke-width="3"/>
    <ellipse cx="345" cy="300" rx="95" ry="16" fill="${GOLD_DEEP}"/>
    <ellipse cx="360" cy="296" rx="72" ry="12" fill="${GOLD_SOFT}"/>
    <path d="M440 316 q 44 8 34 52 q -8 30 -34 34" fill="none" stroke="${GOLD}" stroke-width="9" stroke-linecap="round"/>
    <path d="M330 250 q -14 -30 6 -58 q 16 -24 4 -44" fill="none" stroke="${CYAN}" stroke-opacity="0.75" stroke-width="7" stroke-linecap="round"/>
    <path d="M378 258 q -12 -26 4 -48" fill="none" stroke="${CYAN}" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round"/>
    <circle cx="300" cy="120" r="5" fill="${INK}" opacity="0.5"/><circle cx="430" cy="90" r="4" fill="${INK}" opacity="0.4"/>
    </svg>`;
  },
  rain() {
    let drops = '';
    for (let i = 0; i < 22; i += 1) {
      const x = 60 + ((i * 97) % 600);
      const y = 190 + ((i * 53) % 200);
      drops += `<line x1="${x}" y1="${y}" x2="${x - 8}" y2="${y + 24}" stroke="${CYAN}" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>`;
    }
    return `${frame()}${bg([0.5, 0.1, CYAN])}
    <ellipse cx="200" cy="110" rx="120" ry="42" fill="${NAVY}" opacity="0.9"/>
    <ellipse cx="320" cy="130" rx="130" ry="46" fill="${NAVY_2}" opacity="0.9"/>
    <ellipse cx="470" cy="105" rx="110" ry="38" fill="${NAVY}" opacity="0.9"/>
    ${drops}
    <path d="M360 300 a 130 130 0 0 1 260 0 Z" fill="${GOLD}"/>
    <path d="M360 300 a 130 130 0 0 1 86 0 Z" fill="${GOLD_SOFT}"/>
    <path d="M490 300 a 130 130 0 0 0 -66 0" fill="${CYAN}" opacity="0.4"/>
    <line x1="490" y1="300" x2="490" y2="420" stroke="${GOLD}" stroke-width="6"/>
    <path d="M490 420 q 10 16 0 30 q -12 -14 0 -30" fill="${GOLD_SOFT}"/>
    <line x1="120" y1="480" x2="600" y2="480" stroke="${NAVY}" stroke-width="6" stroke-linecap="round"/>
    </svg>`;
  },
  mountains() {
    return `${frame()}${bg([0.5, 0.15, CYAN])}
    ${stars(5, 18, [30, 150])}
    <circle cx="140" cy="110" r="40" fill="${GOLD}" opacity="0.9"/>
    <path d="M40 470 L 210 200 L 330 400 L 420 300 L 560 470 Z" fill="${NAVY}" stroke="${CYAN}" stroke-opacity="0.3"/>
    <path d="M210 200 L 260 285 L 210 300 L 165 275 Z" fill="${CYAN_SOFT}" opacity="0.8"/>
    <path d="M420 300 L 470 375 L 420 390 L 375 355 Z" fill="${CYAN_SOFT}" opacity="0.7"/>
    <path d="M480 470 L 600 260 L 700 440 L 700 470 Z" fill="${NAVY_2}" stroke="${GOLD}" stroke-opacity="0.3"/>
    <path d="M600 260 L 645 330 L 600 350 L 560 320 Z" fill="${GOLD}" opacity="0.75"/>
    <rect y="470" width="${W}" height="30" fill="${SLATE}"/>
    </svg>`;
  },
  'moon-stars'() {
    let starsOut = '';
    let s = 21;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 40; i += 1) {
      const x = 40 + rnd() * 640;
      const y = 40 + rnd() * 420;
      starsOut += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1 + rnd() * 2.4).toFixed(1)}" fill="${rnd() > 0.6 ? CYAN : INK}" opacity="${(0.4 + rnd() * 0.55).toFixed(2)}"/>`;
    }
    return `${frame()}${bg([0.62, 0.3, CYAN])}
    ${starsOut}
    <circle cx="380" cy="240" r="110" fill="${GOLD}"/>
    <circle cx="416" cy="222" r="92" fill="${NAVY_2}"/>
    <circle cx="330" cy="300" r="9" fill="${GOLD_DEEP}" opacity="0.8"/>
    <circle cx="352" cy="330" r="6" fill="${GOLD_DEEP}" opacity="0.6"/>
    <path d="M170 130 l 6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6 Z" fill="${INK}" opacity="0.85"/>
    <path d="M560 150 l 5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5 Z" fill="${CYAN}" opacity="0.85"/>
    </svg>`;
  },
  market() {
    let tents = '';
    [80, 260, 440, 620].forEach((x, i) => {
      const c = i % 2 ? CYAN : GOLD;
      tents += `<path d="M${x - 60} 330 q 60 -70 120 0 Z" fill="${c}" opacity="0.85"/>
      <rect x="${x - 44}" y="330" width="88" height="90" fill="${NAVY}"/>
      <line x1="${x - 44}" y1="352" x2="${x + 44}" y2="352" stroke="${c}" stroke-opacity="0.5"/>`;
    });
    return `${frame()}${bg([0.5, 0.3, GOLD])}
    <circle cx="120" cy="100" r="42" fill="${GOLD}" opacity="0.85"/>
    ${tents}
    <ellipse cx="360" cy="470" rx="300" ry="14" fill="${NAVY}"/>
    <circle cx="250" cy="430" r="16" fill="${GOLD_SOFT}"/>
    <rect x="238" y="438" width="24" height="26" rx="4" fill="${NAVY_2}"/>
    <circle cx="470" cy="426" r="18" fill="${CYAN}" opacity="0.8"/>
    <rect x="456" y="436" width="28" height="28" rx="4" fill="${NAVY_2}"/>
    </svg>`;
  },
  palm() {
    return `${frame()}${bg([0.4, 0.2, GOLD])}
    <circle cx="540" cy="120" r="48" fill="${GOLD}" opacity="0.9"/>
    <path d="M0 440 Q 240 400 480 440 T 720 445 V 540 H 0 Z" fill="${GOLD_DEEP}" opacity="0.8"/>
    <path d="M300 440 q 10 -150 -6 -210 q 30 12 48 40" fill="none" stroke="${GOLD_SOFT}" stroke-width="14" stroke-linecap="round"/>
    <path d="M310 250 q -70 -30 -120 10 q 66 -6 120 6 Z" fill="${GOLD}"/>
    <path d="M330 240 q 30 -80 110 -70 q -60 30 -80 80 Z" fill="${GOLD}"/>
    <path d="M340 250 q 90 -20 130 40 q -70 -14 -130 -16 Z" fill="${GOLD_SOFT}"/>
    <path d="M320 255 q -80 10 -110 70 q 76 -22 116 -20 Z" fill="${GOLD_SOFT}"/>
    <circle cx="316" cy="262" r="7" fill="${GOLD_DEEP}"/><circle cx="334" cy="268" r="7" fill="${GOLD_DEEP}"/>
    <path d="M540 440 q 6 -70 -14 -110" fill="none" stroke="${GOLD_SOFT}" stroke-width="9" stroke-linecap="round"/>
    </svg>`;
  },
  sailboat() {
    return `${frame()}${bg([0.5, 0.15, CYAN])}
    ${stars(9, 16, [30, 160])}
    <path d="M0 360 Q 180 336 360 360 T 720 360 V 540 H 0 Z" fill="${NAVY}" opacity="0.9"/>
    <path d="M0 420 Q 120 400 240 420 T 480 420 T 720 415 V 540 H 0 Z" fill="${CYAN}" opacity="0.35"/>
    <path d="M360 120 v 190" stroke="${INK}" stroke-width="6"/>
    <path d="M360 130 q 120 60 96 170 h -96 Z" fill="${INK}" opacity="0.92"/>
    <path d="M352 140 q -110 66 -84 160 h 84 Z" fill="${CYAN}" opacity="0.85"/>
    <path d="M290 330 h 150 l -22 46 h -110 Z" fill="${GOLD_DEEP}"/>
    <path d="M320 376 h 120 l -10 22 h -100 Z" fill="${GOLD}"/>
    </svg>`;
  },
  clock() {
    return `${frame()}${bg([0.5, 0.3, GOLD])}
    <circle cx="360" cy="260" r="150" fill="${NAVY}" stroke="${GOLD}" stroke-width="10"/>
    <circle cx="360" cy="260" r="150" fill="none" stroke="${GOLD}" stroke-opacity="0.25" stroke-width="24"/>
    ${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const x1 = 360 + Math.sin(rad) * 128;
      const y1 = 260 - Math.cos(rad) * 128;
      const x2 = 360 + Math.sin(rad) * 142;
      const y2 = 260 - Math.cos(rad) * 142;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-opacity="0.7" stroke-width="4"/>`;
    }).join('')}
    <line x1="360" y1="260" x2="360" y2="160" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
    <line x1="360" y1="260" x2="440" y2="300" stroke="${CYAN}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="360" cy="260" r="12" fill="${GOLD}"/>
    <path d="M300 80 q 60 -30 120 0" fill="none" stroke="${CYAN}" stroke-opacity="0.4" stroke-width="4"/>
    </svg>`;
  },
  library() {
    let books = '';
    [60, 140, 220, 300, 380, 460, 540].forEach((x, i) => {
      books += `<rect x="${x}" y="180" width="52" height="150" rx="5" fill="${i % 2 ? NAVY_2 : NAVY}" stroke="${i % 2 ? GOLD : CYAN}" stroke-opacity="0.5"/>`;
      books += `<rect x="${x + 12}" y="210" width="28" height="6" rx="3" fill="${i % 2 ? GOLD : CYAN}" opacity="0.7"/>`;
      books += `<rect x="${x + 12}" y="230" width="28" height="6" rx="3" fill="${i % 2 ? GOLD : CYAN}" opacity="0.5"/>`;
    });
    return `${frame()}${bg([0.5, 0.3, GOLD])}
    ${books}
    <rect x="40" y="340" width="600" height="16" rx="8" fill="${GOLD_DEEP}"/>
    <rect x="40" y="356" width="600" height="10" rx="5" fill="${NAVY}"/>
    <path d="M320 380 q -60 -22 -120 4 l 0 0 q 60 22 120 4 Z" fill="${INK}" opacity="0.9"/>
    <path d="M320 380 q 60 -22 120 4 q -60 22 -120 -4 Z" fill="${INK}" opacity="0.9"/>
    <line x1="320" y1="380" x2="320" y2="412" stroke="${INK}" stroke-width="4"/>
    <circle cx="150" cy="90" r="5" fill="${INK}" opacity="0.4"/>
    <circle cx="560" cy="80" r="4" fill="${CYAN}" opacity="0.6"/>
    </svg>`;
  },
  campfire() {
    return `${frame()}${bg([0.5, 0.15, GOLD])}
    ${stars(13, 22, [30, 200])}
    <path d="M60 380 L 200 300 L 340 380 Z" fill="${NAVY}" stroke="${GOLD}" stroke-opacity="0.3"/>
    <path d="M130 300 q 70 -50 140 0 l 0 0 q -70 34 -140 0 Z" fill="${GOLD}" opacity="0.75"/>
    <path d="M240 430 q 0 -40 40 -60 q 26 34 14 62 q -4 16 -27 16 q -27 -2 -27 -26 Z" fill="${GOLD}"/>
    <path d="M262 430 q 0 -26 22 -34 q 14 20 6 40 q -4 12 -14 12 q -14 -4 -14 -24 Z" fill="${CYAN}" opacity="0.75"/>
    <ellipse cx="360" cy="500" rx="150" ry="16" fill="${NAVY}"/>
    <line x1="250" y1="498" x2="470" y2="492" stroke="${GOLD_DEEP}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="300" cy="470" r="5" fill="${GOLD_SOFT}" opacity="0.8"/>
    <circle cx="420" cy="480" r="4" fill="${GOLD_SOFT}" opacity="0.6"/>
    </svg>`;
  },
  balloon() {
    return `${frame()}${bg([0.5, 0.15, CYAN])}
    ${stars(17, 24, [30, 300])}
    <ellipse cx="360" cy="200" rx="120" ry="140" fill="${GOLD}"/>
    <path d="M360 60 a 120 140 0 0 1 0 280" fill="${GOLD_SOFT}" opacity="0.55"/>
    <path d="M300 80 q 20 120 -10 240" fill="none" stroke="${NAVY}" stroke-width="5" opacity="0.6"/>
    <path d="M420 80 q -16 120 10 240" fill="none" stroke="${NAVY}" stroke-width="5" opacity="0.6"/>
    <rect x="330" y="356" width="60" height="44" rx="8" fill="${NAVY_2}" stroke="${CYAN}" stroke-opacity="0.5"/>
    <line x1="338" y1="356" x2="342" y2="344" stroke="${CYAN}" stroke-width="4"/>
    <line x1="382" y1="356" x2="378" y2="344" stroke="${CYAN}" stroke-width="4"/>
    <path d="M540 90 q 40 20 20 60 q -50 6 -36 -32 q 6 -20 16 -28 Z" fill="${CYAN}" opacity="0.6"/>
    <path d="M150 260 q 30 14 14 44 q -30 2 -26 -28 q 4 -12 12 -16 Z" fill="${CYAN}" opacity="0.5"/>
    </svg>`;
  },
  rose() {
    return `${frame()}${bg([0.5, 0.3, GOLD])}
    <path d="M360 470 q -10 -140 0 -210" fill="none" stroke="${CYAN}" stroke-width="8" stroke-linecap="round"/>
    <path d="M358 400 q -56 -6 -70 -48 q 50 -6 70 24 Z" fill="${GOLD_SOFT}"/>
    <path d="M362 360 q 56 -6 70 -48 q -50 -4 -70 24 Z" fill="${GOLD_SOFT}"/>
    <circle cx="360" cy="220" r="56" fill="${CYAN}" opacity="0.28"/>
    <path d="M360 170 a 56 56 0 0 1 48 84 q -20 -10 -22 -34 q -26 8 -26 -50 Z" fill="${GOLD}"/>
    <path d="M360 170 a 56 56 0 0 0 -48 84 q 20 -10 22 -34 q 26 -8 26 -50 Z" fill="${GOLD_SOFT}"/>
    <circle cx="360" cy="222" r="26" fill="${GOLD_DEEP}"/>
    <path d="M340 200 q 20 -14 40 0 q -8 18 -20 18 q -12 0 -20 -18 Z" fill="${GOLD}" opacity="0.9"/>
    <circle cx="200" cy="140" r="4" fill="${INK}" opacity="0.5"/><circle cx="520" cy="110" r="5" fill="${INK}" opacity="0.4"/>
    </svg>`;
  },
  football() {
    return `${frame()}${bg([0.35, 0.2, CYAN])}
    <rect x="60" y="330" width="600" height="14" rx="7" fill="${GOLD}" opacity="0.85"/>
    <path d="M120 330 v -90 h 120 v 90" fill="none" stroke="${INK}" stroke-width="7"/>
    <path d="M600 330 v -90 h -120 v 90" fill="none" stroke="${INK}" stroke-width="7"/>
    <line x1="360" y1="120" x2="360" y2="330" stroke="${INK}" stroke-opacity="0.4" stroke-dasharray="10 10"/>
    <circle cx="360" cy="410" r="44" fill="${INK}"/>
    <path d="M360 382 l 22 16 -8 26 h -28 l -8 -26 Z" fill="${NAVY}"/>
    <circle cx="360" cy="410" r="44" fill="none" stroke="${CYAN}" stroke-opacity="0.5" stroke-width="3"/>
    <circle cx="160" cy="90" r="5" fill="${CYAN}" opacity="0.5"/><circle cx="580" cy="100" r="4" fill="${GOLD}" opacity="0.6"/>
    </svg>`;
  },
  tea() {
    return `${frame()}${bg([0.5, 0.28, GOLD])}
    <ellipse cx="360" cy="480" rx="230" ry="16" fill="${NAVY}"/>
    <path d="M240 300 h 110 a 55 55 0 0 1 -110 0 Z" fill="${GOLD_SOFT}"/>
    <ellipse cx="295" cy="300" rx="55" ry="10" fill="${GOLD_DEEP}"/>
    <path d="M270 262 q -10 -22 4 -40" fill="none" stroke="${CYAN}" stroke-opacity="0.6" stroke-width="6" stroke-linecap="round"/>
    <path d="M300 268 q -8 -18 2 -36" fill="none" stroke="${CYAN}" stroke-opacity="0.45" stroke-width="6" stroke-linecap="round"/>
    <path d="M430 210 q 60 30 44 100 q -14 46 -64 54" fill="none" stroke="${GOLD}" stroke-width="10" stroke-linecap="round"/>
    <ellipse cx="452" cy="196" rx="26" ry="16" fill="${GOLD}" opacity="0.9"/>
    <path d="M470 250 q 40 -8 52 24 q -30 22 -52 6 Z" fill="${GOLD_SOFT}" opacity="0.85"/>
    <path d="M446 150 q 24 -26 48 0 q -24 20 -48 0 Z" fill="${GOLD}"/>
    <path d="M470 142 q 4 -18 20 -24" fill="none" stroke="${GOLD_SOFT}" stroke-width="5" stroke-linecap="round"/>
    </svg>`;
  },
  lantern() {
    return `${frame()}${bg([0.5, 0.2, GOLD])}
    ${stars(19, 22, [30, 220])}
    <path d="M620 80 a 30 30 0 1 0 24 48 a 34 34 0 0 1 -24 -48 Z" fill="${GOLD}" opacity="0.9"/>
    <line x1="360" y1="70" x2="360" y2="150" stroke="${GOLD_DEEP}" stroke-width="4"/>
    <path d="M330 150 h 60 l -10 22 h -40 Z" fill="${GOLD_DEEP}"/>
    <rect x="316" y="160" width="88" height="130" rx="30" fill="${GOLD}" opacity="0.92"/>
    <path d="M330 200 h 60 M330 240 h 60" stroke="${NAVY}" stroke-width="6" opacity="0.7"/>
    <path d="M326 290 h 68 l -8 22 h -52 Z" fill="${GOLD_DEEP}"/>
    <ellipse cx="360" cy="180" rx="30" ry="12" fill="${CYAN}" opacity="0.4"/>
    <circle cx="360" cy="225" r="16" fill="${INK}" opacity="0.9"/>
    <path d="M120 170 q 26 12 18 40 q -26 4 -30 -20 q 2 -14 12 -20 Z" fill="${CYAN}" opacity="0.45"/>
    </svg>`;
  },
  compass() {
    return `${frame()}${bg([0.5, 0.3, CYAN])}
    <circle cx="360" cy="260" r="150" fill="${NAVY}" stroke="${GOLD}" stroke-width="10"/>
    <circle cx="360" cy="260" r="120" fill="${NAVY_2}"/>
    ${[0, 90, 180, 270].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const x1 = 360 + Math.sin(rad) * 100;
      const y1 = 260 - Math.cos(rad) * 100;
      const x2 = 360 + Math.sin(rad) * 116;
      const y2 = 260 - Math.cos(rad) * 116;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-opacity="0.8" stroke-width="4"/>`;
    }).join('')}
    <path d="M360 150 l 26 96 -26 30 -26 -30 Z" fill="${GOLD}"/>
    <path d="M360 370 l -26 -94 26 -26 26 26 Z" fill="${CYAN}"/>
    <circle cx="360" cy="260" r="14" fill="${INK}"/>
    <path d="M120 90 q 90 -60 180 0" fill="none" stroke="${CYAN}" stroke-opacity="0.35" stroke-dasharray="6 8" stroke-width="3"/>
    <circle cx="600" cy="120" r="34" fill="${GOLD}" opacity="0.3"/>
    </svg>`;
  },
};

const manifest = [
  ['beach', 'شاطئ', ['بحر', 'امواج', 'شاطئ', 'رمال', 'شمس']],
  ['city-night', 'ليل المدينة', ['مدينة', 'ابراج', 'انوار', 'ليل']],
  ['desert', 'صحراء', ['صحراء', 'كثبان', 'شمس', 'رمال']],
  ['mosque', 'مسجد', ['مسجد', 'قبة', 'مئذنة', 'هلال']],
  ['coffee', 'قهوة', ['فنجان', 'بخار', 'ضيافة', 'قهوة']],
  ['rain', 'مطر', ['مطر', 'سحاب', 'مظلة', 'قطرات']],
  ['mountains', 'جبال', ['جبال', 'قمة', 'ثلوج', 'وادي']],
  ['moon-stars', 'قمر ونجوم', ['قمر', 'نجوم', 'سماء', 'ليل']],
  ['market', 'سوق', ['سوق', 'فانوس', 'خيام', 'زحام']],
  ['palm', 'نخلة', ['نخلة', 'تمر', 'سعف', 'واحة']],
  ['sailboat', 'قارب', ['قارب', 'شراع', 'بحر', 'ريح']],
  ['clock', 'ساعة', ['ساعة', 'عقارب', 'وقت', 'دقائق']],
  ['library', 'مكتبة', ['مكتبة', 'كتب', 'رفوف', 'قراءة']],
  ['campfire', 'مخيم', ['نار', 'خيمة', 'مخيم', 'لهب']],
  ['balloon', 'منطاد', ['منطاد', 'سماء', 'ريح', 'سلة']],
  ['rose', 'وردة', ['وردة', 'بتلات', 'عطر', 'ازهار']],
  ['football', 'كرة قدم', ['كرة', 'ملعب', 'مرمى', 'مباراة']],
  ['tea', 'شاي', ['براد', 'شاي', 'كاسات', 'نعناع']],
  ['lantern', 'فانوس', ['فانوس', 'رمضان', 'ضوء', 'هلال']],
  ['compass', 'بوصلة', ['بوصلة', 'خريطة', 'سفر', 'اتجاه']],
];

mkdirSync('tools/scrambled-puzzles/out', { recursive: true });

const manifestEntries = [];
for (const [key, category, words] of manifest) {
  const svg = scenes[key]();
  const svgPath = `tools/scrambled-puzzles/out/${key}.svg`;
  const webpPath = `tools/scrambled-puzzles/out/${key}.webp`;
  writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(webpPath);
  manifestEntries.push({ file: `../tools/scrambled-puzzles/out/${key}.webp`, words, category });
  console.log(`ok: ${key}.webp`);
}

writeFileSync(
  'tools/scrambled-puzzles/manifest.json',
  `${JSON.stringify(manifestEntries, null, 2)}\n`,
);
console.log(`manifest written with ${manifestEntries.length} entries`);
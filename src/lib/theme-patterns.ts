import type { ThemePattern } from "./types";

/**
 * Wrap pattern children in an SVG and url-encode for use as a CSS background-image.
 *
 * Patterns layer multiple motifs at different sizes/rotations/opacities to feel
 * intricate while keeping the only theme input a single accent color. Lighter
 * variants are produced via stroke/fill opacity stops.
 */
function tile(w: number, h: number, content: string): string {
  const raw = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${content}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(raw)}")`;
}

const builders: Record<ThemePattern, (accent: string) => string> = {
  // ─── Confetti — streamers, dots, triangles scattered like a party explosion ───
  confetti: (a) =>
    tile(
      140,
      140,
      `
      <g fill='${a}'>
        <!-- Streamers (curved ribbons) -->
        <path d='M10 22 Q22 14, 30 22 T50 24' fill='none' stroke='${a}' stroke-width='1.4' stroke-opacity='0.16' stroke-linecap='round'/>
        <path d='M82 96 Q92 88, 100 96 T120 98' fill='none' stroke='${a}' stroke-width='1.4' stroke-opacity='0.14' stroke-linecap='round'/>
        <path d='M70 8 Q80 18, 88 12' fill='none' stroke='${a}' stroke-width='1.2' stroke-opacity='0.12' stroke-linecap='round'/>
        <path d='M22 110 Q32 100, 42 108' fill='none' stroke='${a}' stroke-width='1.2' stroke-opacity='0.12' stroke-linecap='round'/>

        <!-- Rectangles (confetti pieces) -->
        <rect x='40' y='44' width='8' height='3' rx='1' transform='rotate(35 44 45)' fill-opacity='0.14'/>
        <rect x='102' y='32' width='9' height='3' rx='1' transform='rotate(-25 106 33)' fill-opacity='0.13'/>
        <rect x='62' y='72' width='8' height='3' rx='1' transform='rotate(70 66 73)' fill-opacity='0.15'/>
        <rect x='14' y='60' width='7' height='3' rx='1' transform='rotate(-50 17 61)' fill-opacity='0.12'/>
        <rect x='112' y='80' width='8' height='3' rx='1' transform='rotate(20 116 81)' fill-opacity='0.14'/>
        <rect x='30' y='90' width='7' height='3' rx='1' transform='rotate(-15 33 91)' fill-opacity='0.12'/>

        <!-- Triangles (foil bits) -->
        <polygon points='90,52 96,52 93,58' fill-opacity='0.13'/>
        <polygon points='52,12 58,12 55,18' fill-opacity='0.12'/>
        <polygon points='124,118 130,118 127,124' fill-opacity='0.13'/>

        <!-- Dots -->
        <circle cx='28' cy='30' r='1.6' fill-opacity='0.14'/>
        <circle cx='118' cy='18' r='1.4' fill-opacity='0.13'/>
        <circle cx='78' cy='126' r='1.6' fill-opacity='0.14'/>
        <circle cx='6' cy='78' r='1.2' fill-opacity='0.12'/>
        <circle cx='62' cy='40' r='1' fill-opacity='0.11'/>
        <circle cx='100' cy='66' r='1.4' fill-opacity='0.13'/>
      </g>`
    ),

  // ─── Hearts — multiple sizes + sparkles between ───
  hearts: (a) =>
    tile(
      120,
      120,
      `
      <g fill='${a}'>
        <!-- Large hearts (anchor) -->
        <path d='M30 56 C16 44, 9 38, 9 28 C9 21, 14 17, 19 17 C24 17, 28 20, 30 24 C32 20, 36 17, 41 17 C46 17, 51 21, 51 28 C51 38, 44 44, 30 56 Z'
              fill-opacity='0.13'/>
        <path d='M90 100 C76 88, 69 82, 69 72 C69 65, 74 61, 79 61 C84 61, 88 64, 90 68 C92 64, 96 61, 101 61 C106 61, 111 65, 111 72 C111 82, 104 88, 90 100 Z'
              fill-opacity='0.13'/>

        <!-- Small hearts (rhythm) -->
        <g transform='translate(80 30) scale(0.5)'>
          <path d='M0 22 C-14 10, -21 4, -21 -6 C-21 -13, -16 -17, -11 -17 C-6 -17, -2 -14, 0 -10 C2 -14, 6 -17, 11 -17 C16 -17, 21 -13, 21 -6 C21 4, 14 10, 0 22 Z' fill-opacity='0.11'/>
        </g>
        <g transform='translate(20 88) scale(0.45)'>
          <path d='M0 22 C-14 10, -21 4, -21 -6 C-21 -13, -16 -17, -11 -17 C-6 -17, -2 -14, 0 -10 C2 -14, 6 -17, 11 -17 C16 -17, 21 -13, 21 -6 C21 4, 14 10, 0 22 Z' fill-opacity='0.11'/>
        </g>

        <!-- Sparkles -->
        <g stroke='${a}' stroke-width='1' stroke-opacity='0.15' stroke-linecap='round' fill='none'>
          <line x1='62' y1='12' x2='62' y2='18'/>
          <line x1='59' y1='15' x2='65' y2='15'/>
          <line x1='110' y1='40' x2='110' y2='46'/>
          <line x1='107' y1='43' x2='113' y2='43'/>
          <line x1='10' y1='62' x2='10' y2='66'/>
          <line x1='8' y1='64' x2='12' y2='64'/>
          <line x1='52' y1='80' x2='52' y2='84'/>
          <line x1='50' y1='82' x2='54' y2='82'/>
        </g>

        <!-- Tiny dots -->
        <circle cx='68' cy='52' r='1.2' fill-opacity='0.14'/>
        <circle cx='40' cy='100' r='1' fill-opacity='0.12'/>
        <circle cx='108' cy='12' r='1.2' fill-opacity='0.13'/>
      </g>`
    ),

  // ─── Shamrocks — detailed 4-leaf clovers with stems and dots ───
  shamrocks: (a) =>
    tile(
      120,
      120,
      `
      <g fill='${a}'>
        <!-- Big 4-leaf clover -->
        <g transform='translate(36 40)'>
          <path d='M0 -2 C-10 -10, -16 -6, -14 4 C-12 8, -6 10, 0 4 Z' fill-opacity='0.12'/>
          <path d='M2 0 C10 -10, 16 -6, 14 4 C12 8, 6 10, 2 4 Z' fill-opacity='0.13'/>
          <path d='M0 2 C-10 12, -16 8, -14 -2 C-12 -6, -6 -8, 0 -2 Z' transform='rotate(180)' fill-opacity='0.13'/>
          <path d='M-2 0 C-10 10, -16 6, -14 -4 C-12 -8, -6 -10, -2 -4 Z' transform='rotate(90)' fill-opacity='0.12'/>
          <path d='M0 6 Q2 14 4 20' fill='none' stroke='${a}' stroke-opacity='0.16' stroke-width='1.4' stroke-linecap='round'/>
        </g>

        <!-- Small 3-leaf clover -->
        <g transform='translate(86 88) scale(0.7)'>
          <circle cx='0' cy='-9' r='6' fill-opacity='0.12'/>
          <circle cx='-8' cy='4' r='6' fill-opacity='0.12'/>
          <circle cx='8' cy='4' r='6' fill-opacity='0.12'/>
          <path d='M0 6 Q1 14 -2 22' fill='none' stroke='${a}' stroke-opacity='0.14' stroke-width='1.2' stroke-linecap='round'/>
        </g>

        <!-- Mini 3-leaf clover -->
        <g transform='translate(96 28) scale(0.5) rotate(20)'>
          <circle cx='0' cy='-9' r='6' fill-opacity='0.11'/>
          <circle cx='-8' cy='4' r='6' fill-opacity='0.11'/>
          <circle cx='8' cy='4' r='6' fill-opacity='0.11'/>
        </g>
        <g transform='translate(18 96) scale(0.5) rotate(-15)'>
          <circle cx='0' cy='-9' r='6' fill-opacity='0.11'/>
          <circle cx='-8' cy='4' r='6' fill-opacity='0.11'/>
          <circle cx='8' cy='4' r='6' fill-opacity='0.11'/>
        </g>

        <!-- Tiny dots -->
        <circle cx='62' cy='14' r='1.2' fill-opacity='0.12'/>
        <circle cx='12' cy='52' r='1.2' fill-opacity='0.12'/>
        <circle cx='112' cy='62' r='1.2' fill-opacity='0.12'/>
        <circle cx='66' cy='108' r='1.2' fill-opacity='0.12'/>
      </g>`
    ),

  // ─── Eggs — patterned eggs with stripes/dots, plus tulip flourishes ───
  eggs: (a) =>
    tile(
      140,
      140,
      `
      <g fill='${a}'>
        <!-- Egg 1 — striped -->
        <g transform='translate(34 42)'>
          <ellipse cx='0' cy='0' rx='12' ry='15' fill-opacity='0.10'/>
          <g stroke='${a}' stroke-opacity='0.16' stroke-width='1' fill='none'>
            <path d='M-11 -5 Q0 -7 11 -5'/>
            <path d='M-12 0 Q0 -2 12 0'/>
            <path d='M-11 5 Q0 3 11 5'/>
            <path d='M-9 10 Q0 8 9 10'/>
          </g>
        </g>

        <!-- Egg 2 — dotted -->
        <g transform='translate(98 92)'>
          <ellipse cx='0' cy='0' rx='12' ry='15' fill-opacity='0.10'/>
          <g fill-opacity='0.18'>
            <circle cx='-5' cy='-7' r='1.4'/>
            <circle cx='4' cy='-3' r='1.4'/>
            <circle cx='-3' cy='4' r='1.4'/>
            <circle cx='5' cy='8' r='1.4'/>
            <circle cx='-6' cy='10' r='1.2'/>
          </g>
        </g>

        <!-- Tulip flourish -->
        <g transform='translate(98 32)' fill-opacity='0.13' stroke='${a}' stroke-opacity='0.16' stroke-width='1' stroke-linecap='round'>
          <path d='M0 0 Q-5 -10 0 -14 Q5 -10 0 0 Z' fill='${a}'/>
          <line x1='0' y1='0' x2='0' y2='14'/>
          <path d='M0 8 Q-6 6 -8 12' fill='none'/>
        </g>

        <!-- Sprigs -->
        <g transform='translate(28 98)' stroke='${a}' stroke-opacity='0.15' stroke-width='1' stroke-linecap='round' fill='none'>
          <path d='M0 12 Q0 4 0 -4'/>
          <path d='M0 8 Q-4 4 -7 4'/>
          <path d='M0 4 Q4 0 7 0'/>
          <path d='M0 0 Q-4 -4 -6 -6'/>
        </g>

        <!-- Tiny dots -->
        <circle cx='70' cy='20' r='1.2' fill-opacity='0.13'/>
        <circle cx='128' cy='62' r='1.2' fill-opacity='0.13'/>
        <circle cx='14' cy='70' r='1.2' fill-opacity='0.13'/>
        <circle cx='66' cy='128' r='1.2' fill-opacity='0.13'/>
        <circle cx='62' cy='66' r='1' fill-opacity='0.11'/>
      </g>`
    ),

  // ─── Stars — large, medium, small + sparkles ───
  stars: (a) =>
    tile(
      120,
      120,
      `
      <g fill='${a}'>
        <!-- Large 5-point star -->
        <path d='M30 14 L34 26 L46 26 L36 33 L40 45 L30 38 L20 45 L24 33 L14 26 L26 26 Z' fill-opacity='0.13'/>
        <!-- Medium star, rotated -->
        <g transform='translate(90 78) rotate(15)'>
          <path d='M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3 Z' fill-opacity='0.13'/>
        </g>
        <!-- Small stars -->
        <g transform='translate(78 24) scale(0.55)'>
          <path d='M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3 Z' fill-opacity='0.12'/>
        </g>
        <g transform='translate(24 92) scale(0.55) rotate(-20)'>
          <path d='M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3 Z' fill-opacity='0.12'/>
        </g>

        <!-- 4-point sparkles -->
        <g fill-opacity='0.14'>
          <path d='M62 56 L64 60 L62 64 L60 60 Z M58 60 L62 58 L66 60 L62 62 Z'/>
          <path d='M108 30 L110 33 L108 36 L106 33 Z M104 33 L108 31 L112 33 L108 35 Z'/>
          <path d='M14 56 L16 59 L14 62 L12 59 Z M10 59 L14 57 L18 59 L14 61 Z'/>
        </g>

        <!-- Tiny dots -->
        <circle cx='52' cy='8' r='1' fill-opacity='0.12'/>
        <circle cx='110' cy='106' r='1' fill-opacity='0.12'/>
        <circle cx='6' cy='30' r='1' fill-opacity='0.12'/>
        <circle cx='42' cy='110' r='1' fill-opacity='0.12'/>
      </g>`
    ),

  // ─── Bats — bats + spider on web threads ───
  bats: (a) =>
    tile(
      140,
      120,
      `
      <g fill='${a}'>
        <!-- Big bat -->
        <g transform='translate(36 36)'>
          <path d='M0 0 Q-12 -8 -22 -4 Q-16 -2 -20 6 Q-12 0 -6 6 Q-3 4 0 8 Q3 4 6 6 Q12 0 20 6 Q16 -2 22 -4 Q12 -8 0 0 Z' fill-opacity='0.14'/>
          <circle cx='-2' cy='-1' r='0.8' fill-opacity='0.20'/>
          <circle cx='2' cy='-1' r='0.8' fill-opacity='0.20'/>
        </g>

        <!-- Smaller bat -->
        <g transform='translate(102 88) scale(0.7)'>
          <path d='M0 0 Q-12 -8 -22 -4 Q-16 -2 -20 6 Q-12 0 -6 6 Q-3 4 0 8 Q3 4 6 6 Q12 0 20 6 Q16 -2 22 -4 Q12 -8 0 0 Z' fill-opacity='0.13'/>
        </g>

        <!-- Tiny bat -->
        <g transform='translate(118 24) scale(0.45)'>
          <path d='M0 0 Q-12 -8 -22 -4 Q-16 -2 -20 6 Q-12 0 -6 6 Q-3 4 0 8 Q3 4 6 6 Q12 0 20 6 Q16 -2 22 -4 Q12 -8 0 0 Z' fill-opacity='0.12'/>
        </g>

        <!-- Spider web corner threads -->
        <g stroke='${a}' stroke-opacity='0.14' stroke-width='0.9' fill='none' stroke-linecap='round'>
          <path d='M0 0 L18 14'/>
          <path d='M0 0 L8 22'/>
          <path d='M0 0 L22 8'/>
          <path d='M0 8 Q10 8 18 14'/>
          <path d='M0 16 Q8 18 8 22'/>
          <path d='M140 120 L122 106'/>
          <path d='M140 120 L132 98'/>
          <path d='M140 120 L118 112'/>
        </g>

        <!-- Tiny spider -->
        <g transform='translate(64 78)' fill-opacity='0.16'>
          <circle cx='0' cy='0' r='2.2'/>
          <g stroke='${a}' stroke-opacity='0.16' stroke-width='0.8' stroke-linecap='round' fill='none'>
            <path d='M-2 -1 L-7 -4 L-9 -1'/>
            <path d='M-2 0 L-8 0 L-10 2'/>
            <path d='M-2 1 L-7 4 L-9 6'/>
            <path d='M2 -1 L7 -4 L9 -1'/>
            <path d='M2 0 L8 0 L10 2'/>
            <path d='M2 1 L7 4 L9 6'/>
            <path d='M0 -3 L0 -7'/>
          </g>
        </g>
      </g>`
    ),

  // ─── Leaves — maple leaves + acorn + small leaves ───
  leaves: (a) =>
    tile(
      140,
      140,
      `
      <g fill='${a}'>
        <!-- Maple leaf -->
        <g transform='translate(40 44)' fill-opacity='0.13'>
          <path d='M0 -22
                   L4 -12 L12 -14 L8 -6 L18 -4 L10 2 L14 10 L6 8 L4 18 L0 12
                   L-4 18 L-6 8 L-14 10 L-10 2 L-18 -4 L-8 -6 L-12 -14 L-4 -12 Z'/>
          <line x1='0' y1='-22' x2='0' y2='22' stroke='${a}' stroke-opacity='0.16' stroke-width='0.8'/>
        </g>

        <!-- Acorn -->
        <g transform='translate(102 96)'>
          <ellipse cx='0' cy='4' rx='7' ry='9' fill-opacity='0.13'/>
          <path d='M-8 -2 Q0 -8 8 -2 Q9 0 8 2 L-8 2 Q-9 0 -8 -2 Z' fill-opacity='0.18'/>
          <line x1='0' y1='-9' x2='0' y2='-13' stroke='${a}' stroke-opacity='0.16' stroke-width='1.2' stroke-linecap='round'/>
        </g>

        <!-- Small leaf -->
        <g transform='translate(96 30) rotate(40)' fill-opacity='0.12'>
          <path d='M0 -14 Q9 -2 9 6 Q9 14 0 18 Q-9 14 -9 6 Q-9 -2 0 -14 Z'/>
          <line x1='0' y1='-13' x2='0' y2='17' stroke='${a}' stroke-opacity='0.16' stroke-width='0.8'/>
        </g>

        <!-- Mini leaf -->
        <g transform='translate(20 110) rotate(-30) scale(0.7)' fill-opacity='0.12'>
          <path d='M0 -14 Q9 -2 9 6 Q9 14 0 18 Q-9 14 -9 6 Q-9 -2 0 -14 Z'/>
        </g>

        <!-- Tiny dots -->
        <circle cx='70' cy='14' r='1.2' fill-opacity='0.13'/>
        <circle cx='128' cy='52' r='1.2' fill-opacity='0.13'/>
        <circle cx='14' cy='72' r='1.2' fill-opacity='0.13'/>
        <circle cx='62' cy='124' r='1.2' fill-opacity='0.13'/>
      </g>`
    ),

  // ─── Snowflakes — fractal 6-arm flakes at multiple sizes + dots ───
  snowflakes: (a) =>
    tile(
      140,
      140,
      `
      <g stroke='${a}' fill='none' stroke-linecap='round'>
        <!-- Big snowflake -->
        <g transform='translate(40 44)' stroke-opacity='0.16' stroke-width='1.4'>
          <line x1='-22' y1='0' x2='22' y2='0'/>
          <line x1='-11' y1='-19' x2='11' y2='19'/>
          <line x1='11' y1='-19' x2='-11' y2='19'/>
          <!-- Arrow tips on each arm -->
          <line x1='-22' y1='0' x2='-18' y2='-3'/>
          <line x1='-22' y1='0' x2='-18' y2='3'/>
          <line x1='22' y1='0' x2='18' y2='-3'/>
          <line x1='22' y1='0' x2='18' y2='3'/>
          <line x1='-11' y1='-19' x2='-13' y2='-15'/>
          <line x1='-11' y1='-19' x2='-7' y2='-19'/>
          <line x1='11' y1='-19' x2='7' y2='-19'/>
          <line x1='11' y1='-19' x2='13' y2='-15'/>
          <line x1='-11' y1='19' x2='-13' y2='15'/>
          <line x1='-11' y1='19' x2='-7' y2='19'/>
          <line x1='11' y1='19' x2='7' y2='19'/>
          <line x1='11' y1='19' x2='13' y2='15'/>
          <!-- Mid branches -->
          <line x1='-12' y1='0' x2='-15' y2='-3'/>
          <line x1='-12' y1='0' x2='-15' y2='3'/>
          <line x1='12' y1='0' x2='15' y2='-3'/>
          <line x1='12' y1='0' x2='15' y2='3'/>
          <line x1='-6' y1='-10' x2='-9' y2='-10'/>
          <line x1='-6' y1='-10' x2='-6' y2='-13'/>
          <line x1='6' y1='-10' x2='9' y2='-10'/>
          <line x1='6' y1='-10' x2='6' y2='-13'/>
          <line x1='-6' y1='10' x2='-9' y2='10'/>
          <line x1='-6' y1='10' x2='-6' y2='13'/>
          <line x1='6' y1='10' x2='9' y2='10'/>
          <line x1='6' y1='10' x2='6' y2='13'/>
        </g>

        <!-- Medium snowflake -->
        <g transform='translate(102 96)' stroke-opacity='0.14' stroke-width='1.2'>
          <line x1='-14' y1='0' x2='14' y2='0'/>
          <line x1='-7' y1='-12' x2='7' y2='12'/>
          <line x1='7' y1='-12' x2='-7' y2='12'/>
          <line x1='-10' y1='0' x2='-12' y2='-2'/>
          <line x1='-10' y1='0' x2='-12' y2='2'/>
          <line x1='10' y1='0' x2='12' y2='-2'/>
          <line x1='10' y1='0' x2='12' y2='2'/>
        </g>

        <!-- Small snowflake -->
        <g transform='translate(108 28) rotate(15)' stroke-opacity='0.13' stroke-width='1'>
          <line x1='-9' y1='0' x2='9' y2='0'/>
          <line x1='-4.5' y1='-8' x2='4.5' y2='8'/>
          <line x1='4.5' y1='-8' x2='-4.5' y2='8'/>
        </g>

        <!-- Tiny snowflake -->
        <g transform='translate(20 104) rotate(-20)' stroke-opacity='0.12' stroke-width='0.9'>
          <line x1='-7' y1='0' x2='7' y2='0'/>
          <line x1='-3.5' y1='-6' x2='3.5' y2='6'/>
          <line x1='3.5' y1='-6' x2='-3.5' y2='6'/>
        </g>
      </g>

      <!-- Tiny snow dots -->
      <g fill='${a}'>
        <circle cx='66' cy='12' r='1.2' fill-opacity='0.14'/>
        <circle cx='130' cy='58' r='1' fill-opacity='0.13'/>
        <circle cx='12' cy='62' r='1' fill-opacity='0.13'/>
        <circle cx='66' cy='126' r='1.2' fill-opacity='0.14'/>
        <circle cx='52' cy='84' r='0.8' fill-opacity='0.12'/>
      </g>`
    ),

  // ─── Graduation caps — caps + diploma scrolls + stars ───
  "graduation-caps": (a) =>
    tile(
      140,
      140,
      `
      <g fill='${a}'>
        <!-- Big cap -->
        <g transform='translate(38 44)'>
          <path d='M-18 -2 L0 -10 L18 -2 L0 6 Z' fill-opacity='0.14'/>
          <rect x='-9' y='4' width='18' height='6' rx='1' fill-opacity='0.13'/>
          <line x1='14' y1='1' x2='18' y2='14' stroke='${a}' stroke-opacity='0.16' stroke-width='1.2' stroke-linecap='round'/>
          <circle cx='18' cy='15' r='1.6' fill-opacity='0.18'/>
          <line x1='-14' y1='-4' x2='-9' y2='-2' stroke='${a}' stroke-opacity='0.10' stroke-width='0.8'/>
        </g>

        <!-- Diploma scroll -->
        <g transform='translate(102 90) rotate(-15)'>
          <rect x='-12' y='-3' width='24' height='6' rx='2' fill-opacity='0.13'/>
          <line x1='-8' y1='-1' x2='8' y2='-1' stroke='${a}' stroke-opacity='0.18' stroke-width='0.7'/>
          <line x1='-8' y1='1' x2='8' y2='1' stroke='${a}' stroke-opacity='0.18' stroke-width='0.7'/>
          <circle cx='-12' cy='0' r='1.6' fill-opacity='0.18'/>
          <circle cx='12' cy='0' r='1.6' fill-opacity='0.18'/>
          <path d='M-15 -3 Q-18 0 -15 3' fill='none' stroke='${a}' stroke-opacity='0.16' stroke-width='0.8'/>
          <path d='M15 -3 Q18 0 15 3' fill='none' stroke='${a}' stroke-opacity='0.16' stroke-width='0.8'/>
        </g>

        <!-- Small cap -->
        <g transform='translate(102 28) scale(0.6)'>
          <path d='M-18 -2 L0 -10 L18 -2 L0 6 Z' fill-opacity='0.12'/>
          <rect x='-9' y='4' width='18' height='6' rx='1' fill-opacity='0.11'/>
          <line x1='14' y1='1' x2='18' y2='14' stroke='${a}' stroke-opacity='0.14' stroke-width='1.4' stroke-linecap='round'/>
        </g>

        <!-- 4-point sparkles -->
        <g fill-opacity='0.14'>
          <path d='M66 14 L68 18 L66 22 L64 18 Z M62 18 L66 16 L70 18 L66 20 Z'/>
          <path d='M22 102 L24 105 L22 108 L20 105 Z M18 105 L22 103 L26 105 L22 107 Z'/>
          <path d='M126 56 L128 59 L126 62 L124 59 Z M122 59 L126 57 L130 59 L126 61 Z'/>
        </g>

        <!-- Tiny stars -->
        <g transform='translate(70 78) scale(0.4)'>
          <path d='M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3 Z' fill-opacity='0.12'/>
        </g>
      </g>`
    ),

  // ─── Rings — interlocked rings + floral flourishes ───
  rings: (a) =>
    tile(
      140,
      120,
      `
      <g>
        <!-- Big interlocked rings -->
        <g transform='translate(40 38)' fill='none'>
          <circle cx='-8' cy='0' r='12' stroke='${a}' stroke-opacity='0.16' stroke-width='1.6'/>
          <circle cx='8' cy='0' r='12' stroke='${a}' stroke-opacity='0.16' stroke-width='1.6'/>
          <!-- Tiny shine highlights -->
          <path d='M-14 -7 Q-10 -10 -6 -8' stroke='${a}' stroke-opacity='0.10' stroke-width='0.8'/>
          <path d='M14 -7 Q10 -10 6 -8' stroke='${a}' stroke-opacity='0.10' stroke-width='0.8'/>
        </g>

        <!-- Smaller interlocked rings -->
        <g transform='translate(102 88) scale(0.7)' fill='none'>
          <circle cx='-8' cy='0' r='12' stroke='${a}' stroke-opacity='0.14' stroke-width='1.6'/>
          <circle cx='8' cy='0' r='12' stroke='${a}' stroke-opacity='0.14' stroke-width='1.6'/>
        </g>

        <!-- Floral flourish (5-petal) -->
        <g transform='translate(108 28)' fill='${a}' fill-opacity='0.12'>
          <ellipse cx='0' cy='-6' rx='2.2' ry='4'/>
          <ellipse cx='5.7' cy='-1.8' rx='2.2' ry='4' transform='rotate(72 5.7 -1.8)'/>
          <ellipse cx='3.5' cy='5' rx='2.2' ry='4' transform='rotate(144 3.5 5)'/>
          <ellipse cx='-3.5' cy='5' rx='2.2' ry='4' transform='rotate(216 -3.5 5)'/>
          <ellipse cx='-5.7' cy='-1.8' rx='2.2' ry='4' transform='rotate(288 -5.7 -1.8)'/>
          <circle cx='0' cy='0' r='1.6' fill-opacity='0.20'/>
        </g>

        <!-- Mini floral -->
        <g transform='translate(20 88) scale(0.7)' fill='${a}' fill-opacity='0.12'>
          <ellipse cx='0' cy='-6' rx='2.2' ry='4'/>
          <ellipse cx='5.7' cy='-1.8' rx='2.2' ry='4' transform='rotate(72 5.7 -1.8)'/>
          <ellipse cx='3.5' cy='5' rx='2.2' ry='4' transform='rotate(144 3.5 5)'/>
          <ellipse cx='-3.5' cy='5' rx='2.2' ry='4' transform='rotate(216 -3.5 5)'/>
          <ellipse cx='-5.7' cy='-1.8' rx='2.2' ry='4' transform='rotate(288 -5.7 -1.8)'/>
        </g>

        <!-- Tiny dots -->
        <g fill='${a}'>
          <circle cx='70' cy='10' r='1' fill-opacity='0.12'/>
          <circle cx='128' cy='62' r='1' fill-opacity='0.12'/>
          <circle cx='12' cy='62' r='1' fill-opacity='0.12'/>
          <circle cx='66' cy='112' r='1' fill-opacity='0.12'/>
        </g>
      </g>`
    ),

  // ─── Dots (Baby Shower) — varied dot sizes + tiny moons + stars ───
  dots: (a) =>
    tile(
      96,
      96,
      `
      <g fill='${a}'>
        <!-- Varied dot grid -->
        <circle cx='14' cy='14' r='2.6' fill-opacity='0.14'/>
        <circle cx='48' cy='14' r='1.6' fill-opacity='0.12'/>
        <circle cx='82' cy='14' r='2.6' fill-opacity='0.14'/>
        <circle cx='14' cy='48' r='1.6' fill-opacity='0.12'/>
        <circle cx='48' cy='48' r='3' fill-opacity='0.16'/>
        <circle cx='82' cy='48' r='1.6' fill-opacity='0.12'/>
        <circle cx='14' cy='82' r='2.6' fill-opacity='0.14'/>
        <circle cx='48' cy='82' r='1.6' fill-opacity='0.12'/>
        <circle cx='82' cy='82' r='2.6' fill-opacity='0.14'/>

        <!-- Tiny stars -->
        <g transform='translate(31 30) scale(0.35)' fill-opacity='0.14'>
          <path d='M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3 Z'/>
        </g>
        <g transform='translate(65 66) scale(0.35)' fill-opacity='0.14'>
          <path d='M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3 Z'/>
        </g>

        <!-- Tiny crescent moon -->
        <g transform='translate(66 30)' fill-opacity='0.14'>
          <path d='M0 -4 A4 4 0 1 0 0 4 A3 3 0 1 1 0 -4 Z'/>
        </g>
        <g transform='translate(30 66) scale(0.7)' fill-opacity='0.13'>
          <path d='M0 -4 A4 4 0 1 0 0 4 A3 3 0 1 1 0 -4 Z'/>
        </g>
      </g>`
    ),

  // ─── Balloons — clustered balloons + curly strings + confetti ───
  balloons: (a) =>
    tile(
      140,
      140,
      `
      <g>
        <!-- Big balloon cluster -->
        <g transform='translate(38 42)'>
          <ellipse cx='-10' cy='-8' rx='7' ry='9' fill='${a}' fill-opacity='0.14'/>
          <ellipse cx='10' cy='-8' rx='7' ry='9' fill='${a}' fill-opacity='0.14'/>
          <ellipse cx='0' cy='-2' rx='7' ry='9' fill='${a}' fill-opacity='0.14'/>
          <!-- Knots -->
          <path d='M-10 1 l-1 2 l2 0 z' fill='${a}' fill-opacity='0.18'/>
          <path d='M10 1 l-1 2 l2 0 z' fill='${a}' fill-opacity='0.18'/>
          <path d='M0 7 l-1 2 l2 0 z' fill='${a}' fill-opacity='0.18'/>
          <!-- Curly strings -->
          <path d='M-10 3 Q-14 8 -10 12 Q-6 16 -10 22' fill='none' stroke='${a}' stroke-opacity='0.16' stroke-width='1' stroke-linecap='round'/>
          <path d='M10 3 Q14 8 10 12 Q6 16 10 22' fill='none' stroke='${a}' stroke-opacity='0.16' stroke-width='1' stroke-linecap='round'/>
          <path d='M0 9 Q-3 14 0 18 Q3 22 0 28' fill='none' stroke='${a}' stroke-opacity='0.16' stroke-width='1' stroke-linecap='round'/>
        </g>

        <!-- Pair of balloons -->
        <g transform='translate(102 90)'>
          <ellipse cx='-6' cy='-6' rx='6' ry='8' fill='${a}' fill-opacity='0.13'/>
          <ellipse cx='6' cy='-4' rx='6' ry='8' fill='${a}' fill-opacity='0.13'/>
          <path d='M-6 2 Q-9 8 -6 14 Q-3 18 -6 24' fill='none' stroke='${a}' stroke-opacity='0.14' stroke-width='1' stroke-linecap='round'/>
          <path d='M6 4 Q9 10 6 16 Q3 20 6 26' fill='none' stroke='${a}' stroke-opacity='0.14' stroke-width='1' stroke-linecap='round'/>
        </g>

        <!-- Single balloon -->
        <g transform='translate(108 26) scale(0.7)'>
          <ellipse cx='0' cy='-6' rx='6' ry='8' fill='${a}' fill-opacity='0.12'/>
          <path d='M0 2 Q-3 8 0 14 Q3 18 0 24' fill='none' stroke='${a}' stroke-opacity='0.14' stroke-width='1.2' stroke-linecap='round'/>
        </g>

        <!-- Confetti bits scattered between -->
        <g fill='${a}'>
          <rect x='66' y='14' width='6' height='2' rx='1' transform='rotate(30 69 15)' fill-opacity='0.13'/>
          <rect x='14' y='90' width='5' height='2' rx='1' transform='rotate(-25 16 91)' fill-opacity='0.12'/>
          <rect x='126' y='62' width='6' height='2' rx='1' transform='rotate(60 129 63)' fill-opacity='0.13'/>
          <circle cx='62' cy='118' r='1.2' fill-opacity='0.13'/>
          <circle cx='80' cy='66' r='1' fill-opacity='0.11'/>
          <circle cx='22' cy='124' r='1' fill-opacity='0.11'/>
        </g>
      </g>`
    ),
};

/**
 * Build a CSS `background-image` value for the given pattern, tinted with `accent`.
 * Returns null when no pattern is provided so callers can fall back to a plain bg.
 */
export function getPatternBg(pattern: ThemePattern | null | undefined, accent: string): string | null {
  if (!pattern) return null;
  return builders[pattern](accent);
}

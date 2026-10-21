// The reference art is 3:4. The extra margin keeps the head dome and the
// rounded feet away from the frame edge.
export const NAILONG_VIEWBOX = { x: -8, y: -10, width: 120, height: 160 }
export const NAILONG_VIEWBOX_ATTR = `${NAILONG_VIEWBOX.x} ${NAILONG_VIEWBOX.y} ${NAILONG_VIEWBOX.width} ${NAILONG_VIEWBOX.height}`

// The main board is 280 x 280. The 3:4 Nailong frame is centred horizontally
// at x = 35 with a width of 210; the viewBox then maps 1.75 canvas units per
// art unit. The SVG uses this transform so the outline and the eye guides line
// up with the hit areas below.
export const NAILONG_BOARD_FRAME = { x: 35, y: 0, width: 210, height: 280 }
export const NAILONG_BOARD_SCALE = 1.75
export const NAILONG_BOARD_TRANSFORM = 'translate(49 17.5) scale(1.75)'

// Order is the order the pen draws them. The two outer halves form one closed
// silhouette: top centre -> crotch -> top centre. The belly, arms and face stay
// as clean line art; there are deliberately no fills or foreground fills, so
// the board never covers the user's ink.
export const NAILONG_OUTLINE = [
  {
    id: 'outer-right',
    d: 'M 54 -3 C 62 -3 69 0 72 6 C 75 13 78 22 82 29 C 90 37 96 46 97 58 C 98 67 99 73 99 82 C 99 92 96 99 92 103 C 89 106 88 111 89 117 C 91 128 94 138 95 144 C 95 147 92 148 89 147 C 86 146 84 145 82 144 C 76 138 70 131 66 124 C 63 119 61 116 58 116',
  },
  {
    id: 'outer-left',
    d: 'M 58 116 C 55 116 53 120 51 124 C 47 132 42 140 39 144 C 37 147 34 148 32 146 C 30 144 30 140 31 134 C 32 128 30 123 27 118 C 24 113 25 108 26 103 C 27 100 24 99 21 98 C 17 96 16 90 16 82 C 16 72 12 69 8 66 C 5 63 4 59 6 55 C 8 50 14 45 20 41 C 27 36 34 34 39 31 C 42 29 42 24 41 18 C 40 12 41 7 43 4 C 46 0 50 -3 54 -3',
  },
  {
    id: 'belly',
    d: 'M 40 38 C 28 44 21 56 20 72 C 19 88 25 102 38 109 C 52 114 70 111 79 102 C 87 94 89 78 86 64 C 83 50 74 41 62 38 C 54 36 46 36 40 38 Z',
  },
  {
    id: 'arm-left',
    d: 'M 20 41 C 25 43 30 45 34 48 C 29 53 26 60 27 68 C 28 74 31 80 31 88 C 31 95 29 100 26 103 C 30 106 35 106 38 102',
  },
  {
    id: 'arm-right',
    d: 'M 82 29 C 79 38 80 45 82 53 C 85 62 86 72 84 80 C 82 86 82 92 84 97 C 84 104 86 111 89 117 C 85 120 81 119 79 115',
  },
  {
    id: 'face',
    d: 'M 46 13 C 49 12 52 12 55 14 M 47 16 C 50 17 53 17 56 15',
  },
]

// Guides are drawn in art coordinates. The hit ellipses are converted to the
// 280 x 280 board space used by useDrawing, and are intentionally forgiving so
// a finger tap still counts.
export const NAILONG_EYES = [
  { id: 'left', cx: 45, cy: 8, rx: 3.6, ry: 4 },
  { id: 'right', cx: 62.5, cy: 8, rx: 3.6, ry: 4 },
]

const BOARD_EYE_SCALE = NAILONG_BOARD_SCALE
const BOARD_EYE_X = NAILONG_BOARD_FRAME.x - NAILONG_VIEWBOX.x * BOARD_EYE_SCALE
const BOARD_EYE_Y = NAILONG_BOARD_FRAME.y - NAILONG_VIEWBOX.y * BOARD_EYE_SCALE

export const NAILONG_EYE_HITS = NAILONG_EYES.map(eye => ({
  id: eye.id,
  cx: BOARD_EYE_X + eye.cx * BOARD_EYE_SCALE,
  cy: BOARD_EYE_Y + eye.cy * BOARD_EYE_SCALE,
  hitRx: 7 * BOARD_EYE_SCALE,
  hitRy: 6.5 * BOARD_EYE_SCALE,
}))

export const NAILONG_MEDIA = {
  still: '/static/nailong/nailong-still.webp',
  candidates: [
    { kind: 'video', src: '/static/nailong/nailong-alive.webm', type: 'video/webm' },
    { kind: 'video', src: '/static/nailong/nailong-alive.mp4', type: 'video/mp4' },
    { kind: 'image', src: '/static/nailong/nailong-alive.webp', type: 'image/webp' },
    { kind: 'image', src: '/static/nailong/nailong-alive.gif', type: 'image/gif' },
  ],
}

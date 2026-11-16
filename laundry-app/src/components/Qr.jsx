// Placeholder QR drawn from a deterministic pattern. Replace with a real QR
// generator (e.g. the `qrcode.react` package) when you wire up a backend.
const N = 25

function cells(seed) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd() > 0.52))
  const finder = (r, c) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const edge = y === 0 || y === 6 || x === 0 || x === 6
        const core = y >= 2 && y <= 4 && x >= 2 && x <= 4
        grid[r + y][c + x] = edge || core
      }
    // quiet zone around each finder pattern
    for (let i = 0; i < 8; i++) {
      for (const [y, x] of [[r + 7, c + i], [r + i, c + 7], [r - 1, c + i], [r + i, c - 1]]) {
        if (y >= 0 && x >= 0 && y < N && x < N) grid[y][x] = false
      }
    }
  }
  finder(0, 0)
  finder(0, N - 7)
  finder(N - 7, 0)
  return grid
}

export default function Qr({ size = 176, seed = 1108 }) {
  const grid = cells(seed)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${N} ${N}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect width={N} height={N} fill="#fff" />
      {grid.flatMap((row, y) =>
        row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#131b2e" /> : null)),
      )}
    </svg>
  )
}

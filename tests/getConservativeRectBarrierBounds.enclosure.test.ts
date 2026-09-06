import { expect, test } from "bun:test"
import { getConservativeRectBarrierBounds as tight } from "../lib/getConservativeRectBarrierBounds"

test("tight bounds enclose inverse-transformed corners and reduce elongated barrier cells", (): void => {
  let tightened = 0
  for (const [width, height] of [
    [0.1, 8],
    [8, 0.1],
    [2, 5],
    [4, 4],
  ])
    for (const degrees of [0, 1e-9, 1, 30, 45, 89.999999999, 90, 135, 179, 270])
      for (const center of [
        { x: 0, y: 0 },
        { x: 5000, y: -4000 },
      ]) {
        const rotation = (degrees * Math.PI) / 180,
          c = Math.cos(rotation),
          s = Math.sin(rotation),
          extent = Math.hypot(width!, height!) / 2
        const old = {
          minX: center.x - extent,
          maxX: center.x + extent,
          minY: center.y - extent,
          maxY: center.y + extent,
        }
        const next = tight(
          center,
          center,
          { width: width!, height: height!, rotation },
          c,
          s,
          old,
        )
        if (next === old) continue
        tightened++
        expect(next.minX).toBeGreaterThanOrEqual(old.minX)
        expect(next.maxX).toBeLessThanOrEqual(old.maxX)
        expect(next.minY).toBeGreaterThanOrEqual(old.minY)
        expect(next.maxY).toBeLessThanOrEqual(old.maxY)
        for (const x of [-width! / 2, width! / 2])
          for (const y of [-height! / 2, height! / 2]) {
            const px = center.x + (c * x - s * y) / (c * c + s * s),
              py = center.y + (s * x + c * y) / (c * c + s * s)
            expect(px).toBeGreaterThan(next.minX)
            expect(px).toBeLessThan(next.maxX)
            expect(py).toBeGreaterThan(next.minY)
            expect(py).toBeLessThan(next.maxY)
          }
      }
  expect(tightened).toBeGreaterThan(70)
  const old = { minX: -4.001, maxX: 4.001, minY: -4.001, maxY: 4.001 }
  const next = tight(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { width: 0.1, height: 8, rotation: 0 },
    1,
    0,
    old,
  )
  const cells = (b: typeof old): number =>
    (Math.floor(b.maxX) - Math.floor(b.minX) + 1) *
    (Math.floor(b.maxY) - Math.floor(b.minY) + 1)
  expect(cells(next)).toBeLessThan(cells(old) / 3)
})

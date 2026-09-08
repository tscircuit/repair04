import { expect, test } from "bun:test"
import { getConservativeRectBarrierBounds as tight } from "../lib/getConservativeRectBarrierBounds"

test("unsafe, large, degenerate and equal-boundary inputs retain the original enclosure", (): void => {
  const a = { x: 0, y: 0 },
    old = { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  for (const [width, height, rotation] of [
    [NaN, 1, 0],
    [1, Infinity, 0],
    [-1, 1, 0],
    [1e100, 1, 0],
    [1, 1, Infinity],
    [0, 0, 0],
  ])
    expect(
      tight(
        a,
        a,
        { width: width!, height: height!, rotation: rotation! },
        Math.cos(rotation!),
        Math.sin(rotation!),
        old,
      ),
    ).toBe(old)
  expect(
    tight(
      { x: 1e20, y: 0 },
      { x: 1e20, y: 0 },
      { width: 1, height: 1, rotation: 0 },
      1,
      0,
      old,
    ),
  ).toBe(old)
  expect(
    tight(a, { x: 1, y: 0 }, { width: 1, height: 1, rotation: 0 }, 1, 0, old),
  ).toBe(old)
  expect(tight(a, a, { width: 1, height: 1, rotation: 0 }, 2, 0, old)).toBe(old)
  const square = {
    minX: -Math.SQRT2,
    maxX: Math.SQRT2,
    minY: -Math.SQRT2,
    maxY: Math.SQRT2,
  }
  expect(
    tight(
      a,
      a,
      { width: 2, height: 2, rotation: Math.PI / 4 },
      Math.cos(Math.PI / 4),
      Math.sin(Math.PI / 4),
      square,
    ),
  ).toBe(square)
})

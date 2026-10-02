import { expect, test } from "bun:test"
import { getVectorLength } from "../lib/getVectorLength"

test("vector length is repeatable and avoids overflow and underflow", (): void => {
  expect(getVectorLength(-0.5323140861005253, 0.5322405018134291)).toBe(
    0.7527537698554875,
  )
  expect(getVectorLength(0, 0)).toBe(0)
  expect(getVectorLength(-0, -0)).toBe(0)
  expect(getVectorLength(3, -4)).toBe(5)
  expect(getVectorLength(-4, 3)).toBe(5)
  expect(getVectorLength(0, -7)).toBe(7)
  expect(getVectorLength(3 * 2 ** 700, 4 * 2 ** 700)).toBe(5 * 2 ** 700)
  expect(getVectorLength(3 * 2 ** -700, 4 * 2 ** -700)).toBe(5 * 2 ** -700)
  expect(getVectorLength(Number.MIN_VALUE, 0)).toBe(Number.MIN_VALUE)
  expect(getVectorLength(Number.POSITIVE_INFINITY, 1)).toBe(
    Number.POSITIVE_INFINITY,
  )
  expect(getVectorLength(Number.NaN, 1)).toBeNaN()
})

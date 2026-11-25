import { expect, test } from "bun:test"
import { getClearancePathDistance } from "../lib/getClearancePathDistance"

test("clearance search keeps the last bit of diagonal path costs", (): void => {
  const delta = 0.9207147037842702
  expect(getClearancePathDistance(-delta, delta)).toBe(1.3020872211680419)
  expect(getClearancePathDistance(3, 4)).toBe(5)
  expect(getClearancePathDistance(0, 0)).toBe(0)
  expect(getClearancePathDistance(3 * 2 ** 700, 4 * 2 ** 700)).toBe(
    5 * 2 ** 700,
  )
  expect(getClearancePathDistance(3 * 2 ** -700, 4 * 2 ** -700)).toBe(
    5 * 2 ** -700,
  )
})

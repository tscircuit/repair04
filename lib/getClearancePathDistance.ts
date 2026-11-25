import { getVectorLength } from "./getVectorLength"

/** Weighted A* can choose a different corridor if a cost changes by one ulp.
 * Correct the initial estimate using Borges' "An Improved Algorithm for hypot(a,b)". */
export function getClearancePathDistance(dx: number, dy: number): number {
  const major = Math.max(Math.abs(dx), Math.abs(dy))
  const minor = Math.min(Math.abs(dx), Math.abs(dy))
  if (minor === 0 || minor <= major * Number.EPSILON) return major
  // Use the scaled calculation if squaring could overflow or become subnormal.
  if (major > Math.sqrt(Number.MAX_VALUE / 2) || major < 2 ** -511)
    return getVectorLength(dx, dy)

  const length = Math.sqrt(major * major + minor * minor)
  // Evaluate length² - major² - minor² without subtracting nearly equal squares.
  let residual: number
  if (length <= 2 * minor) {
    const delta = length - minor
    residual =
      major * (2 * delta - major) + (delta - 2 * (major - minor)) * delta
  } else {
    const delta = length - major
    residual =
      2 * delta * (major - 2 * minor) +
      ((4 * delta - minor) * minor + delta * delta)
  }
  return length - residual / (2 * length)
}

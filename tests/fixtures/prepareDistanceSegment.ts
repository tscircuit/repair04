import type { PreparedSegment } from "../../lib/preparedDistanceGeometry"

export function prepareDistanceSegment({
  a,
  b,
}: Pick<PreparedSegment, "a" | "b">): PreparedSegment {
  const deltaX = b.x - a.x
  const deltaY = b.y - a.y
  return {
    a,
    b,
    deltaX,
    deltaY,
    lengthSquared: deltaX ** 2 + deltaY ** 2,
  }
}

import type { SimpleRouteJson } from "high-density-repair03/lib"

/** Same-net copper may overlap, but distinct drilled holes still need spacing. */
export const createRetainedDrillClearanceCheck = ({
  srj,
  holeDiameter,
  clearance,
  owner,
  net,
}: {
  srj: SimpleRouteJson
  holeDiameter: number
  clearance: number
  owner: string
  net: (name: string) => string
}): ((point: { x: number; y: number }) => boolean) => {
  const drills = srj.obstacles.flatMap((obstacle) => {
    const diameter = (obstacle as typeof obstacle & { holeDiameter?: number })
      .holeDiameter
    if (diameter === undefined || obstacle.isNonPlatedHole) return []
    if (
      !Number.isFinite(diameter) ||
      diameter <= 0 ||
      diameter > Math.min(obstacle.width, obstacle.height)
    ) {
      throw new Error("repair04: invalid retained drill diameter")
    }
    return [
      {
        point: obstacle.center,
        sameNet: obstacle.connectedTo.some((name) => net(name) === owner),
        minimumDistance: holeDiameter / 2 + diameter / 2 + clearance,
      },
    ]
  })
  return (point): boolean =>
    drills.every((drill) => {
      const distance = Math.hypot(
        point.x - drill.point.x,
        point.y - drill.point.y,
      )
      return (
        (drill.sameNet && distance <= 1e-8) ||
        distance + 1e-8 >= drill.minimumDistance
      )
    })
}

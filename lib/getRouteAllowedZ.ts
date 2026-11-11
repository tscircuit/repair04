import type { RepairRoute } from "./repairRegionTypes"

/** Wire-layer permissions never reduce the physical span of a through via. */
export function getRouteAllowedZ(
  route: Pick<RepairRoute, "connectionName" | "allowedZ" | "isThroughObstacle">,
  layerCount: number,
): ReadonlySet<number> | undefined {
  if (route.isThroughObstacle === true || route.allowedZ === undefined)
    return undefined
  if (
    route.allowedZ.length === 0 ||
    route.allowedZ.some((z) => !Number.isInteger(z) || z < 0 || z >= layerCount)
  ) {
    throw new Error(
      `repair04: route "${route.connectionName}" has invalid allowed wire layers`,
    )
  }
  return new Set(route.allowedZ)
}

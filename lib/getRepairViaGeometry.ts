import type { HighDensityRoute } from "high-density-repair03/lib"

export type RepairViaGeometry = {
  x: number
  y: number
  minZ: number
  maxZ: number
  diameter: number
  identity: string
  pointIndices: number[]
  layerSequence: number[]
}

export const getRepairViaGeometry = (
  route: HighDensityRoute,
  layerCount: number,
): RepairViaGeometry[] => {
  const vias: RepairViaGeometry[] = []
  for (let i = 1; i < route.route.length; i++) {
    const a = route.route[i - 1]!
    const b = route.route[i]!
    if (a.z === b.z) continue
    if (
      a.x !== b.x ||
      a.y !== b.y ||
      ![a.x, a.y, a.z, b.z, route.viaDiameter].every(Number.isFinite) ||
      !Number.isInteger(a.z) ||
      !Number.isInteger(b.z) ||
      Math.min(a.z, b.z) < 0 ||
      Math.max(a.z, b.z) >= layerCount ||
      route.viaDiameter <= 0
    ) {
      throw new Error("repair04 new-via guard requires valid colocated vias")
    }
    const firstPointIndex = i - 1
    const layerSequence = [a.z, b.z]
    let minZ = Math.min(a.z, b.z)
    let maxZ = Math.max(a.z, b.z)
    // Redundant wire vertices or explicit intermediate layers do not create a
    // different physical via. Its identity is the entire coincident span.
    while (i + 1 < route.route.length) {
      const next = route.route[i + 1]!
      if (next.x !== b.x || next.y !== b.y) break
      if (!Number.isInteger(next.z) || next.z < 0 || next.z >= layerCount) {
        throw new Error("repair04 new-via guard found an invalid layer span")
      }
      if (next.z !== layerSequence.at(-1)) layerSequence.push(next.z)
      minZ = Math.min(minZ, next.z)
      maxZ = Math.max(maxZ, next.z)
      i++
    }
    vias.push({
      pointIndices: Array.from(
        { length: i - firstPointIndex + 1 },
        (_, offset): number => firstPointIndex + offset,
      ),
      layerSequence,
      x: b.x,
      y: b.y,
      minZ,
      maxZ,
      diameter: route.viaDiameter,
      identity: JSON.stringify([b.x, b.y, minZ, maxZ, route.viaDiameter]),
    })
  }
  return vias
}

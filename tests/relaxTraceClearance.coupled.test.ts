import { expect, test } from "bun:test"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import { AutoroutingDrcEngine, type HighDensityRoute } from "high-density-repair03/lib"
import { convertRepairRoutesToTraces, getNewViaPadViolations, relaxTraceClearance } from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("coupled gap projection retains anchors and opens real trace and via clearances", (): void => {
  const routes: HighDensityRoute[] = [-0.17, 0, 0.17].map((y, index) => ({
    connectionName: `signal-${index}`,
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [{ x: -3, y: y * 2, z: 0 }, { x: -1, y, z: 0 }, { x: 1, y, z: 0 }, { x: 3, y: y * 2, z: 0 }],
  }))
  routes.push({
    connectionName: "via-signal", traceThickness: 0.1, viaDiameter: 0.3,
    route: [{ x: -2, y: 1, z: 0 }, { x: 0, y: 0.43, z: 0 }, { x: 0, y: 0.43, z: 1 }, { x: 2, y: 1, z: 1 }],
    vias: [{ x: 0, y: 0.43 }],
  })
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const input: RepairRegionInput = {
    srj: { layerCount: 2, minTraceWidth: 0.1, bounds, obstacles: [],
      connections: routes.map((route) => ({ name: route.connectionName, pointsToConnect: [] })) },
    routes, bounds, boundaryMargin: 0.5,
    lockedPointIndices: routes.map(() => [true, false, false, true]),
  }
  const before = structuredClone(input)
  const output = relaxTraceClearance({ ...input, allowViaMovement: true })
  expect(input).toEqual(before)
  expect(new AutoroutingDrcEngine(input.srj).evaluate(convertRepairRoutesToTraces(routes, 2)).errors.length).toBeGreaterThan(0)
  expect(new AutoroutingDrcEngine(input.srj).evaluate(convertRepairRoutesToTraces(output, 2)).errors).toEqual([])
  expect(getNewViaPadViolations({ srj: input.srj, previousRoutes: routes, routes: output })).toEqual([])
  for (let i = 0; i < output.length; i++) {
    expect(output[i]!.route[0]).toEqual(routes[i]!.route[0])
    expect(output[i]!.route.at(-1)).toEqual(routes[i]!.route.at(-1))
    expect(output[i]!.route.map((p) => p.z)).toEqual(routes[i]!.route.map((p) => p.z))
    expect(output[i]!.traceThickness).toBe(routes[i]!.traceThickness)
    expect(output[i]!.viaDiameter).toBe(routes[i]!.viaDiameter)
    for (let j = i + 1; j < output.length; j++) {
      for (let a = 1; a < output[i]!.route.length; a++) {
        for (let b = 1; b < output[j]!.route.length; b++) {
          const p = output[i]!.route[a - 1]!, q = output[i]!.route[a]!
          const r = output[j]!.route[b - 1]!, s = output[j]!.route[b]!
          if (Math.max(p.z, q.z) < Math.min(r.z, s.z) || Math.max(r.z, s.z) < Math.min(p.z, q.z)) continue
          const radius = (p.z === q.z ? 0.05 : 0.15) + (r.z === s.z ? 0.05 : 0.15)
          expect(segmentToSegmentMinDistance(p, q, r, s) - radius).toBeGreaterThanOrEqual(0.1099)
        }
      }
    }
  }
})

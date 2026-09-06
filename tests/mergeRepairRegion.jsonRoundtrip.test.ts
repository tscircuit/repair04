import { expect, test } from "bun:test"
import { Repair04Solver, extractRepairRegion, mergeRepairRegion } from "../lib"
import { repairValueKey } from "../lib/repairRegionGeometry"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("JSON transport may omit undefined object metadata without weakening defined metadata or stale-state guards", (): void => {
  const fixture = regionSafetyFixture()
  Object.assign(fixture.routes[0]!, {
    startPcbPortId: undefined,
    endPcbPortId: undefined,
    metadata: { omitted: undefined, defined: "original", list: [null] },
  })
  const region = extractRepairRegion(fixture)
  const solver = new Repair04Solver(
    JSON.parse(
      JSON.stringify({
        srj: region.srj,
        routes: region.routes,
        bounds: region.bounds,
        boundaryMargin: region.boundaryMargin,
        lockedPointIndices: region.lockedPointIndices,
      }),
    ),
  )
  solver.solve()
  const repairedRoutes = JSON.parse(JSON.stringify(solver.getOutput()))
  expect(
    mergeRepairRegion({ routes: fixture.routes, region, repairedRoutes }),
  ).toEqual(fixture.routes)
  const moved = structuredClone(repairedRoutes)
  moved[0].route.find(
    (point: { x: number; y: number }) => point.x === 0 && point.y === 0,
  ).y = 0.2
  const serializedSources = JSON.parse(JSON.stringify(fixture.routes))
  const serializedRegion = JSON.parse(JSON.stringify(region))
  expect(
    mergeRepairRegion({
      routes: serializedSources,
      region: serializedRegion,
      repairedRoutes: moved,
    })[0]!.route,
  ).toContainEqual({ x: 0, y: 0.2, z: 0 })
  const changedMetadata = structuredClone(moved)
  changedMetadata[0].metadata.defined = "changed"
  expect(() =>
    mergeRepairRegion({
      routes: fixture.routes,
      region,
      repairedRoutes: changedMetadata,
    }),
  ).toThrow("changed net, width, jumper, or route metadata")
  const changedSource = structuredClone(serializedSources)
  changedSource[0].metadata.defined = "changed"
  expect(() =>
    mergeRepairRegion({
      routes: changedSource,
      region: serializedRegion,
      repairedRoutes: moved,
    }),
  ).toThrow("stale source geometry")
  expect(repairValueKey({ metadata: null })).not.toBe(repairValueKey({}))
  expect(repairValueKey([undefined])).not.toBe(repairValueKey([]))
  expect(repairValueKey([undefined])).not.toBe(repairValueKey([null]))
})

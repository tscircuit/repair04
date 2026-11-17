import { expect, test } from "bun:test"
import type { SimplifiedPcbTrace } from "high-density-repair03/lib"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"
import type { PhysicalHighDensityRoute } from "../lib/physicalViaMetadata"

const bounds = { minX: -4, maxX: 4, minY: -4, maxY: 4 }
type ProjectedVia = Extract<
  SimplifiedPcbTrace["route"][number],
  { route_type: "via" }
> & {
  outer_diameter?: number
  hole_diameter?: number
}

const projectionInput = (
  routes: PhysicalHighDensityRoute[],
  lockedPointIndices: boolean[][],
) => ({
  srj: {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds,
    obstacles: [],
    connections: routes.map((route) => ({
      name: route.connectionName,
      pointsToConnect: [],
    })),
  },
  routes,
  bounds,
  boundaryMargin: 0.25,
  lockedPointIndices,
  allowViaMovement: true,
})

test("each via contributes its own copper radius to clearance", () => {
  const route: PhysicalHighDensityRoute = {
    connectionName: "via",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: -3.8, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 3, y: 0, z: 1 },
      { x: 3, y: 0, z: 0 },
      { x: 3.8, y: 1, z: 0 },
    ],
    vias: [
      { x: 0, y: 0, outerDiameter: 1, holeDiameter: 0.4 },
      { x: 3, y: 0, outerDiameter: 0.4, holeDiameter: 0.2 },
    ],
  }
  const nearFirst = {
    connectionName: "near-first",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: -1, y: 0.6, z: 0 },
      { x: 1, y: 0.6, z: 0 },
    ],
    vias: [],
  }
  const nearSecond = {
    connectionName: "near-second",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: 2.5, y: 0.5, z: 0 },
      { x: 3.5, y: 0.5, z: 0 },
    ],
    vias: [],
  }
  const output = relaxTraceClearance(
    projectionInput(
      [route, nearFirst, nearSecond],
      [
        [true, false, false, false, false, true],
        [true, true],
        [true, true],
      ],
    ),
  )
  const first = output[0]!.vias.find((via) => via.outerDiameter === 1)!
  const second = output[0]!.vias.find((via) => via.outerDiameter === 0.4)!
  // Copper 1.0 + trace 0.1 and copper 0.4 + trace 0.1 with 0.1 clearance.
  expect(0.6 - first.y).toBeGreaterThanOrEqual(0.65 - 1e-7)
  expect(0.5 - second.y).toBeGreaterThanOrEqual(0.35 - 1e-7)
  // The smaller via must not inherit the larger via's radius.
  expect(0.5 - second.y).toBeLessThan(0.65)
  expect(first.holeDiameter).toBe(0.4)
  expect(second.holeDiameter).toBe(0.2)
})

test("a moved via keeps its metadata and follows its projected transition", () => {
  const route: PhysicalHighDensityRoute = {
    connectionName: "via",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: -3, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
    ],
    vias: [{ x: 0, y: 0, outerDiameter: 1, holeDiameter: 0.4 }],
  }
  const near = {
    connectionName: "near",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: -1, y: 0.6, z: 0 },
      { x: 1, y: 0.6, z: 0 },
    ],
    vias: [],
  }
  const [projected] = relaxTraceClearance(
    projectionInput(
      [route, near],
      [
        [true, false, false, false, true],
        [true, true],
      ],
    ),
  )
  const via = projected!.vias[0]!
  expect(via).toEqual({
    outerDiameter: 1,
    holeDiameter: 0.4,
    x: projected!.route[2]!.x,
    y: projected!.route[2]!.y,
  })
  expect(projected!.route[3]).toMatchObject({ x: via.x, y: via.y })
  expect(via.y).toBeLessThan(0)
})

test("a boundary via without a transition survives both projection paths", () => {
  const route: PhysicalHighDensityRoute = {
    connectionName: "boundary",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: -3.9, y: 0, z: 0 },
      { x: -3.5, y: 0, z: 0 },
      { x: 3.5, y: 0, z: 0 },
      { x: 3.9, y: 0, z: 0 },
    ],
    vias: [{ x: -3.9, y: 0, outerDiameter: 0.8, holeDiameter: 0.4 }],
  }
  const input = projectionInput([route], [[true, false, false, true]])
  const before = structuredClone(input)
  const expected = structuredClone(route)
  const output = relaxTraceClearance(input)
  expect(output[0]!.vias).toEqual(expected.vias)
  expect(output[0]!.route[0]).toEqual(expected.route[0])
  const solver = new RelaxTraceClearanceSolver(input)
  solver.solve()
  expect(solver.getOutput()).toEqual(output)
  expect(input).toEqual(before)
})

test("DRC uses the projected copper diameter, not the route fallback", () => {
  const route: PhysicalHighDensityRoute = {
    connectionName: "via",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
    vias: [{ x: 0, y: 0, outerDiameter: 0.8, holeDiameter: 0.4 }],
  }
  const [converted] = convertRepairRoutesToTraces([route], 2)
  const via = converted!.route.find(
    (point) => point.route_type === "via",
  ) as ProjectedVia
  expect(via.via_diameter).toBe(0.8)
  expect(via.via_diameter).not.toBe(route.viaDiameter)
  expect(via.outer_diameter).toBe(0.8)
  expect(via.hole_diameter).toBe(0.4)
})

test("hole diameter reaches the trace output and stays unknown when absent", () => {
  const route: PhysicalHighDensityRoute = {
    connectionName: "via",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      { x: 2, y: 0, z: 0 },
    ],
    vias: [
      { x: 0, y: 0, outerDiameter: 0.6, holeDiameter: 0.3 },
      { x: 2, y: 0, outerDiameter: 0.6 },
    ],
  }
  const [converted] = convertRepairRoutesToTraces([route], 2)
  const vias = converted!.route.filter(
    (point) => point.route_type === "via",
  ) as ProjectedVia[]
  expect(vias).toHaveLength(2)
  expect(vias[0]!.via_diameter).toBe(0.6)
  expect(vias[0]!.hole_diameter).toBe(0.3)
  expect(vias[1]!.via_diameter).toBe(0.6)
  expect("hole_diameter" in vias[1]!).toBe(false)
})

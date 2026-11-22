import { expect, test } from "bun:test"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"
import type { PhysicalHighDensityRoute } from "../lib/physicalViaMetadata"

const bounds = { minX: -4, maxX: 4, minY: -4, maxY: 4 }

/**
 * A same-net branch starts at (0, 0.54) inside the via's 1.0 mm copper, and a
 * foreign line on the other via layer forces avoidance. Connectivity must keep
 * the via attached to the branch even when the default diameter is smaller.
 */
const junctionInput = (viaDiameter: number) => ({
  srj: {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds,
    obstacles: [],
    connections: [
      { name: "via", pointsToConnect: [] },
      { name: "via", pointsToConnect: [] },
      { name: "other", pointsToConnect: [] },
    ],
  },
  routes: [
    {
      connectionName: "via",
      traceThickness: 0.1,
      viaDiameter,
      route: [
        { x: -2, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
      ],
      vias: [{ x: 0, y: 0, outerDiameter: 1, holeDiameter: 0.4 }],
    },
    {
      connectionName: "via",
      traceThickness: 0.1,
      viaDiameter,
      route: [
        { x: 0, y: 0.54, z: 0 },
        { x: 0, y: 2, z: 0 },
      ],
      vias: [],
    },
    {
      connectionName: "other",
      traceThickness: 0.1,
      viaDiameter,
      route: [
        { x: -2, y: 0.6, z: 1 },
        { x: 2, y: 0.6, z: 1 },
      ],
      vias: [],
    },
  ],
  bounds,
  boundaryMargin: 0.25,
  lockedPointIndices: [
    [true, false, false, true],
    [true, true],
    [true, true],
  ],
  allowViaMovement: true,
})

const projectWithBothEntryPoints = (
  input: ReturnType<typeof junctionInput>,
) => {
  const solver = new RelaxTraceClearanceSolver(input)
  solver.solve()
  const solverOutput = solver.getOutput()
  const functionOutput = relaxTraceClearance(input)
  expect(solverOutput).toEqual(functionOutput)
  return functionOutput
}

test("via junction protection uses the physical diameter on both entry points", () => {
  const output = projectWithBothEntryPoints(junctionInput(0.2))
  const viaRoute = output[0]!
  const branch = output[1]!
  const via = viaRoute.vias.find((record) => record.outerDiameter === 1)!
  const branchStart = branch.route[0]!
  // Via copper (radius 0.5) plus branch copper (radius 0.05) overlap.
  const copperGap =
    Math.hypot(via.x - branchStart.x, via.y - branchStart.y) - 0.5 - 0.05
  expect(copperGap).toBeLessThanOrEqual(1e-7)
  expect(via.y).toBeCloseTo(0, 7)
  expect(branchStart.y).toBeCloseTo(0.54, 7)
})

test("default diameter 1.0 locks the same junction identically", () => {
  const output = projectWithBothEntryPoints(junctionInput(1))
  const viaRoute = output[0]!
  const branch = output[1]!
  const via = viaRoute.vias.find((record) => record.outerDiameter === 1)!
  const branchStart = branch.route[0]!
  expect(via.y).toBeCloseTo(0, 7)
  expect(branchStart.y).toBeCloseTo(0.54, 7)
  // The physical-diameter fix must make the 0.2 fallback behave like this.
  const physicalOutput = projectWithBothEntryPoints(junctionInput(0.2))
  expect(physicalOutput[0]!.route).toEqual(viaRoute.route)
  expect(physicalOutput[1]!.route).toEqual(branch.route)
})

test("a transition without a record still gets a position-only via record", () => {
  const route: PhysicalHighDensityRoute = {
    connectionName: "via",
    traceThickness: 0.1,
    viaDiameter: 0.2,
    route: [
      { x: -2, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
    vias: [],
  }
  const input = {
    srj: {
      layerCount: 2,
      minTraceWidth: 0.1,
      bounds,
      obstacles: [],
      connections: [{ name: "via", pointsToConnect: [] }],
    },
    routes: [route],
    bounds,
    boundaryMargin: 0.25,
    lockedPointIndices: [[true, false, false, true]],
    allowViaMovement: true,
  }
  const solver = new RelaxTraceClearanceSolver(input)
  solver.solve()
  const solverOutput = solver.getOutput()
  const functionOutput = relaxTraceClearance(input)
  expect(solverOutput).toEqual(functionOutput)
  expect(functionOutput[0]!.vias).toEqual([{ x: 0, y: 0 }])
  const [record] = functionOutput[0]!.vias
  expect(record && "outerDiameter" in record).toBe(false)
  expect(record && "holeDiameter" in record).toBe(false)
})

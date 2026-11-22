import { expect, test } from "bun:test"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"

test("both native projection paths preserve original via metadata while using actual copper radius", () => {
  const bounds = { minX: -4, maxX: 4, minY: -4, maxY: 4 }
  const routes = [
    {
      connectionName: "via",
      traceThickness: 0.1,
      viaDiameter: 0.2,
      route: [
        { x: -3, y: -1, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 3, y: -1, z: 1 },
      ],
      vias: [
        {
          x: 0,
          y: 0,
          outerDiameter: 1,
          holeDiameter: 0.4,
        },
      ],
    },
    {
      connectionName: "line",
      traceThickness: 0.1,
      viaDiameter: 0.2,
      route: [
        { x: -2, y: 0.4, z: 0 },
        { x: 2, y: 0.4, z: 0 },
      ],
      vias: [],
    },
  ]
  const input = {
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
    lockedPointIndices: [
      [true, false, false, true],
      [true, true],
    ],
    allowViaMovement: true,
  }
  const before = structuredClone(input)
  const solver = new RelaxTraceClearanceSolver(input)
  solver.solve()
  const output = solver.getOutput()
  expect(output).toEqual(relaxTraceClearance(input))
  expect(output[0]!.vias[0]).toMatchObject({
    outerDiameter: 1,
    holeDiameter: 0.4,
  })
  const via = output[0]!.vias[0]!
  expect(via.y).toBeLessThan(0)
  expect(0.4 - via.y - 0.5 - 0.05).toBeGreaterThanOrEqual(0.1 - 1e-7)
  expect(output[0]!.route[1]).toMatchObject({ x: via.x, y: via.y })
  expect(output[0]!.route[2]).toMatchObject({ x: via.x, y: via.y })
  expect(input).toEqual(before)
})

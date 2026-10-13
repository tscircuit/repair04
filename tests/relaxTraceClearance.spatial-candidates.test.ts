import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { relaxTraceClearance, RelaxTraceClearanceSolver } from "../lib"

test("incremental projection indexes nearby constraints without changing geometry", (): void => {
  const routes: HighDensityRoute[] = Array.from(
    { length: 100 },
    (_, routeIndex): HighDensityRoute => {
      const x = routeIndex < 2 ? 0 : routeIndex * 5
      const y = routeIndex === 1 ? 0.15 : 0
      return {
        connectionName: `route${routeIndex}`,
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [
          { x, y, z: 0 },
          { x: x + 0.5, y, z: 0 },
          { x: x + 1, y, z: 0 },
        ],
      }
    },
  )
  const bounds = { minX: -1, minY: -1, maxX: 500, maxY: 1 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 1,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [],
  }
  const input = {
    srj,
    routes,
    bounds,
    boundaryMargin: 0,
    lockedPointIndices: routes.map(() => [true, false, true]),
    traceClearance: 0.1,
    viaClearance: 0.1,
  }
  const solver = new RelaxTraceClearanceSolver(input)

  while (!solver.solved && !solver.failed) solver.step()

  expect(solver.failed).toBeFalse()
  expect(solver.getOutput()).toEqual(relaxTraceClearance(input))
  const theoreticalPairCount = (routes.length * 2 * (routes.length * 2 - 1)) / 2
  expect(solver.stats.preparedPairCount).toBeLessThan(theoreticalPairCount / 10)
  expect(solver.stats.evaluatedConstraintCount).toBeLessThan(
    solver.stats.projectedConstraintCount,
  )
})

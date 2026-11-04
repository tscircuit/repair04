import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import {
  relaxTraceClearance,
  type RelaxTraceClearanceInput,
} from "../lib/relaxTraceClearance"

const makeSparseInput = (translation: number): RelaxTraceClearanceInput => {
  const routes: HighDensityRoute[] = []
  for (let cluster = 0; cluster < 16; cluster++) {
    for (let row = 0; row < 2; row++) {
      const x = translation + cluster * 8
      const y = row * 0.12
      const z = cluster % 2
      const route: HighDensityRoute = {
        connectionName: `cluster${cluster}-row${row}`,
        traceThickness: row === 0 ? 0.08 : 0.12,
        viaDiameter: 0.3,
        vias: [],
        route: [-1, -0.5, 0, 0.5, 1].map((dx) => ({
          x: x + dx,
          y,
          z,
        })),
      }
      if (row === 0 && cluster % 3 === 0) {
        route.route.splice(3, 0, { x, y, z: 1 - z })
        for (let point = 4; point < route.route.length; point++)
          route.route[point]!.z = 1 - z
        route.vias.push({ x, y })
      }
      routes.push(route)
    }
  }
  const bounds = {
    minX: translation - 2,
    maxX: translation + 122,
    minY: -2,
    maxY: 2,
  }
  return {
    srj: {
      bounds,
      layerCount: 2,
      minTraceWidth: 0.08,
      connections: routes.map((route) => ({
        name: route.connectionName,
        pointsToConnect: [],
      })),
      obstacles: Array.from({ length: 16 }, (_, cluster) => ({
        type: "rect" as const,
        center: { x: translation + cluster * 8 + 0.35, y: 0.3 },
        width: 0.25,
        height: 0.1,
        ccwRotationDegrees: (cluster % 4) * 15,
        layers: [cluster % 2 === 0 ? "top" : "bottom"],
        connectedTo: [`pad${cluster}`],
      })),
    },
    routes,
    bounds,
    boundaryMargin: 0.05,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowViaMovement: true,
    lockedPointIndices: routes.map((route, index) =>
      route.route.map(
        (_, point) =>
          Math.floor(index / 2) % 4 === 0 ||
          point === 0 ||
          point === route.route.length - 1,
      ),
    ),
  }
}

test("spatial preparation preserves exhaustive projection for sparse rotated pads and vias", (): void => {
  for (const translation of [-2048, 0, 2 ** 26]) {
    const input = makeSparseInput(translation)
    const before = structuredClone(input)
    const expected = relaxTraceClearance(input)
    const solver = new RelaxTraceClearanceSolver(input)
    solver.solve()
    expect(solver.solved).toBeTrue()
    expect(solver.failed).toBeFalse()
    expect(solver.getOutput()).toEqual(expected)
    expect(input).toEqual(before)
    expect(solver.stats.preparedPairCount).toBeLessThan(1000)
    expect(solver.stats.sweepCount).toBe(256)
  }
})

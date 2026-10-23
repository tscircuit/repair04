import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import {
  negotiateTraceClearance,
  type NegotiatedClearanceInput,
} from "../lib/negotiateTraceClearance"
import type { ClearancePathSearchStats } from "../lib/findClearancePath"

test("prepared geometry and filtered copper preserve negotiation with shared and fixed vias", (): void => {
  const bounds = { minX: -4, maxX: 4, minY: -4, maxY: 4 }
  for (const blindVias of [false, true]) {
    for (const endLayer of [0, 2]) {
      for (const pathHeuristicWeight of [1, 3]) {
        const routes: HighDensityRoute[] = [0, 0.2, -0.2].map((y, index) => ({
          connectionName: index === 0 ? "signal" : `neighbor-${index}`,
          traceThickness: 0.1,
          viaDiameter: 0.3,
          vias: [],
          route: [
            { x: -3, y, z: 0 },
            { x: 0, y, z: 0 },
            { x: 3, y, z: 0 },
          ],
        }))
        for (const [connectionName, y] of [
          ["signal", 0.7],
          ["locked-via", -0.7],
          ["movable-via", 1.2],
        ] satisfies Array<[string, number]>) {
          routes.push({
            connectionName,
            traceThickness: 0.1,
            viaDiameter: 0.3,
            vias: [{ x: 0, y }],
            route: [
              { x: -2, y, z: 0 },
              { x: 0, y, z: 0 },
              { x: 0, y, z: 2 },
              { x: 2, y, z: 2 },
            ],
          })
        }
        if (endLayer !== 0) {
          routes[0]!.route = [
            { x: -3, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: endLayer },
            { x: 3, y: 0, z: endLayer },
          ]
          routes[0]!.vias = [{ x: 0, y: 0 }]
        }
        const input: NegotiatedClearanceInput = {
          srj: {
            bounds,
            layerCount: 4,
            minTraceWidth: 0.1,
            connections: [],
            obstacles: [
              {
                type: "rect",
                center: { x: 0, y: 0 },
                width: 0.6,
                height: 0.2,
                layers: ["top"],
                connectedTo: ["pad"],
              },
            ],
          },
          routes,
          bounds,
          dirtyRouteIndices: [0, 1, 2],
          isLocked: (routeIndex, pointIndex): boolean =>
            routeIndex === 4 ||
            pointIndex === 0 ||
            pointIndex === routes[routeIndex]!.route.length - 1,
          allowLayerChanges: true,
          traceClearance: 0.1,
          viaClearance: 0.1,
          maxPathSearchNodes: 10000,
          maxPathSearchCalls: 8,
          pathHeuristicWeight,
        }
        Object.assign(input.srj, { allowBlindAndBuriedVias: blindVias })
        const original = structuredClone({ srj: input.srj, routes })
        const referenceCalls: ClearancePathSearchStats[] = []
        const reference = negotiateTraceClearance({
          ...input,
          onSearch: (stats): void => {
            referenceCalls.push({ ...stats })
          },
        })
        const preparedCalls: ClearancePathSearchStats[] = []
        const solver = new NegotiateTraceClearanceSolver({
          ...input,
          onSearch: (stats): void => {
            preparedCalls.push({ ...stats })
          },
        })
        while (!solver.solved && !solver.failed) solver.step()
        expect(solver.failed).toBeFalse()
        expect(solver.getOutput()).toEqual(reference)
        expect(preparedCalls).toEqual(referenceCalls)
        expect({ srj: input.srj, routes }).toEqual(original)
      }
    }
  }
})

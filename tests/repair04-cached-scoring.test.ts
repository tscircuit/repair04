import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { getRepairViaGeometry } from "../lib/getRepairViaGeometry"

test("repeated scoring preserves route identity, cross-route net aliases and obstacle order after one route changes", (): void => {
  const shared: HighDensityRoute = {
    connectionName: "signal",
    rootConnectionName: "root",
    traceThickness: 0.2,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: [
      { x: -4, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 4, y: 0, z: 1 },
    ],
  }
  const routes = [
    shared,
    shared,
    {
      ...shared,
      connectionName: "root",
      rootConnectionName: "pad-alias",
      route: [
        { x: -4, y: 3, z: 0 },
        { x: 4, y: 3, z: 0 },
      ],
      vias: [],
    },
  ]
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.2,
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.5,
        height: 0.5,
        layers: ["top", "bottom"],
        connectedTo: ["foreign"],
      },
      {
        type: "rect",
        center: { x: 1, y: 0 },
        width: 0.5,
        height: 0.5,
        ccwRotationDegrees: 35,
        layers: ["bottom"],
        connectedTo: ["other"],
      },
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["pad-alias"],
      },
    ],
  }
  for (const selected of [false, true]) {
    const solver = new Repair04Solver({
      srj,
      routes,
      bounds: srj.bounds,
      boundaryMargin: 0.2,
      lockedPointIndices: routes.map((route): boolean[] =>
        route.route.map((): boolean => false),
      ),
      allowLayerChanges: true,
      ...(selected ? { movableVias: [{ routeIndex: 1, viaIndex: 0 }] } : {}),
    })
    const internal = solver as unknown as {
      routes: HighDensityRoute[]
      evaluate(routes: HighDensityRoute[]): {
        errors: { pcb_trace_error_id?: string }[]
        fixedViolations: Map<string, number>
      }
    }
    // Structured cloning retains a repeated input object at both route indices.
    expect(internal.routes[0]).toBe(internal.routes[1])
    const original = internal.routes
    const changed = original.slice()
    changed[1] = {
      ...original[1]!,
      vias: [{ x: 0.6, y: 0.4 }],
      route: original[1]!.route.map((point, index) =>
        index === 1 || index === 2 ? { ...point, x: 0.6, y: 0.4 } : point,
      ),
    }
    for (const candidate of [original, original, changed, changed, original]) {
      const fixed = getFixedObstacleViolations({ srj, routes: candidate })
      const via = getNewViaPadViolations({
        srj,
        previousRoutes: candidate,
        routes: candidate,
        includeExistingVias: selected
          ? [{ routeIndex: 1, viaIndex: 0 }]
          : candidate.flatMap((route, routeIndex) =>
              getRepairViaGeometry(route, 2).map((_, viaIndex) => ({
                routeIndex,
                viaIndex,
              })),
            ),
      })
      const score = internal.evaluate(candidate)
      expect([...score.fixedViolations]).toEqual(
        fixed.map((v) => [v.key, v.severity]),
      )
      expect(
        score.errors
          .map((e) => e.pcb_trace_error_id)
          .filter(
            (id) =>
              id?.startsWith("fixed-obstacle:") ||
              id?.startsWith("new-via-pad:"),
          ),
      ).toEqual([...fixed, ...via].map((v) => v.key))
      expect(fixed.some((v) => v.obstacleIndex === 2)).toBe(false)
      expect(
        score.errors.some((e) =>
          e.pcb_trace_error_id?.startsWith("fixed-obstacle:1:"),
        ),
      ).toBe(true)
    }
    expect(shared.route[1]).toEqual({ x: 0, y: 0, z: 0 })
  }
})

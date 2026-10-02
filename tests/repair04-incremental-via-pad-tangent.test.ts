import {
  convertRepairRoutesToTraces,
  getFixedObstacleViolations,
  getNewViaPadViolations,
  relaxTraceClearance,
  RelaxTraceClearanceSolver,
} from "../lib"
import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"

test("incremental clearance projection slides pad-contacting vias apart without worsening fixed copper", (): void => {
  for (const { degrees, offset, width } of [
    { degrees: 0, offset: 0, width: 0.6 },
    { degrees: 1, offset: -0.2, width: 2.8 },
    { degrees: 89, offset: 0.12, width: 0.6 },
  ]) {
    const angle = (degrees * Math.PI) / 180
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const rotate = <T extends { x: number; y: number }>(point: T): T => ({
      ...point,
      x: point.x * cosine - point.y * sine,
      y: point.x * sine + point.y * cosine,
    })
    const local = (point: {
      x: number
      y: number
    }): {
      x: number
      y: number
    } => ({
      x: point.x * cosine + point.y * sine,
      y: -point.x * sine + point.y * cosine,
    })
    const routes: HighDensityRoute[] = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.3 },
    ].map(
      (via, index): HighDensityRoute => ({
        connectionName: `signal_${index}`,
        traceThickness: 0.095,
        viaDiameter: 0.3,
        vias: [via],
        route: [
          { x: -1, y: via.y, z: 0, pcb_port_id: `pcb_port_left_${index}` },
          { ...via, z: 0 },
          { ...via, z: 1 },
          { x: 1, y: via.y, z: 1, pcb_port_id: `pcb_port_right_${index}` },
        ],
      }),
    )
    for (const route of routes) {
      route.route = route.route.map(rotate)
      route.vias = route.vias.map(rotate)
    }
    const originalSrj: SimpleRouteJson & {
      minViaHoleDiameter: number
      minViaHoleEdgeToViaHoleEdgeClearance: number
    } = {
      layerCount: 2,
      minTraceWidth: 0.095,
      minViaDiameter: 0.3,
      minViaHoleDiameter: 0.15,
      minTraceToPadEdgeClearance: 0.1,
      minViaHoleEdgeToViaHoleEdgeClearance: 0.25,
      minBoardEdgeClearance: 0.1,
      bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
      connections: routes.map((route) => ({
        name: route.connectionName,
        pointsToConnect: route.route
          .filter((point) => point.pcb_port_id)
          .map((point) => ({
            x: point.x,
            y: point.y,
            layer: point.z === 0 ? "top" : "bottom",
            pointId: point.pcb_port_id,
            pcb_port_id: point.pcb_port_id,
          })),
      })),
      obstacles: [
        ...routes.flatMap((route) =>
          route.route
            .filter((point) => point.pcb_port_id)
            .map((point) => ({
              type: "rect" as const,
              ccwRotationDegrees: degrees,
              center: { x: point.x, y: point.y },
              width: 0.1,
              height: 0.1,
              layers: [point.z === 0 ? "top" : "bottom"],
              connectedTo: [
                route.connectionName,
                point.pcb_port_id!,
                `pcb_smtpad_${point.pcb_port_id}`,
              ],
            })),
        ),
        ...[
          { x: offset, y: -0.35 },
          { x: 0.1 + offset, y: 0.65 },
        ].map((center, index) => ({
          type: "rect" as const,
          center: rotate(center),
          ccwRotationDegrees: degrees,
          width,
          height: 0.2,
          layers: ["top"],
          connectedTo: [`foreign_${index}`, `pcb_smtpad_foreign_${index}`],
        })),
      ],
    }
    const physicalDrc = new AutoroutingDrcEngine(originalSrj)
    // The indexed checker accepts copper-edge gaps. Convert the board's
    // 0.25 mm hole-edge rule for 0.15 mm drills and 0.30 mm copper diameters.
    const declaredViaCopperClearance =
      originalSrj.minViaHoleEdgeToViaHoleEdgeClearance! +
      originalSrj.minViaHoleDiameter! -
      originalSrj.minViaDiameter!
    const declaredDrc = new AutoroutingDrcEngine(originalSrj, {
      traceClearance: originalSrj.minTraceToPadEdgeClearance,
      viaClearance: declaredViaCopperClearance,
    })
    const evaluate = (candidate: HighDensityRoute[], declared: boolean) =>
      (declared ? declaredDrc : physicalDrc).evaluate(
        convertRepairRoutesToTraces(candidate, originalSrj.layerCount),
      )
    const original = structuredClone(routes)
    const initialErrors = evaluate(routes, true).errors
    expect(initialErrors).toHaveLength(1)
    expect(initialErrors[0]!.type).toBe("pcb_via_clearance_error")
    const input = {
      srj: { ...originalSrj, traces: undefined },
      routes,
      bounds: originalSrj.bounds,
      boundaryMargin: 0,
      boardEdgeClearance: originalSrj.minBoardEdgeClearance,
      lockedPointIndices: routes.map(() => [true, false, false, true]),
      allowViaMovement: true,
      traceClearance: 0.1,
      viaClearance: 0.1,
    }
    // Legacy projection discards both direct separation moves at the pad faces.
    const synchronous = relaxTraceClearance(input)
    for (const [index, route] of synchronous.entries()) {
      expect(local(route.vias[0]!).x).toBeCloseTo(
        local(original[index]!.vias[0]!).x,
        12,
      )
      expect(local(route.vias[0]!).y).toBeCloseTo(
        local(original[index]!.vias[0]!).y,
        12,
      )
    }
    expect(evaluate(synchronous, true).errors).toHaveLength(1)

    const solver = new RelaxTraceClearanceSolver(input)
    while (!solver.solved && !solver.failed) solver.step()
    expect(solver.error).toBeNull()
    expect(solver.failed).toBeFalse()
    expect(solver.solved).toBeTrue()
    const result = solver.getOutput()
    expect(solver.stats.sweepCount).toBe(256)
    expect(evaluate(result, false).errors).toEqual([])
    expect(evaluate(result, true).errors).toEqual([])
    for (const [index, route] of result.entries()) {
      expect(route.route).toHaveLength(original[index]!.route.length)
      expect(route.route[0]).toEqual(original[index]!.route[0])
      expect(route.route.at(-1)).toEqual(original[index]!.route.at(-1))
      expect(local(route.route[1]!).y).toBeCloseTo(
        local(original[index]!.route[1]!).y,
        12,
      )
      expect(local(route.route[2]!).y).toBeCloseTo(
        local(original[index]!.route[2]!).y,
        12,
      )
      expect(local(route.route[1]!).x).not.toBe(
        local(original[index]!.route[1]!).x,
      )
      expect(route.viaDiameter).toBe(original[index]!.viaDiameter)
      expect(route.traceThickness).toBe(original[index]!.traceThickness)
    }
    const viaDistance = Math.hypot(
      result[0]!.vias[0]!.x - result[1]!.vias[0]!.x,
      result[0]!.vias[0]!.y - result[1]!.vias[0]!.y,
    )
    expect(viaDistance - originalSrj.minViaDiameter!).toBeGreaterThanOrEqual(
      0.1 - 1e-12,
    )
    expect(
      viaDistance - originalSrj.minViaHoleDiameter!,
    ).toBeGreaterThanOrEqual(
      originalSrj.minViaHoleEdgeToViaHoleEdgeClearance! - 1e-12,
    )
    for (const route of result) {
      // A segment lies inside this convex inset if both endpoints do.
      for (const [points, radius] of [
        [route.route, route.traceThickness / 2],
        [route.vias, route.viaDiameter / 2],
      ] as const) {
        for (const point of points) {
          const copperEdgeMargin =
            Math.min(
              point.x - originalSrj.bounds.minX,
              originalSrj.bounds.maxX - point.x,
              point.y - originalSrj.bounds.minY,
              originalSrj.bounds.maxY - point.y,
            ) - radius
          expect(copperEdgeMargin).toBeGreaterThanOrEqual(
            originalSrj.minBoardEdgeClearance!,
          )
        }
      }
    }
    expect(routes).toEqual(original)
    expect(
      getFixedObstacleViolations({ srj: input.srj, routes: result }),
    ).toEqual([])
    expect(
      getNewViaPadViolations({
        srj: input.srj,
        previousRoutes: routes,
        routes: result,
      }),
    ).toEqual([])
  }
})

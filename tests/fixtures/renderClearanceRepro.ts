import { pointToSegmentClosestPoint } from "@tscircuit/math-utils"
import {
  getSvgFromGraphicsObject,
  type GraphicsObject,
  type Point,
} from "graphics-debug"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "../../lib/convertRepairRoutesToTraces"
import {
  getFixedObstacleViolations,
  getNetRepresentatives,
} from "../../lib/getFixedObstacleViolations"
import { getRepairCopperLayerSpan } from "../../lib/getRepairCopperLayerSpan"
import { getRepairViaGeometry } from "../../lib/getRepairViaGeometry"
import { getLocalObstacleGeometry } from "../../lib/obstacleDistanceGeometry"
import type {
  Bounds,
  RepairRegionInput,
  RepairRoutePoint,
} from "../../lib/repairRegionTypes"

export type ClearanceVisualReproFixture = {
  name: string
  title: string
  provenance: string
  viewport: Bounds
  highlightViaTrace?: {
    viaRouteIndex: number
    traceRouteIndex: number
    label: string
  }
  input: RepairRegionInput & {
    traceClearance: number
    viaClearance: number
    allowViaMovement: boolean
    boardEdgeClearance?: number
  }
}

export type ClearanceReproMeasurements = {
  /** Indexed trace, via, and recognized-pad checks over all input context. */
  drcErrorCount: number
  /** The same indexed errors, restricted to contact centers in the viewport. */
  viewportDrcErrorCount: number
  /** Generic keepouts and holes supplement the indexed pad checker. */
  fixedObstacleViolationCount: number
  /** Different-net physical via pairs whose midpoint lies in the viewport. */
  minimumViaEdgeGap: number | null
  viaPairViolationCount: number
  targetViaTraceGap: number | null
  focusPoints: Point[]
}

export type HighlightedViaTraceMeasurement = {
  gap: number
  viaIndex: number
  segmentIndex: number
  center: Point
}

const palette = [
  "#2563eb",
  "#c026d3",
  "#059669",
  "#ea580c",
  "#0891b2",
  "#7c3aed",
]
const width = 1100
const height = 620

function contains(bounds: Bounds, point: Point): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  )
}

function formatGap(gap: number): string {
  const rounded = gap.toFixed(3)
  return rounded === "-0.000" ? "0.000" : rounded
}

/** Crop drawing primitives only. The solver and checker retain full context. */
function clipLine(a: Point, b: Point, bounds: Bounds): Point[] | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let from = 0
  let to = 1
  for (const [direction, distance] of [
    [-dx, a.x - bounds.minX],
    [dx, bounds.maxX - a.x],
    [-dy, a.y - bounds.minY],
    [dy, bounds.maxY - a.y],
  ]) {
    if (direction === 0) {
      if (distance! < 0) return null
      continue
    }
    const fraction = distance! / direction!
    if (direction! < 0) from = Math.max(from, fraction)
    else to = Math.min(to, fraction)
    if (from > to) return null
  }
  return [
    { x: a.x + from * dx, y: a.y + from * dy },
    { x: a.x + to * dx, y: a.y + to * dy },
  ]
}

function clipPolygon(points: Point[], bounds: Bounds): Point[] {
  let result = points
  for (const [axis, edge, sign] of [
    ["x", bounds.minX, 1],
    ["x", bounds.maxX, -1],
    ["y", bounds.minY, 1],
    ["y", bounds.maxY, -1],
  ] as const) {
    const source = result
    result = []
    for (let index = 0; index < source.length; index++) {
      const a = source[index]!
      const b = source[(index + 1) % source.length]!
      const aInside = sign * (a[axis] - edge) >= 0
      const bInside = sign * (b[axis] - edge) >= 0
      if (aInside) result.push(a)
      if (aInside !== bInside) {
        const fraction = (edge - a[axis]) / (b[axis] - a[axis])
        result.push({
          x: a.x + fraction * (b.x - a.x),
          y: a.y + fraction * (b.y - a.y),
        })
      }
    }
  }
  return result
}

/** Measure the selected routes using their emitted copper and physical spans. */
export function measureHighlightedViaTrace(
  fixture: ClearanceVisualReproFixture,
  routes: HighDensityRoute[],
): HighlightedViaTraceMeasurement | null {
  const selection = fixture.highlightViaTrace
  if (!selection) return null
  const viaRoute = routes[selection.viaRouteIndex]
  const traceRoute = routes[selection.traceRouteIndex]
  if (!viaRoute || !traceRoute)
    throw new Error("clearance snapshot target route index is out of range")
  let nearest: HighlightedViaTraceMeasurement | null = null
  const vias = getRepairViaGeometry(viaRoute, fixture.input.srj.layerCount)
  for (const [viaIndex, via] of vias.entries()) {
    if (!contains(fixture.viewport, via)) continue
    const span = getRepairCopperLayerSpan(
      fixture.input.srj,
      { z: via.minZ },
      { z: via.maxZ },
    )
    for (let index = 1; index < traceRoute.route.length; index++) {
      const a = traceRoute.route[index - 1]! as RepairRoutePoint
      const b = traceRoute.route[index]! as RepairRoutePoint
      if (
        a.z !== b.z ||
        a.toNextSegmentType === "through_obstacle" ||
        a.z < span.minZ ||
        a.z > span.maxZ ||
        (a.x === b.x && a.y === b.y)
      )
        continue
      const visibleSegment = clipLine(a, b, fixture.viewport)
      if (!visibleSegment) continue
      const tracePoint = pointToSegmentClosestPoint(
        via,
        visibleSegment[0]!,
        visibleSegment[1]!,
      )
      const dx = tracePoint.x - via.x
      const dy = tracePoint.y - via.y
      const distance = Math.hypot(dx, dy)
      const viaRadius = via.diameter / 2
      const traceRadius =
        Math.max(
          a.traceThickness ?? traceRoute.traceThickness,
          b.traceThickness ?? traceRoute.traceThickness,
        ) / 2
      const gap = distance - viaRadius - traceRadius
      if (nearest && gap >= nearest.gap) continue
      const contactDistance = (distance + viaRadius - traceRadius) / 2
      nearest = {
        gap,
        viaIndex,
        segmentIndex: index - 1,
        center:
          distance === 0
            ? { x: via.x, y: via.y }
            : {
                x: via.x + (dx * contactDistance) / distance,
                y: via.y + (dy * contactDistance) / distance,
              },
      }
    }
  }
  return nearest
}

export function measureClearanceRepro(
  fixture: ClearanceVisualReproFixture,
  routes: HighDensityRoute[],
): ClearanceReproMeasurements {
  const { input } = fixture
  const nets = getNetRepresentatives(input.srj, routes)
  // Extracted fragments retain original root aliases in internal metadata.
  // Normalize those aliases for the independent indexed checker.
  const checkSrj = {
    ...input.srj,
    connections: input.srj.connections.map((connection) => ({
      ...connection,
      netConnectionName: nets.get(connection.name) ?? connection.name,
    })),
    obstacles: input.srj.obstacles.map((obstacle) => ({
      ...obstacle,
      connectedTo: [
        ...obstacle.connectedTo,
        ...obstacle.connectedTo.map((id) => nets.get(id) ?? id),
      ],
    })),
  }
  // This geometry checker does not interpret crop cuts as disconnected board
  // terminals, and all clearance errors remain in the full-context count.
  const errors = new AutoroutingDrcEngine(checkSrj, {
    traceClearance: input.traceClearance,
    viaClearance: input.viaClearance,
  }).evaluate(
    [
      ...(input.srj.traces ?? []),
      ...convertRepairRoutesToTraces(routes, input.srj.layerCount),
    ].map((trace) => ({
      ...trace,
      connection_name: nets.get(trace.connection_name) ?? trace.connection_name,
    })),
  ).errors
  // Recognized pads are already checked by the engine, including rotation.
  const fixed = getFixedObstacleViolations({ ...input, routes }).filter(
    (violation) =>
      !input.srj.obstacles[violation.obstacleIndex]!.connectedTo.some((id) =>
        /^(pcb_smtpad_|pcb_plated_hole_|pcb_port_)/.test(id),
      ),
  )
  // Several routed branches can refer to one physical via. Canonicalize its
  // owner and copper span before measuring each physical pair once.
  const vias = [
    ...new Map(
      routes.flatMap((route) => {
        const name = route.rootConnectionName ?? route.connectionName
        const owner = nets.get(name) ?? name
        return getRepairViaGeometry(route, input.srj.layerCount).map((via) => {
          const span = getRepairCopperLayerSpan(
            input.srj,
            { z: via.minZ },
            { z: via.maxZ },
          )
          return [
            JSON.stringify([
              owner,
              via.x,
              via.y,
              span.minZ,
              span.maxZ,
              via.diameter,
            ]),
            { ...via, ...span, owner },
          ] as const
        })
      }),
    ).values(),
  ]
  let minimumViaEdgeGap: number | null = null
  let viaPairViolationCount = 0
  const focusPoints: Point[] = [
    ...errors.flatMap((error) => {
      const center = error.center ?? error.pcb_center
      return center ? [center] : []
    }),
    ...fixed.map((violation) => violation.center),
  ]
  for (let aIndex = 0; aIndex < vias.length; aIndex++) {
    for (let bIndex = aIndex + 1; bIndex < vias.length; bIndex++) {
      const a = vias[aIndex]!
      const b = vias[bIndex]!
      if (a.owner === b.owner) continue
      if (a.maxZ < b.minZ || b.maxZ < a.minZ) continue
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (!contains(fixture.viewport, center)) continue
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const gap = distance - a.diameter / 2 - b.diameter / 2
      minimumViaEdgeGap = Math.min(minimumViaEdgeGap ?? Infinity, gap)
      if (gap < input.viaClearance - 1e-8) {
        viaPairViolationCount++
        focusPoints.push(center)
      }
    }
  }
  return {
    drcErrorCount: errors.length,
    viewportDrcErrorCount: errors.filter((error) => {
      const center = error.center ?? error.pcb_center
      return center !== undefined && contains(fixture.viewport, center)
    }).length,
    fixedObstacleViolationCount: fixed.length,
    minimumViaEdgeGap,
    viaPairViolationCount,
    targetViaTraceGap: measureHighlightedViaTrace(fixture, routes)?.gap ?? null,
    focusPoints: [
      ...new Map(
        focusPoints.map((point) => [
          `${point.x.toFixed(5)},${point.y.toFixed(5)}`,
          point,
        ]),
      ).values(),
    ],
  }
}

export function getClearanceReproGraphics(
  fixture: ClearanceVisualReproFixture,
  outputRoutes: HighDensityRoute[],
  outputLabel = "Projection candidate",
): GraphicsObject {
  const { input, viewport } = fixture
  const worldWidth = viewport.maxX - viewport.minX
  const worldHeight = viewport.maxY - viewport.minY
  if (worldWidth <= 0 || worldHeight <= 0)
    throw new Error("clearance snapshot viewport must have positive dimensions")
  const graphics: Required<
    Pick<
      GraphicsObject,
      "lines" | "rects" | "circles" | "polygons" | "texts" | "arrows"
    >
  > &
    GraphicsObject = {
    coordinateSystem: "screen",
    lines: [],
    arrows: [],
    rects: [
      {
        center: { x: width / 2, y: height / 2 },
        width,
        height,
        fill: "transparent",
        stroke: "none",
      },
    ],
    circles: [],
    polygons: [],
    texts: [],
  }
  const text = (x: number, y: number, value: string, fontSize = 14) => {
    graphics.texts.push({
      x,
      y,
      text: value,
      fontSize,
      color: "#0f172a",
      anchorSide: "center_left",
    })
  }
  text(24, 24, fixture.title.slice(0, 80), 22)
  text(24, 47, fixture.provenance.slice(0, 130), 12)
  const names = [
    ...new Set(
      input.routes.map(
        (route) => route.rootConnectionName ?? route.connectionName,
      ),
    ),
  ].sort()
  const visibleNames = names.filter((name) =>
    input.routes.some(
      (route) =>
        (route.rootConnectionName ?? route.connectionName) === name &&
        (route.route.some((point) => contains(viewport, point)) ||
          route.route.some(
            (point, index) =>
              index > 0 && clipLine(route.route[index - 1]!, point, viewport),
          )),
    ),
  )
  const focusPoints = measureClearanceRepro(
    fixture,
    input.routes,
  ).focusPoints.filter((point) => contains(viewport, point))
  const focusedNames = visibleNames.filter((name) =>
    input.routes.some(
      (route) =>
        (route.rootConnectionName ?? route.connectionName) === name &&
        getRepairViaGeometry(route, input.srj.layerCount).some((via) =>
          focusPoints.some(
            (point) =>
              Math.hypot(point.x - via.x, point.y - via.y) <=
              via.diameter / 2 + input.traceClearance * 2,
          ),
        ),
    ),
  )
  const legendNames = [
    ...focusedNames,
    ...visibleNames.filter((name) => !focusedNames.includes(name)),
  ]
  const colorNames = [
    ...legendNames,
    ...names.filter((name) => !visibleNames.includes(name)),
  ]
  const colors = new Map(
    colorNames.map((name, index) => [
      name,
      palette[index] ?? `hsl(${(index * 137.5) % 360},65%,42%)`,
    ]),
  )
  const colorFor = (route: HighDensityRoute) =>
    colors.get(route.rootConnectionName ?? route.connectionName) ?? palette[0]!
  const scale = Math.min(494 / worldWidth, 380 / worldHeight)

  for (const [panelIndex, routes, label] of [
    [0, input.routes, "Input"],
    [1, outputRoutes, outputLabel],
  ] as const) {
    const left = 24 + panelIndex * 546
    const toScreen = (point: Point): Point => ({
      x: left + 253 + (point.x - (viewport.minX + viewport.maxX) / 2) * scale,
      y: 320 - (point.y - (viewport.minY + viewport.maxY) / 2) * scale,
    })
    const drawDisk = (
      center: Point,
      radius: number,
      fill: string,
      stroke: string,
      layer?: string,
    ) => {
      if (
        center.x - radius >= viewport.minX &&
        center.x + radius <= viewport.maxX &&
        center.y - radius >= viewport.minY &&
        center.y + radius <= viewport.maxY
      ) {
        graphics.circles.push({
          center: toScreen(center),
          radius: radius * scale,
          fill,
          stroke,
          layer,
        })
        return
      }
      const outline = clipPolygon(
        Array.from({ length: 40 }, (_, index) => ({
          x: center.x + radius * Math.cos((index * Math.PI * 2) / 40),
          y: center.y + radius * Math.sin((index * Math.PI * 2) / 40),
        })),
        viewport,
      )
      if (outline.length >= 3)
        graphics.polygons.push({
          points: outline.map(toScreen),
          fill,
          stroke,
          layer,
        })
    }
    const layerZ = (layer: string): number =>
      layer === "top"
        ? 0
        : layer === "bottom"
          ? input.srj.layerCount - 1
          : Number(layer.slice(5))
    const drillDiameter =
      (
        input.srj as typeof input.srj & {
          minViaHoleDiameter?: number
          min_via_hole_diameter?: number
        }
      ).minViaHoleDiameter ??
      (input.srj as typeof input.srj & { min_via_hole_diameter?: number })
        .min_via_hole_diameter
    const measurements = measureClearanceRepro(fixture, routes)
    const target = measureHighlightedViaTrace(fixture, routes)
    text(left, 82, label, 18)
    text(
      left,
      105,
      `Focus DRC: ${measurements.viewportDrcErrorCount} · context: ${measurements.drcErrorCount} · fixed: ${measurements.fixedObstacleViolationCount}`,
    )
    if (target)
      text(
        left,
        123,
        `Target via/trace gap: ${formatGap(target.gap)} mm (${fixture.highlightViaTrace!.label})`,
        12,
      )
    graphics.rects.push({
      center: toScreen({
        x: (viewport.minX + viewport.maxX) / 2,
        y: (viewport.minY + viewport.maxY) / 2,
      }),
      width: worldWidth * scale,
      height: worldHeight * scale,
      fill: "transparent",
      stroke: "#cbd5e1",
    })

    for (const obstacle of input.srj.obstacles) {
      const shape = getLocalObstacleGeometry(obstacle)
      const angle = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
      const localPoints: Point[] =
        shape.type === "rect"
          ? [
              { x: shape.bounds.minX, y: shape.bounds.minY },
              { x: shape.bounds.maxX, y: shape.bounds.minY },
              { x: shape.bounds.maxX, y: shape.bounds.maxY },
              { x: shape.bounds.minX, y: shape.bounds.maxY },
            ]
          : Array.from({ length: 40 }, (_, index) => {
              const radians = (index * Math.PI * 2) / 40
              const cosine = Math.cos(radians)
              const sine = Math.sin(radians)
              const spine =
                cosine * (shape.b.x - shape.a.x) +
                  sine * (shape.b.y - shape.a.y) >=
                0
                  ? shape.b
                  : shape.a
              return {
                x: spine.x + shape.radius * cosine,
                y: spine.y + shape.radius * sine,
              }
            })
      const polygon = clipPolygon(
        localPoints.map((point) => ({
          x:
            obstacle.center.x +
            point.x * Math.cos(angle) -
            point.y * Math.sin(angle),
          y:
            obstacle.center.y +
            point.x * Math.sin(angle) +
            point.y * Math.cos(angle),
        })),
        viewport,
      )
      if (polygon.length < 3) continue
      graphics.polygons.push({
        points: polygon.map(toScreen),
        fill: "rgba(239,68,68,0.18)",
        stroke: "#b45353",
        strokeWidth: 0.7,
        layer: `z${(
          obstacle.zLayers ??
            obstacle.layers.map((layer) =>
              layer === "top"
                ? 0
                : layer === "bottom"
                  ? input.srj.layerCount - 1
                  : Number(layer.slice(5)),
            )
        ).join(",")}`,
      })
    }

    const drawSegment = (
      a: Point,
      b: Point,
      thickness: number,
      color: string,
      z: number,
      throughObstacle = false,
    ) => {
      const segment = clipLine(a, b, viewport)
      if (!segment) return
      graphics.lines.push({
        points: segment.map(toScreen),
        strokeWidth: thickness * scale,
        strokeColor:
          z !== 0 || throughObstacle
            ? color.startsWith("#")
              ? `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},0.72)`
              : color.replace("hsl(", "hsla(").replace(")", ",0.72)")
            : color,
        ...(z !== 0 || throughObstacle
          ? { strokeDash: throughObstacle ? "3 3" : "10 5" }
          : {}),
        layer: `z${z}`,
      })
    }
    for (const trace of input.srj.traces ?? []) {
      for (let index = 1; index < trace.route.length; index++) {
        const a = trace.route[index - 1]!
        const b = trace.route[index]!
        if (
          a.route_type === "wire" &&
          b.route_type === "wire" &&
          a.layer === b.layer
        )
          drawSegment(
            a,
            b,
            Math.max(a.width, b.width),
            "rgba(100,116,139,0.6)",
            layerZ(a.layer),
          )
      }
      for (const point of trace.route) {
        if (point.route_type !== "via") continue
        drawDisk(
          point,
          (point.via_diameter ?? input.srj.minViaDiameter ?? 0.3) / 2,
          "rgba(100,116,139,0.6)",
          "white",
          `z${layerZ(point.from_layer)},${layerZ(point.to_layer)}`,
        )
        if (drillDiameter) drawDisk(point, drillDiameter / 2, "white", "none")
      }
    }
    for (const [routeIndex, route] of routes.entries()) {
      const color = colorFor(route)
      for (let index = 1; index < route.route.length; index++) {
        const a = route.route[index - 1]! as RepairRoutePoint
        const b = route.route[index]! as RepairRoutePoint
        if (a.z !== b.z && a.toNextSegmentType !== "through_obstacle") continue
        drawSegment(
          a,
          b,
          Math.max(
            a.traceThickness ?? route.traceThickness,
            b.traceThickness ?? route.traceThickness,
          ),
          color,
          a.z,
          a.toNextSegmentType === "through_obstacle",
        )
      }
      const originalVias = getRepairViaGeometry(
        input.routes[routeIndex]!,
        input.srj.layerCount,
      )
      const resultVias = getRepairViaGeometry(route, input.srj.layerCount)
      for (const [viaIndex, via] of resultVias.entries()) {
        const originalVia = originalVias[viaIndex]
        if (
          panelIndex === 1 &&
          originalVia &&
          contains(viewport, via) &&
          contains(viewport, originalVia) &&
          Math.hypot(via.x - originalVia.x, via.y - originalVia.y) > 1e-6
        ) {
          drawDisk(
            originalVia,
            originalVia.diameter / 2,
            "rgba(148,163,184,0.12)",
            "#94a3b8",
          )
          graphics.arrows.push({
            start: toScreen(originalVia),
            end: toScreen(via),
            color: "#64748b",
          })
        }
        drawDisk(
          via,
          via.diameter / 2,
          color,
          "white",
          `z${via.layerSequence.join(",")}`,
        )
        if (drillDiameter) drawDisk(via, drillDiameter / 2, "white", "none")
      }
      const lockedPoints = input.routes[routeIndex]!.route.filter(
        (_, index) => input.lockedPointIndices[routeIndex]?.[index],
      )
      for (const point of route.route) {
        if (
          contains(viewport, point) &&
          lockedPoints.some(
            (locked) =>
              locked.x === point.x &&
              locked.y === point.y &&
              locked.z === point.z,
          )
        )
          graphics.circles.push({
            center: toScreen(point),
            radius: 2.5,
            fill: "white",
            stroke: color,
          })
      }
    }
    // Focus markers identify measured contacts, rather than guessed locations.
    for (const point of measurements.focusPoints) {
      if (!contains(viewport, point)) continue
      const center = toScreen(point)
      graphics.circles.push({
        center,
        radius: 13,
        fill: "transparent",
        stroke: "#dc2626",
      })
      graphics.lines.push({
        points: [
          { x: center.x - 5, y: center.y - 5 },
          { x: center.x + 5, y: center.y + 5 },
        ],
        strokeWidth: 1.5,
        strokeColor: "#dc2626",
      })
    }
    if (target) {
      const center = toScreen(target.center)
      graphics.circles.push({
        center,
        radius: 16,
        fill: "transparent",
        stroke: "#111827",
      })
      graphics.arrows.push({
        start: { x: left + 450, y: 123 },
        end: center,
        color: "#111827",
      })
    }
    text(
      left,
      539,
      measurements.minimumViaEdgeGap === null
        ? `Rules: trace ${input.traceClearance.toFixed(3)} mm · via ${input.viaClearance.toFixed(3)} mm`
        : `Min different-net via gap: ${formatGap(measurements.minimumViaEdgeGap)} mm · rule ${input.viaClearance.toFixed(3)} mm`,
      13,
    )
  }

  text(
    24,
    573,
    "Solid: top · dashed: other layers · gray: fixed copper / original via · red rings: measured contacts",
    12,
  )
  let legendX = 24
  for (const name of legendNames) {
    const label = name.length > 23 ? `${name.slice(0, 20)}...` : name
    const itemWidth = 32 + label.length * 7
    if (legendX + itemWidth > width - 24) break
    graphics.lines.push({
      points: [
        { x: legendX, y: 600 },
        { x: legendX + 18, y: 600 },
      ],
      strokeWidth: 3,
      strokeColor: colors.get(name)!,
    })
    text(legendX + 24, 600, label, 11)
    legendX += itemWidth
  }
  return graphics
}

export function renderClearanceRepro(
  fixture: ClearanceVisualReproFixture,
  outputRoutes: HighDensityRoute[],
  outputLabel?: string,
): string {
  return getSvgFromGraphicsObject(
    getClearanceReproGraphics(fixture, outputRoutes, outputLabel),
    { backgroundColor: "white", svgWidth: width, svgHeight: height },
  )
}

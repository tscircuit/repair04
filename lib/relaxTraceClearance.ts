import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import type { HighDensityRoute } from "high-density-repair03/lib"
import {
  getLocalObstacleGeometry,
  getLocalObstacleDistance,
  type ObstacleDistanceGeometry,
} from "./obstacleDistanceGeometry"
import { getNetRepresentatives } from "./getFixedObstacleViolations"
import type {
  Bounds,
  RepairRegionInput,
  RepairRoutePoint,
} from "./repairRegionTypes"

type Point = { x: number; y: number }
type Vertex = Point & {
  original: Point
  locked: boolean
  points: RepairRoutePoint[]
}
type Segment = {
  a: Vertex
  b: Vertex
  minZ: number
  maxZ: number
  radius: number
  net: string
  routeIndex: number
  via: boolean
}
type Contact = { s: number; t: number; x: number; y: number; distance: number }
type ViaPadConstraint = {
  center: Point
  cosine: number
  sine: number
  shape: ObstacleDistanceGeometry
  clearance: number
}
type PadContact = {
  segment: Segment
  corners: Point[]
}

const MAX_SWEEPS = 256
const MAX_DISPLACEMENT = 0.25

/** Closest points and their interpolation weights, including zero-length vias. */
function getContact(a: Point, b: Point, c: Point, d: Point): Contact {
  const ux = b.x - a.x,
    uy = b.y - a.y
  const vx = d.x - c.x,
    vy = d.y - c.y
  const wx = a.x - c.x,
    wy = a.y - c.y
  const aa = ux * ux + uy * uy,
    bb = ux * vx + uy * vy
  const cc = vx * vx + vy * vy,
    dd = ux * wx + uy * wy
  const ee = vx * wx + vy * wy,
    determinant = aa * cc - bb * bb
  let s =
    determinant > 1e-15
      ? Math.max(0, Math.min(1, (bb * ee - cc * dd) / determinant))
      : 0
  if (cc < 1e-15) s = aa > 1e-15 ? Math.max(0, Math.min(1, -dd / aa)) : 0
  let t = cc > 1e-15 ? (bb * s + ee) / cc : 0
  if (t < 0) {
    t = 0
    s = aa > 1e-15 ? Math.max(0, Math.min(1, -dd / aa)) : 0
  } else if (t > 1) {
    t = 1
    s = aa > 1e-15 ? Math.max(0, Math.min(1, (bb - dd) / aa)) : 0
  }
  const x = a.x + s * ux - c.x - t * vx
  const y = a.y + s * uy - c.y - t * vy
  return { s, t, x, y, distance: Math.hypot(x, y) }
}

/** Signed distance to the nearest face of a containing convex pad. */
function getInteriorPadContact(
  point: Point,
  corners: Point[],
): {
  x: number
  y: number
  depth: number
} | null {
  let contact = { x: 0, y: 0, depth: Infinity }
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!,
      b = corners[(i + 1) % corners.length]!
    const dx = b.x - a.x,
      dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    const x = dy / length,
      y = -dx / length
    const depth = -((point.x - a.x) * x + (point.y - a.y) * y)
    if (depth < 0) return null
    if (depth < contact.depth) contact = { x, y, depth }
  }
  return contact
}

/**
 * Project coupled clearance constraints without changing routing topology.
 * The caller must validate the resulting candidate before publishing it.
 * Fixed contacts, shared copper junctions, layer spans and widths are retained.
 * Target the requested clearances exactly: adding fixed slack can make a
 * narrow corridor that fits the copper and its clearances infeasible.
 */
export function relaxTraceClearance(
  input: RepairRegionInput & {
    traceClearance?: number
    viaClearance?: number
    allowViaMovement?: boolean
  },
): HighDensityRoute[] {
  const routes = structuredClone(input.routes)
  const nets = getNetRepresentatives(input.srj, routes)
  const traceClearance = input.traceClearance ?? 0.1
  const viaClearance = input.viaClearance ?? 0.1
  const mutable: Bounds = {
    minX: input.bounds.minX + input.boundaryMargin,
    maxX: input.bounds.maxX - input.boundaryMargin,
    minY: input.bounds.minY + input.boundaryMargin,
    maxY: input.bounds.maxY - input.boundaryMargin,
  }
  const vertices = new Map<string, Vertex>()
  const routeVertices = routes.map((route, ri): Vertex[] =>
    route.route.map((point, pi): Vertex => {
      const key = `${nets.get(route.connectionName)}:${point.x}:${point.y}`
      let vertex = vertices.get(key)
      if (!vertex) {
        vertex = {
          x: point.x,
          y: point.y,
          original: { x: point.x, y: point.y },
          locked: false,
          points: [],
        }
        vertices.set(key, vertex)
      }
      vertex.points.push(point)
      vertex.locked ||= Boolean(
        input.lockedPointIndices[ri]![pi] ||
          pi === 0 ||
          pi === route.route.length - 1 ||
          point.pcb_port_id ||
          point.insideJumperPad ||
          point.toNextSegmentType ||
          point.x <= mutable.minX ||
          point.x >= mutable.maxX ||
          point.y <= mutable.minY ||
          point.y >= mutable.maxY,
      )
      return vertex
    }),
  )
  const segments: Segment[] = []
  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri]!
    for (let pi = 1; pi < route.route.length; pi++) {
      const a = route.route[pi - 1]! as RepairRoutePoint,
        b = route.route[pi]! as RepairRoutePoint
      if (a.toNextSegmentType || a.insideJumperPad || b.insideJumperPad)
        continue
      const va = routeVertices[ri]![pi - 1]!,
        vb = routeVertices[ri]![pi]!
      const via = a.z !== b.z
      if (via && input.allowViaMovement !== true) va.locked = vb.locked = true
      segments.push({
        a: va,
        b: vb,
        minZ: Math.min(a.z, b.z),
        maxZ: Math.max(a.z, b.z),
        radius: via
          ? route.viaDiameter / 2
          : Math.max(
              a.traceThickness ?? route.traceThickness,
              b.traceThickness ?? route.traceThickness,
            ) / 2,
        net: nets.get(route.connectionName)!,
        routeIndex: ri,
        via,
      })
    }
  }
  const pairs: [Segment, Segment][] = []
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i]!
    for (let j = i + 1; j < segments.length; j++) {
      const b = segments[j]!
      if (a.net === b.net || a.maxZ < b.minZ || b.maxZ < a.minZ) continue
      const reach =
        a.radius +
        b.radius +
        Math.max(traceClearance, viaClearance) +
        2 * Math.SQRT2 * MAX_DISPLACEMENT
      if (segmentToSegmentMinDistance(a.a, a.b, b.a, b.b) <= reach)
        pairs.push([a, b])
    }
  }
  const padContacts: PadContact[] = []
  const viaPadConstraints = new Map<Vertex, ViaPadConstraint[]>()
  for (const obstacle of input.srj.obstacles) {
    const radians = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
    const cosine = Math.cos(radians),
      sine = Math.sin(radians)
    const obstacleNets = new Set(
      obstacle.connectedTo.map((name) => nets.get(name) ?? name),
    )
    const zs =
      (obstacle as typeof obstacle & { __zLayers?: number[] }).__zLayers ??
      obstacle.zLayers ??
      obstacle.layers.map((name): number =>
        name === "top"
          ? 0
          : name === "bottom"
            ? input.srj.layerCount - 1
            : Number(name.slice(5)),
      )
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(
      ([x, y]): Point => ({
        x:
          obstacle.center.x +
          (cosine * x! * obstacle.width) / 2 -
          (sine * y! * obstacle.height) / 2,
        y:
          obstacle.center.y +
          (sine * x! * obstacle.width) / 2 +
          (cosine * y! * obstacle.height) / 2,
      }),
    )
    for (const segment of segments) {
      if (
        (!segment.via && obstacleNets.has(segment.net)) ||
        !zs.some((z) => z >= segment.minZ && z <= segment.maxZ)
      )
        continue
      const reach =
        segment.radius +
        Math.max(
          traceClearance,
          viaClearance,
          input.srj.defaultObstacleMargin ?? 0,
          input.srj.minTraceToPadEdgeClearance ?? 0,
          input.srj.minViaEdgeToPadEdgeClearance ?? 0,
        ) +
        Math.SQRT2 * MAX_DISPLACEMENT
      if (
        Math.min(
          ...corners.map((a, i) =>
            segmentToSegmentMinDistance(
              segment.a,
              segment.b,
              a,
              corners[(i + 1) % 4]!,
            ),
          ),
        ) > reach
      )
        continue
      // Use the enclosing rectangle as a conservative routing constraint for
      // every pad shape. Physical via guards retain the exact obstacle shape.
      padContacts.push({ segment, corners })
      if (segment.via) {
        const constraint: ViaPadConstraint = {
          center: obstacle.center,
          cosine,
          sine,
          shape: getLocalObstacleGeometry(obstacle),
          clearance:
            segment.radius +
            Math.max(
              viaClearance,
              input.srj.defaultObstacleMargin ?? 0,
              input.srj.minViaEdgeToPadEdgeClearance ?? 0,
            ),
        }
        // Topology is unchanged by projection. Existing pad contact may move
        // toward clearance, but no step may worsen its original separation.
        const dx = segment.a.original.x - obstacle.center.x
        const dy = segment.a.original.y - obstacle.center.y
        const local = {
          x: dx * cosine + dy * sine,
          y: -dx * sine + dy * cosine,
        }
        constraint.clearance = Math.min(
          constraint.clearance,
          getLocalObstacleDistance(local, local, constraint.shape),
        )
        for (const vertex of new Set([segment.a, segment.b])) {
          const constraints = viaPadConstraints.get(vertex)
          if (constraints) constraints.push(constraint)
          else viaPadConstraints.set(vertex, [constraint])
        }
      }
    }
  }
  const project = (
    weights: [Vertex, number][],
    nx: number,
    ny: number,
    deficit: number,
  ): void => {
    const combined = new Map<Vertex, number>()
    for (const [vertex, weight] of weights) {
      if (!vertex.locked)
        combined.set(vertex, (combined.get(vertex) ?? 0) + weight)
    }
    const mass = [...combined.values()].reduce(
      (sum, weight) => sum + weight * weight,
      0,
    )
    if (mass < 1e-15) return
    const scale = Math.min(0.05, deficit * 0.7) / mass
    for (const [vertex, weight] of combined) {
      const x = Math.max(
        mutable.minX,
        vertex.original.x - MAX_DISPLACEMENT,
        Math.min(
          mutable.maxX,
          vertex.original.x + MAX_DISPLACEMENT,
          vertex.x + nx * scale * weight,
        ),
      )
      const y = Math.max(
        mutable.minY,
        vertex.original.y - MAX_DISPLACEMENT,
        Math.min(
          mutable.maxY,
          vertex.original.y + MAX_DISPLACEMENT,
          vertex.y + ny * scale * weight,
        ),
      )
      // Wire constraints must never move a via through a fixed solder pad.
      // Test its proposed position against every nearby pad before moving it.
      if (
        viaPadConstraints.get(vertex)?.some((pad): boolean => {
          const dx = x - pad.center.x,
            dy = y - pad.center.y
          const localX = dx * pad.cosine + dy * pad.sine
          const localY = -dx * pad.sine + dy * pad.cosine
          const local = { x: localX, y: localY }
          return (
            getLocalObstacleDistance(local, local, pad.shape) < pad.clearance
          )
        })
      )
        continue
      vertex.x = x
      vertex.y = y
    }
  }
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    for (const [a, b] of pairs) {
      const contact = getContact(a.a, a.b, b.a, b.b)
      const required =
        a.radius + b.radius + (a.via && b.via ? viaClearance : traceClearance)
      if (contact.distance >= required) continue
      // Crossings require rerouting; this operation only opens existing gaps.
      if (contact.distance < 1e-10) continue
      project(
        [
          [a.a, 1 - contact.s],
          [a.b, contact.s],
          [b.a, contact.t - 1],
          [b.b, -contact.t],
        ],
        contact.x / contact.distance,
        contact.y / contact.distance,
        required - contact.distance,
      )
    }
    for (const pad of padContacts) {
      const { segment, corners } = pad
      const required =
        segment.radius +
        Math.max(
          segment.via ? viaClearance : traceClearance,
          input.srj.defaultObstacleMargin ?? 0,
          segment.via
            ? (input.srj.minViaEdgeToPadEdgeClearance ?? 0)
            : (input.srj.minTraceToPadEdgeClearance ?? 0),
        )
      for (const vertex of new Set([segment.a, segment.b])) {
        const interior = getInteriorPadContact(vertex, corners)
        if (interior) {
          project(
            [[vertex, 1]],
            interior.x,
            interior.y,
            required + interior.depth,
          )
        }
      }
      const contact = corners
        .map((a, i) =>
          getContact(segment.a, segment.b, a, corners[(i + 1) % 4]!),
        )
        .reduce((a, b) => (a.distance < b.distance ? a : b))
      if (contact.distance < 1e-10) continue
      if (contact.distance >= required) continue
      project(
        [
          [segment.a, 1 - contact.s],
          [segment.b, contact.s],
        ],
        contact.x / contact.distance,
        contact.y / contact.distance,
        required - contact.distance,
      )
    }
  }
  for (const vertex of vertices.values()) {
    for (const point of vertex.points) {
      point.x = vertex.x
      point.y = vertex.y
    }
  }
  for (const route of routes) {
    route.vias = []
    for (let i = 1; i < route.route.length; i++) {
      const a = route.route[i - 1]!, b = route.route[i]!
      if (a.z !== b.z && a.toNextSegmentType !== "through_obstacle" &&
        !route.vias.some((via) => via.x === b.x && via.y === b.y)) {
        route.vias.push({ x: b.x, y: b.y })
      }
    }
  }
  return routes
}

import {
  segmentToBoundsMinDistance,
  segmentToSegmentMinDistance,
} from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { normalizeRepairTrace } from "./normalizeRepairTrace"
import type { Bounds, RepairRoutePoint } from "./repairRegionTypes"

type Point = RepairRoutePoint
type Barrier = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  radius: number
  viaOnly?: boolean
  a: Point
  b: Point
  rect?: { width: number; height: number; rotation: number }
}
type SearchNode = { id: number; cost: number; priority: number }

/** Clearance-aware routing between fixed anchors, using only cropped context. */
export function findClearancePath(input: {
  srj: SimpleRouteJson
  routes: HighDensityRoute[]
  routeIndex: number
  start: Point
  end: Point
  bounds: Bounds
  traceThickness: number
  traceClearance: number
  viaClearance: number
  gridSize?: number
  /** Disable layer changes when searching for a trace-only repair. */
  allowLayerChanges?: boolean
}): Point[] | null {
  const { srj, routes, routeIndex, start, end, bounds, traceThickness } = input
  if (input.allowLayerChanges === false && start.z !== end.z) return null
  const route = routes[routeIndex]!
  const parents = new Map<string, string>()
  const net = (name: string): string => {
    const parent = parents.get(name)
    if (parent === undefined || parent === name) return name
    const root = net(parent)
    parents.set(name, root)
    return root
  }
  const join = (names: Array<string | undefined>): void => {
    const present = names.filter((n): n is string => Boolean(n))
    if (!present.length) return
    const root = net(present[0]!)
    for (const name of present) parents.set(net(name), root)
  }
  for (const original of srj.connections) {
    const connection = original as typeof original & {
      __rootConnectionNames?: string[]
      __netConnectionName?: string
    }
    join([
      connection.name,
      connection.rootConnectionName,
      connection.netConnectionName,
      connection.__netConnectionName,
      ...(connection.mergedConnectionNames ?? []),
      ...(connection.__rootConnectionNames ?? []),
      ...connection.pointsToConnect.flatMap((p) => [p.pcb_port_id, p.pointId]),
    ])
  }
  for (const obstacle of srj.obstacles) join(obstacle.connectedTo)
  for (const r of routes) join([r.connectionName, r.rootConnectionName])
  const owner = net(route.connectionName)
  const layer = (name: string): number =>
    name === "top"
      ? 0
      : name === "bottom"
        ? srj.layerCount - 1
        : Number(name.slice(5))
  const barriers: Barrier[] = []
  const add = (
    a: Point,
    b: Point,
    radius: number,
    rect?: Barrier["rect"],
    viaOnly = false,
  ): void => {
    const extent = rect ? Math.hypot(rect.width, rect.height) / 2 : radius
    barriers.push({
      a,
      b,
      radius,
      rect,
      viaOnly,
      minX: Math.min(a.x, b.x) - extent,
      maxX: Math.max(a.x, b.x) + extent,
      minY: Math.min(a.y, b.y) - extent,
      maxY: Math.max(a.y, b.y) + extent,
      minZ: Math.min(a.z, b.z),
      maxZ: Math.max(a.z, b.z),
    })
  }
  for (const obstacle of srj.obstacles) {
    // A wire may enter its own pad, but a new via still needs pad clearance.
    const viaOnly = obstacle.connectedTo.some((name) => net(name) === owner)
    const zs =
      (obstacle as typeof obstacle & { __zLayers?: number[] }).__zLayers ??
      obstacle.zLayers ??
      obstacle.layers.map(layer)
    for (const z of zs)
      add(
        { ...obstacle.center, z },
        { ...obstacle.center, z },
        0,
        {
          width: obstacle.width,
          height: obstacle.height,
          rotation: ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180,
        },
        viaOnly,
      )
  }
  for (const other of routes) {
    if (net(other.connectionName) === owner) continue
    for (let i = 1; i < other.route.length; i++) {
      const a = other.route[i - 1]! as Point,
        b = other.route[i]! as Point
      if (a.toNextSegmentType === "through_obstacle") continue
      add(
        a,
        b,
        a.z !== b.z
          ? other.viaDiameter / 2
          : Math.max(
              a.traceThickness ?? other.traceThickness,
              b.traceThickness ?? other.traceThickness,
            ) / 2,
      )
    }
  }
  for (const raw of srj.traces ?? []) {
    if (net(raw.connection_name) === owner) continue
    const trace = normalizeRepairTrace(raw, srj.minTraceWidth)
    for (let i = 1; i < trace.route.length; i++) {
      const a = trace.route[i - 1]!,
        b = trace.route[i]!
      if (
        a.route_type === "wire" &&
        b.route_type === "wire" &&
        a.layer === b.layer
      )
        add(
          { x: a.x, y: a.y, z: layer(a.layer) },
          { x: b.x, y: b.y, z: layer(b.layer) },
          Math.max(a.width, b.width) / 2,
        )
      if (b.route_type === "via")
        add(
          { x: b.x, y: b.y, z: layer(b.from_layer) },
          { x: b.x, y: b.y, z: layer(b.to_layer) },
          (b.via_diameter ?? route.viaDiameter) / 2,
        )
    }
  }
  const cells = new Map<string, Barrier[]>()
  const queryReach =
    Math.max(route.viaDiameter, traceThickness) / 2 +
    Math.max(
      input.traceClearance,
      input.viaClearance,
      srj.defaultObstacleMargin ?? 0,
      srj.minTraceToPadEdgeClearance ?? 0,
      srj.minViaEdgeToPadEdgeClearance ?? 0,
    ) +
    1e-5
  for (const barrier of barriers) {
    for (
      let x = Math.floor(Math.max(barrier.minX, bounds.minX - queryReach));
      x <= Math.floor(Math.min(barrier.maxX, bounds.maxX + queryReach));
      x++
    )
      for (
        let y = Math.floor(Math.max(barrier.minY, bounds.minY - queryReach));
        y <= Math.floor(Math.min(barrier.maxY, bounds.maxY + queryReach));
        y++
      ) {
        const key = `${x},${y}`
        const bucket = cells.get(key)
        if (bucket) bucket.push(barrier)
        else cells.set(key, [barrier])
      }
  }
  const clear = (a: Point, b: Point): boolean => {
    const isVia = a.z !== b.z
    const radius = isVia ? route.viaDiameter / 2 : traceThickness / 2
    const margin = Math.max(
      isVia ? input.viaClearance : input.traceClearance,
      srj.defaultObstacleMargin ?? 0,
      isVia
        ? (srj.minViaEdgeToPadEdgeClearance ?? 0)
        : (srj.minTraceToPadEdgeClearance ?? 0),
    )
    const reach = radius + margin + 1e-5
    const seen = new Set<Barrier>()
    for (
      let x = Math.floor(Math.min(a.x, b.x) - reach);
      x <= Math.floor(Math.max(a.x, b.x) + reach);
      x++
    )
      for (
        let y = Math.floor(Math.min(a.y, b.y) - reach);
        y <= Math.floor(Math.max(a.y, b.y) + reach);
        y++
      )
        for (const barrier of cells.get(`${x},${y}`) ?? []) {
          if (barrier.viaOnly && !isVia) continue
          if (seen.has(barrier)) continue
          seen.add(barrier)
          if (
            barrier.maxZ < Math.min(a.z, b.z) ||
            barrier.minZ > Math.max(a.z, b.z)
          )
            continue
          let distance: number
          if (barrier.rect) {
            const { rotation, width, height } = barrier.rect
            const local = (p: Point): { x: number; y: number } => ({
              x:
                (p.x - barrier.a.x) * Math.cos(rotation) +
                (p.y - barrier.a.y) * Math.sin(rotation),
              y:
                -(p.x - barrier.a.x) * Math.sin(rotation) +
                (p.y - barrier.a.y) * Math.cos(rotation),
            })
            distance = segmentToBoundsMinDistance(local(a), local(b), {
              minX: -width / 2,
              maxX: width / 2,
              minY: -height / 2,
              maxY: height / 2,
            })
          } else
            distance =
              segmentToSegmentMinDistance(a, b, barrier.a, barrier.b) -
              barrier.radius
          const requiredGap = barrier.rect
            ? margin
            : isVia && barrier.minZ !== barrier.maxZ
              ? input.viaClearance
              : input.traceClearance
          if (distance < radius + requiredGap + 1e-5) return false
        }
    return true
  }
  if (!clear(start, start) || !clear(end, end)) return null
  const grid = input.gridSize ?? 0.1
  if (!Number.isFinite(grid) || grid <= 0)
    throw new Error("repair04: clearance grid size must be positive and finite")
  const nx = Math.floor((bounds.maxX - bounds.minX) / grid)
  const ny = Math.floor((bounds.maxY - bounds.minY) / grid)
  const point = (id: number): Point => ({
    x: bounds.minX + ((id % nx) + 0.5) * grid,
    y: bounds.minY + ((Math.floor(id / nx) % ny) + 0.5) * grid,
    z: Math.floor(id / (nx * ny)),
    traceThickness,
  })
  const idAt = (x: number, y: number, z: number): number =>
    (z * ny + y) * nx + x
  const idOf = (p: Point): number =>
    idAt(
      Math.max(0, Math.min(nx - 1, Math.floor((p.x - bounds.minX) / grid))),
      Math.max(0, Math.min(ny - 1, Math.floor((p.y - bounds.minY) / grid))),
      p.z,
    )
  const heuristic = (p: Point): number =>
    Math.hypot(p.x - end.x, p.y - end.y) + (p.z === end.z ? 0 : 1)
  const heap: SearchNode[] = []
  const push = (value: SearchNode): void => {
    heap.push(value)
    let i = heap.length - 1
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (heap[parent]!.priority <= value.priority) break
      heap[i] = heap[parent]!
      i = parent
    }
    heap[i] = value
  }
  const pop = (): SearchNode => {
    const first = heap[0]!,
      last = heap.pop()!
    if (heap.length) {
      let i = 0
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1
        if (
          child + 1 < heap.length &&
          heap[child + 1]!.priority < heap[child]!.priority
        )
          child++
        if (heap[child]!.priority >= last.priority) break
        heap[i] = heap[child]!
        i = child
      }
      heap[i] = last
    }
    return first
  }
  const costs = new Map<number, number>()
  const previous = new Map<number, number>()
  const startId = idOf(start),
    sx = startId % nx,
    sy = Math.floor(startId / nx) % ny
  for (let dx = -2; dx <= 2; dx++)
    for (let dy = -2; dy <= 2; dy++) {
      const x = sx + dx,
        y = sy + dy
      if (x < 0 || x >= nx || y < 0 || y >= ny) continue
      const id = idAt(x, y, start.z),
        p = point(id)
      if (!clear(start, p)) continue
      const cost = Math.hypot(p.x - start.x, p.y - start.y)
      costs.set(id, cost)
      previous.set(id, -1)
      push({ id, cost, priority: cost + heuristic(p) })
    }
  const edgeCache = new Map<string, boolean>()
  let expanded = 0
  while (heap.length && expanded++ < 30000) {
    const current = pop()
    if (current.cost !== costs.get(current.id)) continue
    const a = point(current.id)
    if (
      a.z === end.z &&
      Math.hypot(a.x - end.x, a.y - end.y) < grid * 3 &&
      clear(a, end)
    ) {
      const reversed: Point[] = [end]
      for (let id = current.id; id !== -1; id = previous.get(id)!)
        reversed.push(point(id))
      reversed.push(start)
      const path = reversed.reverse(),
        simplified: Point[] = [start]
      for (let i = 1; i < path.length; ) {
        let furthest = i
        if (path[i]!.z === simplified.at(-1)!.z) {
          for (let j = i + 1; j < path.length && path[j]!.z === path[i]!.z; j++)
            if (clear(simplified.at(-1)!, path[j]!)) furthest = j
        }
        simplified.push(path[furthest]!)
        i = furthest + 1
      }
      return simplified
    }
    const x = current.id % nx,
      y = Math.floor(current.id / nx) % ny
    const neighbors: number[] = []
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (
          (dx === 0 && dy === 0) ||
          x + dx < 0 ||
          x + dx >= nx ||
          y + dy < 0 ||
          y + dy >= ny
        )
          continue
        neighbors.push(idAt(x + dx, y + dy, a.z))
      }
    if (input.allowLayerChanges !== false) {
      for (let z = 0; z < srj.layerCount; z++)
        if (z !== a.z) neighbors.push(idAt(x, y, z))
    }
    for (const id of neighbors) {
      const b = point(id),
        cost =
          current.cost + (a.z === b.z ? Math.hypot(a.x - b.x, a.y - b.y) : 1)
      if (cost >= (costs.get(id) ?? Infinity)) continue
      const key =
        current.id < id ? `${current.id},${id}` : `${id},${current.id}`
      let permitted = edgeCache.get(key)
      if (permitted === undefined) {
        permitted = clear(a, b)
        edgeCache.set(key, permitted)
      }
      if (!permitted) continue
      costs.set(id, cost)
      previous.set(id, current.id)
      push({ id, cost, priority: cost + heuristic(b) })
    }
  }
  return null
}

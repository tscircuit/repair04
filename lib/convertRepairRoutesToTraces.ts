import type {
  HighDensityRoute,
  SimplifiedPcbTrace,
} from "high-density-repair03/lib"

/** Stable fragment ids let the local DRC engine target the owning route. */
export function convertRepairRoutesToTraces(
  routes: HighDensityRoute[],
  layerCount: number,
): SimplifiedPcbTrace[] {
  const layerName = (z: number): string =>
    z === 0 ? "top" : z === layerCount - 1 ? "bottom" : `inner${z}`
  return routes.map((route, index) => {
    const points: SimplifiedPcbTrace["route"] = []
    for (let i = 0; i < route.route.length; i++) {
      const point = route.route[i]!
      const previous = route.route[i - 1]
      if (
        previous &&
        previous.toNextSegmentType !== "through_obstacle" &&
        previous.z !== point.z &&
        previous.x === point.x &&
        previous.y === point.y
      ) {
        points.push({
          route_type: "via",
          x: point.x,
          y: point.y,
          from_layer: layerName(previous.z),
          to_layer: layerName(point.z),
          via_diameter: route.viaDiameter,
        })
      }
      // Both sides of every via need explicit wire vertices: the indexed DRC
      // engine evaluates adjacent wire vertices, including the departure leg.
      const thickness =
        (point as typeof point & { traceThickness?: number }).traceThickness ??
        route.traceThickness
      points.push({
        route_type: "wire",
        x: point.x,
        y: point.y,
        layer: layerName(point.z),
        width: thickness,
        ...(i === 0 && point.pcb_port_id
          ? { start_pcb_port_id: point.pcb_port_id }
          : {}),
        ...(i === route.route.length - 1 && point.pcb_port_id
          ? { end_pcb_port_id: point.pcb_port_id }
          : {}),
      })
    }
    return {
      type: "pcb_trace",
      pcb_trace_id: `repair04_${index}`,
      connection_name: route.rootConnectionName ?? route.connectionName,
      route: points,
    }
  })
}

import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import type { NegotiatedClearanceSearchInput } from "../../../lib/negotiatedClearanceSearchKernel"
import type { RepairRoutePoint } from "../../../lib/repairRegionTypes"
import { ClearancePathConnectivity } from "../../../lib/ClearancePathConnectivity"

export function getRvboyCircularViaView(
  task: NegotiatedClearanceSearchInput,
  path: RepairRoutePoint[],
  state: "before" | "after",
): string {
  const input = task.pathInput
  const start = input.start
  const net = new ClearancePathConnectivity(input.srj).createNetResolver(
    input.routes,
  )
  const owner = net(input.routes[input.routeIndex]!.connectionName)
  const minX = 1.45,
    maxX = 4.1,
    minY = 11.55,
    maxY = 13.8
  const graphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    rects: [
      {
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        width: maxX - minX,
        height: maxY - minY,
        fill: "none",
        stroke: "none",
        label: "viewport",
      },
    ],
    lines: [],
    circles: [],
  }
  // The complete recorded search is retained. Crop only this view, around the circular ground via and the blocked bottom-layer anchor.
  for (const [ri, route] of input.routes.entries()) {
    if (ri === input.routeIndex || net(route.connectionName) === owner) continue
    for (let i = 1; i < route.route.length; i++) {
      const a = route.route[i - 1]! as RepairRoutePoint,
        b = route.route[i]! as RepairRoutePoint
      if (a.z !== 3 || b.z !== 3) continue
      const width = Math.max(
        a.traceThickness ?? route.traceThickness,
        b.traceThickness ?? route.traceThickness,
      )
      graphics.lines!.push(
        {
          points: [a, b],
          strokeWidth: width + input.traceThickness + 2 * input.traceClearance,
          strokeColor: "#ef444433",
        },
        { points: [a, b], strokeWidth: width, strokeColor: "#64748b" },
      )
      if (a.x === b.x && a.y === b.y)
        graphics.circles!.push(
          { center: a, radius: width / 2, fill: "#64748b", stroke: "none" },
          {
            center: a,
            radius: (width + input.traceThickness) / 2 + input.traceClearance,
            fill: "#ef444422",
            stroke: "none",
          },
        )
    }
  }
  for (const obstacle of input.srj.obstacles) {
    if (!obstacle.layers.includes("bottom")) continue
    const margin = input.traceThickness / 2 + input.traceClearance
    if (obstacle.shape === "circle") {
      if (state === "before") {
        graphics.rects!.push({
          center: obstacle.center,
          width: obstacle.width + 2 * margin,
          height: obstacle.height + 2 * margin,
          fill: "#ef444433",
          stroke: "#dc2626",
        })
      } else {
        graphics.circles!.push({
          center: obstacle.center,
          radius: obstacle.width / 2 + margin,
          fill: "#ef444433",
          stroke: "#dc2626",
        })
      }
      graphics.circles!.push({
        center: obstacle.center,
        radius: obstacle.width / 2,
        fill: "#64748b",
        stroke: "none",
      })
    } else {
      graphics.rects!.push({
        center: obstacle.center,
        width: obstacle.width,
        height: obstacle.height,
        fill: "#64748b",
        stroke: "none",
      })
    }
  }
  for (let i = 1; i < path.length; i++)
    if (path[i - 1]!.z === 3 && path[i]!.z === 3)
      graphics.lines!.push({
        points: [path[i - 1]!, path[i]!],
        strokeWidth: input.traceThickness,
        strokeColor: "#16a34a",
      })
  graphics.circles!.push({
    center: start,
    radius: 0.015,
    fill: "#2563eb",
    stroke: "none",
  })
  const svg = getSvgFromGraphicsObject(graphics, {
    backgroundColor: "white",
    svgWidth: 800,
    svgHeight: 800,
    includeTextLabels: false,
  })
  const frame = svg.match(/<rect\b[^>]*data-label="viewport"[^>]*\/>/)
  if (!frame) throw new Error("Missing RVboy viewport")
  const coordinates = ["x", "y", "width", "height"].map((key) => {
    const match = frame[0].match(new RegExp(`\\s${key}="([^"]+)"`))
    if (!match) throw new Error(`Missing viewport ${key}`)
    return Number(match[1])
  })
  const cropped = svg.replace(
    /<svg\b[^>]*>/,
    `<svg x="0" y="80" width="800" height="800" viewBox="${coordinates.join(" ")}" overflow="hidden" xmlns="http://www.w3.org/2000/svg">`,
  )
  return `<svg width="800" height="880" viewBox="0 0 800 880" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="20" y="28" font-family="sans-serif" font-size="20">RVboy: preserve the circular ground-via clearance</text><text x="20" y="55" font-family="sans-serif" font-size="16">${state === "before" ? "Before: rectangle approximation blocks the legal blue anchor; zero search nodes" : "After: circular clearance admits the anchor and the green route"}</text>${cropped}</svg>`
}

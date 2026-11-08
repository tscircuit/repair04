import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import type { PairedClearancePathInput } from "../../../lib/PairedClearancePathSolver"
import type { RepairRoutePoint } from "../../../lib/repairRegionTypes"
import source from "./source.json"

export function getRvboyShallowClearanceView(
  input: PairedClearancePathInput,
  path: RepairRoutePoint[],
  state: "before" | "after",
): string {
  const { minX, maxX, minY, maxY } = source.viewbox
  const target = input.task.pathInput.routes[input.task.pathInput.routeIndex]!
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
  for (const copper of input.task.coppers) {
    if (copper.owner === input.task.selectedOwner) continue
    const highlight = copper.owner === "source_net_74"
    if (copper.a.z !== copper.b.z)
      graphics.circles!.push({
        center: copper.a,
        radius: copper.radius,
        fill: "#cbd5e1",
        stroke: "none",
      })
    else if (copper.minZ === 3)
      graphics.lines!.push({
        points: [copper.a, copper.b],
        strokeColor: highlight ? "#ef4444" : "#cbd5e1",
        strokeWidth: copper.radius * 2,
      })
  }
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!,
      b = path[i]!
    if (a.z === b.z)
      graphics.lines!.push({
        points: [a, b],
        strokeColor: a.z === 0 ? "#2563eb" : "#059669",
        strokeWidth: target.traceThickness,
      })
    else
      graphics.circles!.push(
        {
          center: a,
          radius: target.viaDiameter / 2,
          fill: "#60a5fa",
          stroke: "#1d4ed8",
        },
        {
          center: a,
          radius: input.task.pathInput.viaHoleDiameter! / 2,
          fill: "white",
          stroke: "none",
        },
      )
  }
  graphics.circles!.push({
    center: { x: 5.875, y: 18.275 },
    radius: 0.7,
    fill: "none",
    stroke: "#dc2626",
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
  return `<svg width="800" height="880" viewBox="0 0 800 880" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="20" y="28" font-family="sans-serif" font-size="20">RVboy: shallow clearance must still incur a routing cost</text><text x="20" y="55" font-family="sans-serif" font-size="16">${state === "before" ? "Before: via gap 0.099817 mm; required 0.100000 mm" : "After: via detour clears the signal; no copper conflicts"}</text>${cropped}</svg>`
}

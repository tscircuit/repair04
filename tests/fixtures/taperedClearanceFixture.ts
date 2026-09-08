import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import type { Repair04SolverInput } from "../../lib/Repair04Solver"
import type { RepairRoutePoint } from "../../lib/repairRegionTypes"

export const makeTaperedClearanceInput = (): Repair04SolverInput => {
  // Four consecutive vertices and the adjacent pad from SRJ33 sample004.
  // The two internal bends must move together; endpoint and width edits are
  // unnecessary. Full-board reproduction lives in the PR validation evidence.
  const route: RepairRoutePoint[] = [
    {
      x: -1.5641231147677717,
      y: -2.520505529440414,
      z: 0,
      traceThickness: 0.18897317564023802,
    },
    {
      x: -1.5177966918973158,
      y: -2.474254037565495,
      z: 0,
      traceThickness: 0.18213210116929335,
    },
    {
      x: -1.4825694438376706,
      y: -2.452939381040713,
      z: 0,
      traceThickness: 0.177946351280476,
    },
    {
      x: -1.3940422507399868,
      y: -2.4163966056781896,
      z: 0,
      traceThickness: 0.166919526920714,
    },
  ]
  const routes: HighDensityRoute[] = [
    {
      connectionName: "tapered-signal",
      traceThickness: 0.2,
      viaDiameter: 0.6,
      route,
      vias: [],
    },
  ]
  const srj: SimpleRouteJson = {
    bounds: { minX: -6.66743, minY: -8.099995, maxX: 3.33257, maxY: 1.900005 },
    layerCount: 2,
    minTraceWidth: 0.1,
    connections: [{ name: "tapered-signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        width: 0.1500124,
        height: 0.6500114,
        center: { x: -1.6748720000000001, y: -1.9999900000000004 },
        layers: ["top"],
        connectedTo: ["pcb_smtpad_foreign", "foreign-net"],
      },
    ],
  }
  return {
    srj,
    routes,
    bounds: srj.bounds,
    boundaryMargin: 0.8,
    lockedPointIndices: [[true, false, false, true]],
    allowLayerChanges: false,
  }
}

export const makeTaperedPolylineInput = (): Repair04SolverInput => {
  const input = makeTaperedClearanceInput()
  const route = input.routes[0]!
  route.route = [
    {
      x: -1.6718505005257336,
      y: -2.6505605147833267,
      z: 0,
      traceThickness: 0.2,
    } as RepairRoutePoint,
    ...route.route,
    {
      x: -1.378925005065849,
      y: -2.4142577630815043,
      z: 0,
      traceThickness: 0.16516225833229548,
    } as RepairRoutePoint,
  ]
  input.lockedPointIndices = [[true, false, false, false, false, true]]
  return input
}

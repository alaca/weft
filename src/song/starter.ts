export const STARTER = `// Night bus
setcpm(124/4)

drums: s("bd*4, [~ cp]*2, hh(5,8)")
  .bank("RolandTR909")
  .degradeBy(slider(0.15, 0, 1))
  .lastOf(4, x => x.rev())

bass: note("d2 ~ d2 f2 ~ d2 a1 [c2 d2]")
  .s("sawtooth")
  .lpf(slider(1200, 200, 4000))
  .lpq(slider(14, 0, 30))
  .lpenv(3).decay(.18)

chords: n("<[0,2,4,6] [-2,0,2,4] [3,5,7,9] [1,3,5,7]>")
  .scale("D:minor").s("gm_epiano1")
  .room(slider(0.4, 0, 1))

_lead: n("0 [2 4] <7 6> [~ 4]")
  .scale("D4:minor").s("triangle")
  .delay(.4)
`

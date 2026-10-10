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

chords: note("<[d3,f3,a3,c4] [a#2,d3,f3,a3] [g3,a#3,d4,f4] [e3,g3,a#3,d4]>")
  .s("gm_epiano1")
  .room(slider(0.4, 0, 1))

_lead: note("d4 [f4 a4] <d5 c5> [~ a4]")
  .s("triangle")
  .delay(.4)
`

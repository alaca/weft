declare name "pluck";
declare description "A plucked string: a burst of noise rings in a delay as long as the note.";
import("stdfaust.lib");

freq = hslider("freq", 220, 20, 4000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
damp = hslider("damp", 0.3, 0, 1, 0.01);
bright = hslider("bright", 0.6, 0, 1, 0.01);

excite = no.noise * en.ar(0.0005, 0.004 + bright * 0.02, gate) : fi.lowpass(1, 600 + bright * 9000);
process = pm.ks(pm.f2l(freq), damp, excite) * gain * 0.12 <: _, _;

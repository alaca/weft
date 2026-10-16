declare name "ladder";
declare description "A bass through a resonant ladder filter that sweeps open on each note.";
import("stdfaust.lib");

freq = hslider("freq", 110, 20, 4000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
cutoff = hslider("cutoff", 0.3, 0, 1, 0.001);
res = hslider("res", 0.5, 0, 1, 0.01);
sweep = hslider("sweep", 0.5, 0, 1, 0.01);
drive = hslider("drive", 0.3, 0, 1, 0.01);

amp = en.adsr(0.002, 0.3, 0.6, 0.08, gate);
opens = en.adsr(0.001, 0.2, 0, 0.1, gate);
corner = min(18000, 30 * pow(2, cutoff * 8.5 + sweep * opens * 4));
source = os.sawtooth(freq) * 0.7 + os.square(freq * 0.5) * 0.3;
filtered = source : ve.moogLadder(corner / (ma.SR / 2), 0.707 + res * 17);
process = ma.tanh(filtered * (1 + drive * 6)) / (1 + drive) * amp * gain * 5 <: _, _;

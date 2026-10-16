declare name "mallets";
declare description "A marimba: a wooden bar over a tube, struck with a mallet, worked out as the real thing rings.";
import("stdfaust.lib");

freq = hslider("freq", 440, 20, 4000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
mallet = hslider("mallet", 0.5, 0, 1, 0.01);
spot = hslider("spot", 1, 0, 4, 1);

process = pm.marimba(freq, spot, 1500 + mallet * 9000, 0.1 + mallet * 0.6, gain, gate) * 0.9 <: _, _;

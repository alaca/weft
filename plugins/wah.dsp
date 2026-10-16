declare name "wah";
declare description "A wah pedal rocked back and forth by itself.";
import("stdfaust.lib");

speed = hslider("speed", 2, 0.1, 10, 0.01);
depth = hslider("depth", 0.8, 0, 1, 0.01);
mix = hslider("mix", 1, 0, 1, 0.01);

position = 0.15 + 0.75 * depth * (0.5 + 0.5 * os.osc(speed));
wah = _ <: ve.crybaby(position) * mix * 2.5 + _ * (1 - mix);
process = wah, wah;

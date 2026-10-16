declare name "epiano";
declare description "An electric piano: a struck tine heard through a pickup, its tone made by FM.";
import("stdfaust.lib");

freq = hslider("freq", 220, 20, 4000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
bell = hslider("bell", 0.4, 0, 1, 0.01);
time = hslider("time", 2, 0.3, 8, 0.01);
trem = hslider("trem", 0.2, 0, 1, 0.01);

body = en.adsr(0.002, time, 0, 0.25, gate);
bite = en.adsr(0.001, 0.2 + bell * 0.5, 0, 0.1, gate);
modulator = os.osc(freq) * freq * (0.3 + bell * 2.7) * bite;
ping = os.osc(freq * 14) * 0.06 * bell * en.ar(0.0005, 0.03, gate);
tremolo = 1 - trem * 0.25 * (1 + os.osc(5.5));
process = (os.osc(freq + modulator) + ping) * body * tremolo * gain * 0.09 <: _, _;

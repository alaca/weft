declare name "flanger";
declare description "A flanger: the sound beside a copy of itself a few thousandths of a second late, the gap sweeping.";
import("stdfaust.lib");

speed = hslider("speed", 0.3, 0.02, 5, 0.01);
depth = hslider("depth", 0.7, 0, 1, 0.01);
feedback = hslider("feedback", 0.5, 0, 0.95, 0.01);
mix = hslider("mix", 0.6, 0, 1, 0.01);

late(rate) = (0.0005 + 0.004 * (0.5 + 0.5 * os.osc(rate))) * ma.SR;
wet = pf.flanger_stereo(2048, late(speed), late(speed * 1.03), depth, feedback, 0);
process = _, _ <: (*(1 - mix), *(1 - mix)), (wet : *(mix * 2), *(mix * 2)) :> _, _;

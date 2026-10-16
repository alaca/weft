declare name "tape";
declare description "A tape echo: each repeat a little darker, a little rougher, and wobbling as old tape does.";
import("stdfaust.lib");

time = hslider("time", 0.35, 0.02, 1.5, 0.001);
feedback = hslider("feedback", 0.45, 0, 0.95, 0.01);
wow = hslider("wow", 0.3, 0, 1, 0.01);
mix = hslider("mix", 0.35, 0, 1, 0.01);

longest = 131072;
drift = wow * (0.002 * os.osc(0.6) + 0.0006 * os.osc(5.3));
echo(spread) = (+ : de.fdelay(longest, min(longest - 2, (time * spread + drift) * ma.SR))) ~ (*(feedback) : fi.lowpass(1, 3200) : fi.highpass(1, 120) : ma.tanh);
side(spread) = _ <: *(1 - mix), echo(spread) * mix :> _;
process = side(1), side(1.07);

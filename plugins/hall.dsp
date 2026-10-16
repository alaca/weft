declare name "hall";
declare description "A large hall: a long, smooth reverb, after a short wait.";
import("stdfaust.lib");

decay = hslider("decay", 3, 0.5, 12, 0.01);
wait = hslider("wait", 30, 0, 120, 0.1);
dark = hslider("dark", 0.4, 0, 1, 0.01);
mix = hslider("mix", 0.35, 0, 1, 0.01);

wet = re.zita_rev1_stereo(wait, 200, 8000 - dark * 6500, decay * 1.2, decay, 96000);
process = _, _ <: (*(1 - mix), *(1 - mix)), (wet : *(mix), *(mix)) :> _, _;

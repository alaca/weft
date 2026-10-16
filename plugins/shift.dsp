declare name "shift";
declare description "A pitch shifter: the sound moved up or down by a number of semitones, beside itself.";
import("stdfaust.lib");

semitones = hslider("semitones", 12, -24, 24, 0.01);
mix = hslider("mix", 0.5, 0, 1, 0.01);

side = _ <: *(1 - mix), (ef.transpose(2048, 512, semitones) * mix) :> _;
process = side, side;

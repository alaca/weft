import { PLUGINS } from '../plugins/list'

// The names a song may use, as they were in Strudel 1.2.6 with the modules this app loads. The list is
// written out and not read from Strudel as the app runs, so that a new version of Strudel cannot
// add to what a song from someone else is allowed to do without this file being looked at.
//
// Left out on purpose: everything that reaches outside the song (loading samples from an
// address, styles, the screen, the engine's own insides, text that is run as code). Also left
// out, after others tried to get past the check: speech (`speak`); the drawings that would cover
// the whole window or draw what they are told (`fscope`, `draw`, `onPaint`, `animate`); `as`,
// which makes a value's name out of text; and `apply` and `bind`, which are also the names of what
// every JavaScript function has. `pianoroll`, `scope` and the others with a small twin are drawn
// small inside the code, the same as their `_` forms (see engine/pictures.ts), and stay.
const words = (lines: string[]): string[] => lines.join(' ').split(' ')

// What Strudel offers both as a function and as a step in a chain: note("c").fast(2), fast(2, note("c")).
const BOTH = words([
    '_mod accelerate ad add adsr almostAlways almostNever always amp anchor and angle applyN ar arp arpWith asym att attack band bandf bandq bank',
    'beat begin bgain binshift bite bjork blshift bmod bor bp bpa bpattack bpd bpdc bpdecay bpdepth bpdepthfreq bpdepthfrequency bpe bpenv bpf bpq bpr',
    'bprate bprelease bps bpshape bpskew bpsustain bpsync brak brshift bus busgain bxor bypass cat ccn ccv ceil ch channel channels chebyshev choose chop',
    'chord chorus chunk chunkBack chunkBackInto chunkInto chunkback chunkbackinto chunkinto clip coarse color comb compress compressSpan compressor',
    'compressorAttack compressorKnee compressorRatio compressorRelease compressspan contract control cpm cps crush ctf ctlNum ctranspose cubic curve cut',
    'cutoff dec decay degrade degradeBy degradeByWith degree delay delayfb delayfeedback delayspeed delaysync delayt delaytime deltaSlide det detune dfb',
    'dict dictionary diode dist distort distorttype distortvol div djf drive drop dry ds dt duck duckattack duckdepth duckonset dur duration early echo',
    'echoWith echowith eish end enhance env eq eqt euclid euclidLegato euclidLegatoRot euclidRot euclidish euclidrot every expand extend fadeInTime',
    'fadeOutTime fadeTime fanchor fast fastChunk fastGap fastcat fastchunk fastgap fill filter filterWhen firstOf fit floor fm fm1 fm2 fm3 fm4 fm5 fm6 fm7',
    'fm8 fmatt fmatt1 fmatt2 fmatt3 fmatt4 fmatt5 fmatt6 fmatt7 fmatt8 fmattack fmattack1 fmattack2 fmattack3 fmattack4 fmattack5 fmattack6 fmattack7',
    'fmattack8 fmdec fmdec1 fmdec2 fmdec3 fmdec4 fmdec5 fmdec6 fmdec7 fmdec8 fmdecay fmdecay1 fmdecay2 fmdecay3 fmdecay4 fmdecay5 fmdecay6 fmdecay7',
    'fmdecay8 fmenv fmenv1 fmenv2 fmenv3 fmenv4 fmenv5 fmenv6 fmenv7 fmenv8 fmh fmh1 fmh2 fmh3 fmh4 fmh5 fmh6 fmh7 fmh8 fmi fmi1 fmi2 fmi3 fmi4 fmi5 fmi6',
    'fmi7 fmi8 fmrel fmrel1 fmrel2 fmrel3 fmrel4 fmrel5 fmrel6 fmrel7 fmrel8 fmrelease fmrelease1 fmrelease2 fmrelease3 fmrelease4 fmrelease5 fmrelease6',
    'fmrelease7 fmrelease8 fmsus fmsus1 fmsus2 fmsus3 fmsus4 fmsus5 fmsus6 fmsus7 fmsus8 fmsustain fmsustain1 fmsustain2 fmsustain3 fmsustain4 fmsustain5',
    'fmsustain6 fmsustain7 fmsustain8 fmwave fmwave1 fmwave2 fmwave3 fmwave4 fmwave5 fmwave6 fmwave7 fmwave8 focusSpan focusspan fold freeze freq',
    'fromBipolar fshift fshiftnote fshiftphase ftype func fxr gain gat gate grow gt gte h hard harmonic hbrick hcutoff hold hours hp hpa hpattack hpd hpdc',
    'hpdecay hpdepth hpdepthfreq hpdepthfrequency hpe hpenv hpf hpq hpr hprate hprelease hps hpshape hpskew hpsustain hpsync hresonance hsl hsla hurry hush',
    'imag inhabit inhabitmod innerBind inside inv invert ir irbegin iresponse irspeed iter iterBack iterback jux juxBy juxby kcutoff keep keepif keyDown',
    'krush lastOf late lbrick legato leslie lfo linger lock loop loopAt loopAtCps loopBegin loopEnd loopat loopatcps loopb loope lp lpa lpattack lpd lpdc',
    'lpdecay lpdepth lpdepthfreq lpdepthfrequency lpe lpenv lpf lpq lpr lprate lprelease lps lpshape lpskew lpsustain lpsync lrate lsize lt lte mask',
    'midibend midichan midicmd midimap midiport miditouch minutes mod mode moveXY mtranspose mul n ne net never noise note nrpnn nrpv nudge oct octave',
    'octaveR octaves octer octersub octersubsub off offset often or orbit outerBind outside overgain overshape pace palindrome pan panchor panorient',
    'panspan pansplay panwidth partials patt pattack pcurve pdec pdecay penv ph phasdp phaser phasercenter phaserdepth phaserrate phasersweep phases phc',
    'phd phs pick pickF pickOut pickReset pickRestart pickSqueeze pickmod pickmodF pickmodOut pickmodReset pickmodRestart pickmodSqueeze',
    'pitchJump pitchJumpTime ply plyForEach plyWith polyBind polyTouch postgain pow prel prelease press pressBy progNum psus psustain pw pwrate',
    'pwsweep r range range2 rangex rarely ratio rdim real rel release removeUndefineds repeatCycles replicate rescale resonance rev revv rfade rib ribbon',
    'ring ringdf ringf rlp room roomdim roomfade roomlp roomsize rootNotes round rsize s s_add s_contract s_expand s_extend s_polymeter s_sub s_taper',
    's_taperlist s_tour s_zip scale scaleTrans scaleTranspose scram scramble scrub seconds seed seg segment semitone seq sequence set shape shrink',
    'shrinklist shuffle sinefold size slice slide slow slowChunk slowcat slowchunk smear soft someCycles someCyclesBy sometimes sometimesBy sound sparsity',
    'speed splice spread squeeze squeezeBind squiz stack stepBind steps stepsPerOctave strans stretch striate struct stut stutWith stutwith sub',
    'superimpose sus sustain sustainpedal swing swingBy sysex sysexdata sysexid sz take timeline toBipolar tour trans transient transpose trem tremolo',
    'tremolodepth tremolophase tremoloshape tremoloskew tremolosync triode tsdelay undegrade undegradeBy unison unit v val vel velocity vib vibmod vibrato',
    'vmod voice voicing voicings vowel w warp warpatt warpattack warpdc warpdec warpdecay warpdepth warpenv warpmode warprate warprel warprelease warpshape',
    'warpskew warpsus warpsustain warpsync waveloss wavetablePhaseRand wavetablePosition wavetableWarp wavetableWarpMode when whenKey withValue within wt',
    'wtatt wtattack wtdc wtdec wtdecay wtdepth wtenv wtphaserand wtrate wtrel wtrelease wtshape wtskew wtsus wtsustain wtsync x xfade xsdelay y zcrush',
    'zdelay zmod znoise zoom zoomArc zoomIn zoomarc zrand zzfx',
])

// What is only a step in a chain.
const CHAINED = words([
    '_ad _add _adsr _almostAlways _almostNever _always _and _apply _applyN _ar _arp _arpWith _as _band _beat _bite _bjork _blshift _bor _brshift _bxor',
    '_bypass _chop _chunk _chunkBack _chunkBackInto _chunkInto _chunkback _chunkbackinto _chunkinto _compress _compressSpan _compressspan _contract',
    '_control _cpm _degradeBy _degradeByWith _density _div _drop _ds _early _echo _echoWith _echowith _eish _eq _eqt _euclid _euclidLegato _euclidLegatoRot',
    '_euclidRot _euclidish _euclidrot _every _expand _extend _fast _fastChunk _fastGap _fastchunk _fastgap _filter _filterWhen _firstOf _focus _focusSpan',
    '_focusspan _func _grow _gt _gte _hsl _hsla _hurry _inhabit _inhabitmod _inside _iter _iterBack _iterback _jux _juxBy _juxby _keep _keepif _lastOf',
    '_late _linger _log2 _loopAt _loopAtCps _loopat _loopatcps _lt _lte _moveXY _mul _ne _net _never _off _often _opIn _opMix _opOut _opPoly _opReset',
    '_opRestart _opSqueeze _opSqueezeOut _or _outside _pace _pianoroll _pick _pickF _pickOut _pickReset _pickRestart _pickSqueeze _pickmod _pickmodF',
    '_pickmodOut _pickmodReset _pickmodRestart _pickmodSqueeze _pitchwheel _ply _plyForEach _plyWith _plyforeach _plywith _pow _pressBy _punchcard _range',
    '_range2 _rangex _rarely _repeatCycles _replicate _rescale _rib _ribbon _rootNotes _scale _scaleTrans _scaleTranspose _scope _scramble _scrub _seed',
    '_seg _segment _set _shrink _shuffle _slice _slow _slowChunk _slowchunk _someCycles _someCyclesBy _sometimes _sometimesBy _sparsity _spectrum',
    '_spiral _splice _steps _strans _striate _stut _stutWith _stutwith _sub _swing _swingBy _sysex _take _timeline _trans _transpose _undegradeBy _voicings',
    '_when _whenKey _within _zoom _zoomArc _zoomIn _zoomarc appBoth appLeft appRight appWhole asNumber bindWhole choose2 d1 d2 d3 d4 d5 d6 d7 d8 d9 density',
    'discreteOnly disttype distvol duckatt duckons duckorbit filterValues fm00 fm01 fm02 fm03 fm04 fm05 fm06 fm07 fm08 fm10 fm11 fm12 fm13 fm14 fm15 fm16',
    'fm17 fm18 fm20 fm21 fm22 fm23 fm24 fm25 fm26 fm27 fm28 fm30 fm31 fm32 fm33 fm34 fm35 fm36 fm37 fm38 fm40 fm41 fm42 fm43 fm44 fm45 fm46 fm47 fm48 fm50',
    'fm51 fm52 fm53 fm54 fm55 fm56 fm57 fm58 fm60 fm61 fm62 fm63 fm64 fm65 fm66 fm67 fm68 fm70 fm71 fm72 fm73 fm74 fm75 fm76 fm77 fm78 fm80 fm81 fm82 fm83',
    'fm84 fm85 fm86 fm87 fm88 fmap fmi00 fmi01 fmi02 fmi03 fmi04 fmi05 fmi06 fmi07 fmi08 fmi10 fmi11 fmi12 fmi13 fmi14 fmi15 fmi16 fmi17 fmi18 fmi20 fmi21',
    'fmi22 fmi23 fmi24 fmi25 fmi26 fmi27 fmi28 fmi30 fmi31 fmi32 fmi33 fmi34 fmi35 fmi36 fmi37 fmi38 fmi40 fmi41 fmi42 fmi43 fmi44 fmi45 fmi46 fmi47 fmi48',
    'fmi50 fmi51 fmi52 fmi53 fmi54 fmi55 fmi56 fmi57 fmi58 fmi60 fmi61 fmi62 fmi63 fmi64 fmi65 fmi66 fmi67 fmi68 fmi70 fmi71 fmi72 fmi73 fmi74 fmi75 fmi76',
    'fmi77 fmi78 fmi80 fmi81 fmi82 fmi83 fmi84 fmi85 fmi86 fmi87 fmi88 focus hasSteps in innerJoin into join layer log2 maskAll mix modulate',
    'onsetsOnly out outerJoin p p1 p2 p3 p4 p5 p6 p7 p8 p9 plyforeach plywith poly q q1 q2 q3 q4 q5 q6 q7 q8 q9 reset resetAll resetJoin restart',
    'restartAll restartJoin setSteps soundfont squeezeJoin squeezeout stepJoin structAll tremdepth tremphase tremshape tremskew',
    'tremsync unjoin withSteps pianoroll punchcard spiral pitchwheel scope tscope spectrum wordfall colour',
    // The plugins that come with the app, which are its own code: the effect call and their knobs.
    ['fx', ...PLUGINS.flatMap((plugin) => plugin.knobs.map((knob) => knob.fn))].join(' '),
])

// What is only a function or a value by itself: stack(...), sine, silence.
const ALONE = words([
    'all arrange berlin binary binaryL binaryN binaryNL brand brandBy chooseCycles chooseIn chooseInWith chooseOut chooseWith clamp cosine cosine2',
    'freqToMidi gap id irand isaw isaw2 itri itri2 m midi2note midiToFreq mini mouseX mouseY mousex mousey noteToMidi nothing perlin pm polymeter',
    'polyrhythm pr pure rand rand2 randL randcat randrun reify run s_alt s_cat saw saw2 seqPLoop sequenceP setCpm setCps setcpm setcps signal silence sine',
    'sine2 slider sliderWithID slowcatPrime square square2 stackBy stackCentre stackLeft stackRight steady stepalt stepcat time timeCat timecat tri tri2',
    'useRNG valueToMidi wchoose wchooseCycles withSeed wrandcat zip zipWith',
])

export const METHODS: ReadonlySet<string> = new Set([...BOTH, ...CHAINED])
export const FUNCTIONS: ReadonlySet<string> = new Set([...BOTH, ...ALONE])
export const MATH: ReadonlySet<string> = new Set(
    'abs acos asin atan atan2 cbrt ceil cos exp floor hypot log log10 log2 max min pow random round sign sin sqrt tan trunc PI E'.split(' '),
)

// How the app works, as the site says it: one thing at a time, in a few lines, each with a
// picture of the real window. It has to be changed when the app changes. The sizes of a
// picture are the ones it is shown at; its file holds twice as many dots each way.
export type DocPicture = { file: string; width: number; height: number; alt: string }
export type DocSection = { id: string; title: string; pictures: DocPicture[]; html: string }

export const DOCS_ABOUT = 'How Weft Loom works, one thing at a time: patterns, sounds, the song, tempo and time, choosing several notes at once, chords, knobs over the song, versions, scenes, recordings, packs, MIDI, jams, and getting a song out.'

export const DOCS: DocSection[] = [
    {
        id: 'window',
        title: 'The window',
        pictures: [{ file: '/app-1.webp', width: 1440, height: 900, alt: 'The Weft Loom window while a song plays: the mixer and the sounds on the left, the Song panel and the patterns in the middle, the code on the right.' }],
        html: `<p>A song in Weft Loom is a handful of patterns: drums, a bass line, a melody. Each pattern has a strip in the middle of the window, where you click steps and notes and turn knobs. On the right is the song's code.</p>
<p>The strips and the code are the same song. Whatever you do in a strip is written into the code, and whatever you type into the code shows up in the strips, so you can use whichever suits you at the moment. The code is <a href="https://strudel.cc" rel="noopener">Strudel</a>, and everything Strudel can do works here.</p>
<p>On the left are the Mixer and the Sounds. The icons at the top right show and hide each part of the window, and Controls, Both and Code choose between the strips, the code, or the two side by side.</p>
<p><kbd>Space</kbd> plays and pauses. After typing in the code, <kbd>Cmd</kbd> <kbd>Enter</kbd> plays what you typed. Where this page says Cmd, it is Ctrl on Windows and Linux.</p>
<p>Beside Stop is the <b>metronome</b>: a click on every beat while the song plays, the first beat of each bar higher. The arrow next to it has the <b>count-in</b>: a bar of clicks before the song starts, whenever it starts, so you can come in on the beat. Neither is part of the song.</p>
<p>Beside the play button are Song and Live. <b>Live</b> plays every pattern round and round, which is what you want while trying things out, and is where a new song starts. <b>Song</b> plays the bars you laid out in the Song panel, from the first to the last.</p>`,
    },
    {
        id: 'patterns',
        title: 'Patterns',
        pictures: [
            { file: '/docs/grid.webp', width: 980, height: 270, alt: 'A drum pattern: a row of sixteen steps for each of two sounds, with volume, pan and a mute button at the end of each row.' },
            { file: '/docs/steps.webp', width: 980, height: 370, alt: 'A drum pattern with one row opened step by step: a bar under every hit says how loud it is, rising from the first hit to the last.' },
            { file: '/docs/roll.webp', width: 980, height: 327, alt: 'A pattern of notes in a piano roll, with its knobs in a row under it.' },
        ],
        html: `<p>The row under the strips adds a pattern: Drums, Bass line, Chords or Melody.</p>
<p><b>Drums</b> are a grid. Click a step to put a hit there, and click it again to take it away. Press and drag along a row to fill every step you pass, or to empty them when the drag begins on a hit. Hold <kbd>Shift</kbd> and click to make a hit louder. Add a sound adds a row, and a click on a row's name plays that sound. Every row has its own mute, volume, pan and controls at its end. A right click on a sound's name opens a menu for its row: see Several at once.</p>
<p>Each hit of a row can be its own. The button with the bars at the end of a row opens it <b>step by step</b>: drag over the bars to give every hit its level, and choose Chance, Repeats, Pan, Pitch, Cutoff or Echo to do the same with those. A hit with a chance plays only some of the times round, and a hit with repeats plays two, three or four times in its step.</p>
<p><b>Notes</b> are a piano roll. Click an empty cell for a note, or press there and drag to the right to draw one as long as the drag. Drag a note to move it, drag its right edge to make it longer, and double click it to remove it. Higher and Lower show more of the keyboard. Choose a Key and the roll keeps to the notes of that key; with Chords on, one click puts in the whole chord. <b>Level</b> puts a bar under the roll for every step a note starts on: drag over them to make notes louder or quieter.</p>
<p><b>Length</b> is how many bars the pattern lasts before it comes round again. <b>Steps</b> is how finely a bar is divided: 16 is the usual, 12 and 24 divide each beat in three, for a shuffle or a swing. When a pattern is longer than one bar, <b>Cycle</b> pages through its bars.</p>
<p>At the right of a strip, M mutes the pattern and S plays it alone. The three dots rename, duplicate and move it, and the cross removes it. Under the grid or the roll are the pattern's knobs, with Volume and Pan first.</p>`,
    },
    {
        id: 'several',
        title: 'Several at once',
        pictures: [
            { file: '/docs/select.webp', width: 980, height: 367, alt: 'A piano roll with a box drawn over four notes while Shift is held, to choose them.' },
            { file: '/docs/menu.webp', width: 760, height: 427, alt: 'The menu of a sound in a drum grid, in two columns: hear, step by step, mute, replace with, cut itself, remove; cut, copy, paste, fill each 2, 4 or 8 steps, clear, rotate left and right.' },
        ],
        html: `<p>Hold <kbd>Shift</kbd> and drag a box over notes in a roll, or over steps in a grid, to choose them. In a roll <kbd>Shift</kbd> and a click adds a note; in a grid it is still a louder hit. Drag one of the chosen notes and they all move, and the arrow keys move them too.</p>
<p><kbd>Cmd</kbd> <kbd>C</kbd> copies what is chosen, <kbd>Cmd</kbd> <kbd>X</kbd> cuts it, and <kbd>Cmd</kbd> <kbd>V</kbd> puts it into the bar in sight, at the same place in the bar. When the bar in sight is the one it came from, it goes into the next bar, so copying a bar and pasting it fills the bar after it. It goes into another pattern of the same kind as well: click in that one first. <kbd>Delete</kbd> takes out what is chosen, <kbd>Cmd</kbd> <kbd>A</kbd> chooses everything and <kbd>Escape</kbd> lets it go.</p>
<p>A right click on the name of a sound in a drum grid opens what can be done with its whole row: hear it, give it another sound, let it cut itself off when it is hit again, copy it and paste it onto another row, fill it on every 2, 4 or 8 steps, clear it, or move it a step left or right.</p>`,
    },
    {
        id: 'sounds',
        title: 'Sounds',
        pictures: [{ file: '/docs/sounds.webp', width: 1000, height: 812, alt: 'The Sounds on the left with a list of instruments, and beside it a pattern with all the controls of its sound open: Source, Filter, Shape and Effects.' }],
        html: `<p>Click the name of the sound on a strip. The Sounds open on the left: drum kits, instruments, synths, samples and your own. Click one to hear it, press Use to give it to the pattern, or drag it onto a strip.</p>
<p>The button with the sliders on a strip opens every control of its sound: Source, Filter, Shape, Effects and Feel. A faint knob is one the sound does not use yet. Press it and it is added, to the sound and to the code. Browse all controls finds the rest by name.</p>
<p><b>Volume</b> is how loud a pattern is after its effects, like a fader. <b>Gain</b>, among the controls of the sound, is how hard the sound goes into its filter and effects: on an overdriven sound it changes the bite far more than the loudness.</p>
<p>A knob can move by itself. Point at it and press the small wave at its top left, then choose how it moves, between which two values and over how many bars.</p>
<p>A sound you have shaped can be kept. At the foot of the open controls, <b>Save as preset</b> keeps it under a name with every knob as it stands. It is then among the Presets in the Sounds, beside the twenty that come with Weft Loom, and goes onto a pattern of notes in any song.</p>
<p>Drum kits, instruments and samples are fetched the first time they are played, and kept on your machine. Without a network, the ones you have played before still play.</p>`,
    },
    {
        id: 'song',
        title: 'The song',
        pictures: [{ file: '/docs/song.webp', width: 980, height: 354, alt: 'The Song panel: a row for each pattern with the bars it plays in filled, and four bars chosen to go round, with buttons to repeat them, to put empty bars before them and to take them out.' }],
        html: `<p>The Song panel is the song from left to right: a row for each pattern, a cell for each bar. Drag across a row to fill bars or to empty them. A pattern plays in the bars that are filled, and the song is as long as its last filled bar.</p>
<p>Each row has M and S, and a knob for volume and for pan.</p>
<p>Click a bar number to start from that bar. Drag across bar numbers and those bars go round, which is the way to work on one part of a song. While they go round, three buttons work on them in every pattern at once: <b>Repeat them</b> puts them in once more, <b>Empty bars before</b> makes room in front of them, and <b>Take them out</b> removes them.</p>
<p>A pattern you have just added plays in no bar yet. In Live you hear it at once; in Song you hear it once you fill bars for it.</p>
<p>Bars can have a name over them, such as Intro, Verse or Drop. Press <b>Name bars</b>, then drag over bars in the Sections row and type a name. Press a section to start from it, and press it twice to rename it; clear its name to take it off. Sections move with the bars when bars are repeated, put in or taken out.</p>`,
    },
    {
        id: 'tempo',
        title: 'Tempo and time',
        pictures: [{ file: '/docs/tempo.webp', width: 980, height: 185, alt: 'The Song panel with a Tempo row over the patterns: level for eight bars, then rising bar by bar to the end of the song.' }],
        html: `<p>The tempo is the number at the top, in beats a minute. Beside it is the <b>Time</b>: 4/4 to begin with, and 2/4, 3/4, 5/4, 6/8, 7/8 or 12/8 for a song that is counted another way. A new pattern gets the steps of that bar, and the lights beside the tempo count its beats. The time is one for the whole song, and the patterns a song already has stay as they are.</p>
<p>The arrows beside the tempo make it a beat faster or slower, ten with <kbd>Shift</kbd>, and go on while you hold them. The menu beside them has <b>Tap tempo</b>, to tap the tempo in time, and halves or doubles it.</p>
<p>A song can also speed up, slow down or change tempo. In the Song panel press <b>Draw the tempo</b>. A Tempo row appears over the patterns: drag in it to set the tempo bar by bar, and hold <kbd>Shift</kbd> for a straight line. The length of the song follows it, and so does a file you export.</p>
<p>The cross beside Tempo gives the song one tempo again.</p>`,
    },
    {
        id: 'chords',
        title: 'Chords',
        pictures: [
            { file: '/docs/chords.webp', width: 980, height: 286, alt: 'The Song panel with a Chords row: A minor for four bars, then F, C and G seventh, and above it the notes and kinds of chord to choose from.' },
            { file: '/docs/follow.webp', width: 980, height: 388, alt: 'A pattern that follows the chords: a grid with a row for each note of the chord, and its notes played one by one.' },
        ],
        html: `<p>A song can have chords that its patterns follow. In the Song panel press <b>Add chords</b>. A Chords row appears with a chord for every bar. Choose a note and a kind above it, then press or drag over bars to put that chord there.</p>
<p><b>Follow them with</b> adds a pattern that plays the chord of each bar: Chords plays the whole chord, Bass the note it is named after, and Arp its notes one by one. Its grid has a row for each note of the chord, counted from the bottom, and Where it sits moves it lower or higher. Change a chord in the Chords row and every pattern that follows plays the new one.</p>
<p>The cross beside Chords takes them out of the song. The patterns that followed keep the chords they played, and follow again when you add chords again.</p>`,
    },
    {
        id: 'knobs',
        title: 'A knob over the song',
        pictures: [{ file: '/docs/knob.webp', width: 980, height: 530, alt: 'The Song panel with the list of a pattern\'s knobs open, and under another pattern a row in which its cutoff rises bar by bar.' }],
        html: `<p>A knob does not have to stand still for the whole song. In the Song panel press the small icon beside a pattern's name and choose one of its knobs. A row appears under the pattern: drag in it to set the knob bar by bar. Hold <kbd>Shift</kbd> and drag for a straight line.</p>
<p>You can also play it in. Switch <b>Record knobs</b> on, press play and turn a knob while the song plays. When you stop, what you did is a row in the Song panel.</p>
<p>To let a knob stand still again, point at the name of its row and press the cross.</p>`,
    },
    {
        id: 'versions',
        title: 'Versions of a pattern',
        pictures: [{ file: '/docs/versions.webp', width: 980, height: 327, alt: 'A pattern with two versions, shown as tabs A and B beside its name, and its menu open.' }],
        html: `<p>A pattern can play one thing in the verse and another in the chorus, with the same sound and the same knobs. Open the pattern's menu, the three dots, and choose <b>Add a version</b>. The strip gets tabs A and B. B starts as a copy of A, and changing one leaves the other as it was. The plus adds more, up to eight.</p>
<p>In the Song panel, drag across the pattern's bars while a version is shown: those bars play that version and carry its letter.</p>
<p>Remove version, in the same menu, removes the one that is shown.</p>`,
    },
    {
        id: 'scenes',
        title: 'Scenes',
        pictures: [{ file: '/docs/scenes.webp', width: 980, height: 360, alt: 'The Song panel in Live with a row of three scenes: Intro, Build, which is waiting for the next bar, and Drop, which is playing.' }],
        html: `<p>Scenes are for playing a song live. Switch to Live and the Song panel gets a row of them.</p>
<p>A scene is a set of patterns that play together. Mute and unmute patterns until you hear one part of your song, and press <b>Keep what plays now</b>. Do the same for the next part.</p>
<p>While the song plays, press a scene. It waits for the bar to end and comes in on the first beat of the next one. Pressed in the last half second of a bar, it waits for the bar after. Double click a scene to give it a name.</p>`,
    },
    {
        id: 'keys',
        title: 'Notes from the keyboard',
        pictures: [{ file: '/docs/keys.webp', width: 980, height: 351, alt: 'A piano roll with Keys and Write switched on, and a line that says which keys of the computer keyboard are the keys of the piano.' }],
        html: `<p>On a piano roll press <b>Keys</b>. The computer's keyboard is now a piano for that pattern: <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>H</kbd> <kbd>J</kbd> <kbd>K</kbd> are the white keys, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> the black ones between them, and <kbd>Z</kbd> and <kbd>X</kbd> go an octave down and up.</p>
<p>With <b>Write</b> on, what you play while the song plays is written into the roll, where you played it and for as long as you held the key. With it off you only hear it.</p>
<p>On a drum grid, Keys makes <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> and the letters after them its sounds, from the top row down, and Write puts a hit on the step the song is at.</p>
<p>Typing in the code or in a box is still typing.</p>`,
    },
    {
        id: 'midi',
        title: 'MIDI',
        pictures: [
            { file: '/docs/level.webp', width: 980, height: 460, alt: 'A piano roll with Keys on and, under it, the level of every note as a bar: low for the notes played softly, high for the ones played hard.' },
            { file: '/docs/played.webp', width: 620, height: 80, alt: 'The foot of a pattern\'s sound controls: Played by a synth plugged in over MIDI, on channel 1.' },
        ],
        html: `<p>Plug in a MIDI keyboard or pad and it plays at once: the pattern you are on, the notes of a piano roll or the sounds of a drum grid, where the pads go by the drum numbers every machine agrees on. A key sounds for as long as you hold it, and as loud as you pressed it. The sound settings, Devices at the top of the mixer, name the keyboards that are plugged in.</p>
<p>With Keys and Write on, what you play while the song plays is written in, and every note keeps how hard its key was pressed. <b>Level</b> under the roll shows it, and quieter notes are paler. Drag over the bars to change them, and double click one to put it back. A chord keeps how hard each of its keys was pressed. To change one note of a chord, choose it first: the Level bar of that step is then its own.</p>
<p>A pattern can be played by a synth or another music program instead of Weft Loom. Open its sound controls and choose the synth under <b>Played by</b>, and a channel beside it. Each note goes out as hard as its level says, times the pattern's volume.</p>
<p>In the sound settings, <b>Clock</b> sends the tempo of the song to a drum machine or a synth that follows one, with its start and its stop. <b>Follow</b> is the other way round: the song starts, stops and keeps the tempo of a drum machine or a program that sends a MIDI clock, and its own tempo comes back when that clock stops. <b>Learn the knobs of a controller</b> lets a knob or a fader of yours turn a knob of the app: press the knob in the app, then turn yours. It turns that knob in every song that has the same pattern and the same knob.</p>
<p>On a Mac and on Linux, other music programs on the same computer see Weft Loom as a MIDI device. They can play it as they would a keyboard and send it their clock, and a pattern can be played by them: choose other programs under Played by.</p>
<p>Export has <b>MIDI (.mid)</b>: a track for every pattern of notes or drums, to open in another music program. Open a File takes a MIDI file and makes a song of it, a piano roll for each instrument and a drum grid for the drums. A long file is cut into parts of eight bars, each a pattern that plays in its own bars, and a part that comes again is the same pattern again.</p>`,
    },
    {
        id: 'own',
        title: 'Your own sounds',
        pictures: [{ file: '/docs/own.webp', width: 540, height: 304, alt: 'A recording drawn as a wave with two edges, and buttons to hear the part between them and to keep it.' }],
        html: `<p>In the Sounds choose Yours. <b>Add audio files</b> takes recordings you have, and <b>Record</b> takes one from the microphone.</p>
<p>Use one on a pattern of notes and it is played higher and lower with the notes. Use it on a drum pattern and it becomes a row of the grid.</p>
<p>To cut the silence off a sound, point at it in the list and press the button with the two bars. Drag the two edges, press Hear it, then Keep this part.</p>
<p>Your sounds travel with the song: into a song file, to the other person in a jam, and to the site when you publish.</p>`,
    },
    {
        id: 'slices',
        title: 'A sample cut into parts',
        pictures: [{ file: '/docs/slices.webp', width: 980, height: 614, alt: 'A drum loop drawn as a wave and cut into sixteen parts, and under it a grid with a row for each part, most of them in their own order and a few moved.' }],
        html: `<p>A drum loop, or any sample, can be cut into equal parts and played in another order. Beside a sample and beside a sound of your own in the Sounds is a button with three boxes. Press it and a new pattern appears, with the sound drawn at its top and cut into as many parts as the pattern has steps.</p>
<p>Each part is a row of the grid, and a hit plays that part on that step. The parts in a line from the top left down are the sound as it was. Click to move them about, or press In order, Backwards, Shuffle or Clear. A press on a part in the drawing plays it.</p>
<p>With <b>Fit to the tempo</b> on, each part is played as fast as fills its step, so a loop follows the tempo of the song and its pitch moves with it. Off, each part plays as fast as it was recorded.</p>`,
    },
    {
        id: 'audio',
        title: 'A recording along the song',
        pictures: [{ file: '/docs/audio.webp', width: 980, height: 329, alt: 'A recording laid along the song: its wave with the bars of the song over it, and under it where it starts, a nudge, the bars it is heard in and its fades.' }],
        html: `<p>A sung take, a guitar, anything longer than a bar can play along the song as it is. In the Sounds choose Yours and press the button with the wave beside a sound. It is laid on the bars from the bar the song is at, and the song is made longer if it has to be. A take you record while the song plays in Song goes where you sang it. With the count-in on, press Record with the song stopped: the song starts after a bar of clicks, and the take starts where the song does.</p>
<p>Its strip shows the recording with the bars of the song over it, and a press plays it from there. <b>Starts at bar</b> moves it, and <b>Nudge</b> moves it by 10 milliseconds at a time, for a take that came out a little late. <b>Heard from bar</b> and <b>to</b> cut it at both ends. To cut it anywhere else, empty its bars in the Song panel where it should rest. <b>Fade in</b> brings it in over that many seconds, and <b>Fade out</b> lets it go on for that many after its last bar while it fades.</p>
<p>A recording keeps the speed it was made at. Change the tempo afterwards and it still plays without a break, but no longer on the beat.</p>`,
    },
    {
        id: 'packs',
        title: 'Packs',
        pictures: [{ file: '/docs/packs.webp', width: 300, height: 520, alt: 'The Sounds with Packs chosen: a pack called Starter loops with nine sounds, and its loops and hits listed under it with buttons to use, slice and put each in the song.' }],
        html: `<p>A pack is one file with sounds and presets in it, made for Weft Loom: drum loops, single hits, instruments, whatever its maker put in. In the Sounds choose <b>Packs</b> and press <b>Add a pack</b>. The pack is listed with who made it, and its sounds are under it.</p>
<p>A sound from a pack goes wherever a sound of your own goes: a row in a drum grid, the sound of a pattern of notes, a loop to cut into parts, a recording along the song. Its presets are among the Presets, under the pack's name. A song that uses a sound from a pack carries that sound along, so it plays for whoever opens it, with the pack or without.</p>
<p>To make a pack, choose Yours and press <b>Make a pack</b>. Give it a name, choose which of your sounds and presets go in, and save it. The file is the pack: give it to anyone who uses Weft Loom.</p>`,
    },
    {
        id: 'mixer',
        title: 'The mixer',
        pictures: [
            { file: '/docs/mixer.webp', width: 300, height: 338, alt: 'The mixer: pan, low, mid and high knobs, a limiter, a volume fader and two meters.' },
            { file: '/docs/strips.webp', width: 980, height: 422, alt: 'The Song panel switched to Mix: a strip for each pattern with a meter, a volume fader, pan, low cut, cutoff, room, delay, and M and S.' },
        ],
        html: `<p>Volume, pan, low, mid and high for everything you hear, with a limiter and two meters.</p>
<p>It is how the song sounds on your machine and not part of the song. A file you export, and someone you jam with, get the song without it.</p>
<p>Each pattern has a strip of its own as well. In the Song panel switch from Bars to <b>Mix</b>: a meter, a volume fader, pan, low cut, cutoff, room and delay for every pattern, side by side, with M and S. These are the pattern's own knobs, so they are part of the song.</p>`,
    },
    {
        id: 'devices',
        title: 'Microphone and output',
        pictures: [{ file: '/docs/devices.webp', width: 460, height: 500, alt: 'The sound settings: a list to choose the microphone from, a list to choose the output from, and a button that plays a short note.' }],
        html: `<p>Weft Loom records from the microphone the system uses and plays through the system's output, until you choose otherwise. Press <b>Devices</b> at the top of the mixer, or choose Sound Settings in the File menu.</p>
<p><b>Microphone</b> is what a take and your voice in a jam are made with. <b>Output</b> is what the song is played through, and Test plays a short note there. If the list of outputs is empty, press Show the outputs: a window is only told what it could play through once it may use the microphone. Nothing is recorded.</p>
<p>Both go back to the system's own when what you chose is unplugged.</p>`,
    },
    {
        id: 'jams',
        title: 'Jams',
        pictures: [{ file: '/app-3.webp', width: 1440, height: 900, alt: 'Two people in a jam on one song: who they are, what they wrote to each other, and which pattern the other one just changed.' }],
        html: `<p>Two people can work on one song at the same time. Open Jams, the two people at the top right, and type a name.</p>
<p>Press <b>Invite someone</b> and send the six characters to the other person, who types them into Invite and presses Join. Or switch <b>Open to jam</b> on: you are then in the list everyone sees in their Jams, anyone can ask to join, and you let them in or not.</p>
<p>Both now have the same song. A step, a note, a knob, a line of code: what one changes, the other gets. Play and stop are for both. There is a chat, and a microphone and a camera to switch on. The Linux app has the chat only.</p>
<p>If a line drops, the jam goes on. Whoever dropped is back in it by themselves within two minutes, with everything the other changed and said meanwhile. Leave ends the jam for both, and each keeps the song.</p>`,
    },
    {
        id: 'files',
        title: 'Saving, exporting, publishing',
        pictures: [{ file: '/docs/export.webp', width: 460, height: 306, alt: 'The export window: the song or each pattern, WAV or MP3, a quality, and buttons for a song file, the code and the audio.' }],
        html: `<p>Weft Loom keeps your songs itself and writes every change down as you make it, so quitting the app loses nothing. <kbd>Cmd</kbd> <kbd>S</kbd> saves a version you can go back to from the song's menu. Closing a song that has changes asks whether to save them: Close without saving takes it back to the version that was saved.</p>
<p><b>Export</b> makes files. A song file (.weft) is the whole song with your own sounds inside, to open in Weft Loom on another machine or to send to someone. Code (.js) is the code alone. MIDI (.mid) is the notes alone, for another music program. Export audio makes a WAV or an MP3 of the song. With Each pattern chosen it makes a zip with a file for every pattern, all the same length, to mix in another audio program. Loudness <b>For streaming</b> makes the song as loud as music is played on streaming sites, about -14 LUFS, and the note under it says how loud the file came out.</p>
<p><b>Publish</b> puts a song among the <a href="/songs">songs on this site</a>, where anyone can listen to half a minute of it, download it and open it in Weft Loom. It needs an account, made in the same window with an email and a password. An account holds ten songs of up to 1 MB each, and Weft Loom makes your own sounds smaller where it has to.</p>
<p>A song from someone else is code. Weft Loom plays it only if it is music code and nothing more. If it holds anything else, it says which line and asks first.</p>`,
    },
    {
        id: 'more',
        title: 'Keys and updates',
        pictures: [],
        html: `<dl class="docs-k">
<div><dt><kbd>Space</kbd></dt><dd>Play or pause</dd></div>
<div><dt><kbd>Cmd</kbd> <kbd>Enter</kbd></dt><dd>Play what is in the code</dd></div>
<div><dt><kbd>Cmd</kbd> <kbd>.</kbd></dt><dd>Silence</dd></div>
<div><dt><kbd>Cmd</kbd> <kbd>Z</kbd></dt><dd>Undo, and with <kbd>Shift</kbd> do again</dd></div>
<div><dt><kbd>Cmd</kbd> <kbd>S</kbd></dt><dd>Save</dd></div>
<div><dt><kbd>Cmd</kbd> <kbd>N</kbd></dt><dd>New song</dd></div>
<div><dt><kbd>Cmd</kbd> <kbd>O</kbd></dt><dd>Open a file</dd></div>
<div><dt><kbd>Shift</kbd> and a drag</dt><dd>Choose several notes in a roll, or steps in a grid</dd></div>
<div><dt><kbd>Cmd</kbd> <kbd>C</kbd>, <kbd>X</kbd>, <kbd>V</kbd></dt><dd>Copy, cut and paste what is chosen</dd></div>
<div><dt><kbd>Cmd</kbd> <kbd>A</kbd></dt><dd>Choose every note of a roll, or every step of the bar in sight</dd></div>
<div><dt>Arrow keys</dt><dd>Move the chosen notes in a roll; with <kbd>Shift</kbd>, left and right change the length of one</dd></div>
<div><dt><kbd>Delete</kbd></dt><dd>Take out what is chosen</dd></div>
</dl>
<p>Weft Loom looks for a newer version of itself when it starts, and offers it in a card at the bottom right. Update and restart puts it in.</p>`,
    },
]

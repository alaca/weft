// How the app works, as the site says it: one thing at a time, in a few lines, each with a
// picture of the real window. It has to be changed when the app changes. The sizes of a
// picture are the ones it is shown at; its file holds twice as many dots each way.
export type DocPicture = { file: string; width: number; height: number; alt: string }
export type DocSection = { id: string; title: string; pictures: DocPicture[]; html: string }

export const DOCS_ABOUT = 'How Weft works, one thing at a time: patterns, the song, sounds, knobs over the song, versions, scenes, jams, and getting a song out.'

export const DOCS: DocSection[] = [
    {
        id: 'window',
        title: 'The window',
        pictures: [{ file: '/app-1.webp', width: 1440, height: 900, alt: 'The Weft window while a song plays: the mixer and the sounds on the left, the Song panel and the patterns in the middle, the code on the right.' }],
        html: `<p>A song in Weft is a handful of patterns: drums, a bass line, a melody. Each pattern has a strip in the middle of the window, where you click steps and notes and turn knobs. On the right is the song's code.</p>
<p>The strips and the code are the same song. Whatever you do in a strip is written into the code, and whatever you type into the code shows up in the strips, so you can use whichever suits you at the moment. The code is <a href="https://strudel.cc" rel="noopener">Strudel</a>, and everything Strudel can do works here.</p>
<p>On the left are the Mixer and the Sounds. The icons at the top right show and hide each part of the window, and Controls, Both and Code choose between the strips, the code, or the two side by side.</p>
<p><kbd>Space</kbd> plays and pauses. After typing in the code, <kbd>Cmd</kbd> <kbd>Enter</kbd> plays what you typed. Where this page says Cmd, it is Ctrl on Windows and Linux.</p>
<p>Beside the play button are Song and Live. <b>Live</b> plays every pattern round and round, which is what you want while trying things out, and is where a new song starts. <b>Song</b> plays the bars you laid out in the Song panel, from the first to the last.</p>`,
    },
    {
        id: 'patterns',
        title: 'Patterns',
        pictures: [
            { file: '/docs/grid.webp', width: 980, height: 270, alt: 'A drum pattern: a row of sixteen steps for each of two sounds, with volume, pan and a mute button at the end of each row.' },
            { file: '/docs/roll.webp', width: 980, height: 327, alt: 'A pattern of notes in a piano roll, with its knobs in a row under it.' },
        ],
        html: `<p>The row under the strips adds a pattern: Drums, Bass line, Chords or Melody.</p>
<p><b>Drums</b> are a grid. Click a step to put a hit there, and click it again to take it away. Hold <kbd>Shift</kbd> and click to make a hit louder. Add a sound adds a row, and a click on a row's name plays that sound. Every row has its own mute, volume, pan and controls at its end.</p>
<p><b>Notes</b> are a piano roll. Click an empty cell for a note. Drag a note to move it, drag its right edge to make it longer, and double click it to remove it. Higher and Lower show more of the keyboard. Choose a Key and the roll keeps to the notes of that key; with Chords on, one click puts in the whole chord.</p>
<p><b>Length</b> is how many bars the pattern lasts before it comes round again. <b>Steps</b> is how finely a bar is divided. When a pattern is longer than one bar, <b>Cycle</b> pages through its bars.</p>
<p>At the right of a strip, M mutes the pattern and S plays it alone. The three dots rename, duplicate and move it, and the cross removes it. Under the grid or the roll are the pattern's knobs, with Volume and Pan first.</p>`,
    },
    {
        id: 'sounds',
        title: 'Sounds',
        pictures: [{ file: '/docs/sounds.webp', width: 1000, height: 812, alt: 'The Sounds on the left with a list of instruments, and beside it a pattern with all the controls of its sound open: Source, Filter, Shape and Effects.' }],
        html: `<p>Click the name of the sound on a strip. The Sounds open on the left: drum kits, instruments, synths, samples and your own. Click one to hear it, press Use to give it to the pattern, or drag it onto a strip.</p>
<p>The button with the sliders on a strip opens every control of its sound: Source, Filter, Shape, Effects and Feel. A faint knob is one the sound does not use yet. Press it and it is added, to the sound and to the code. Browse all controls finds the rest by name.</p>
<p>A knob can move by itself. Point at it and press the small wave at its top left, then choose how it moves, between which two values and over how many bars.</p>`,
    },
    {
        id: 'song',
        title: 'The song',
        pictures: [{ file: '/docs/song.webp', width: 980, height: 325, alt: 'The Song panel: a row for each pattern with the bars it plays in filled, and four bars chosen to go round, with buttons to repeat them, to put empty bars before them and to take them out.' }],
        html: `<p>The Song panel is the song from left to right: a row for each pattern, a cell for each bar. Drag across a row to fill bars or to empty them. A pattern plays in the bars that are filled, and the song is as long as its last filled bar.</p>
<p>Each row has M and S, and a knob for volume and for pan.</p>
<p>Click a bar number to start from that bar. Drag across bar numbers and those bars go round, which is the way to work on one part of a song. While they go round, three buttons work on them in every pattern at once: <b>Repeat them</b> puts them in once more, <b>Empty bars before</b> makes room in front of them, and <b>Take them out</b> removes them.</p>
<p>A pattern you have just added plays in no bar yet. In Live you hear it at once; in Song you hear it once you fill bars for it.</p>`,
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
<p>While the song plays, press a scene. It waits for the bar to end and comes in with the next one. Double click a scene to give it a name.</p>`,
    },
    {
        id: 'keys',
        title: 'Notes from the keyboard',
        pictures: [{ file: '/docs/keys.webp', width: 980, height: 351, alt: 'A piano roll with Keys and Write switched on, and a line that says which keys of the computer keyboard are the keys of the piano.' }],
        html: `<p>On a piano roll press <b>Keys</b>. The computer's keyboard is now a piano for that pattern: <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>H</kbd> <kbd>J</kbd> <kbd>K</kbd> are the white keys, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> the black ones between them, and <kbd>Z</kbd> and <kbd>X</kbd> go an octave down and up.</p>
<p>With <b>Write</b> on, what you play while the song plays is written into the roll, where you played it and for as long as you held the key. With it off you only hear it.</p>
<p>Typing in the code or in a box is still typing.</p>`,
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
        id: 'mixer',
        title: 'The mixer',
        pictures: [{ file: '/docs/mixer.webp', width: 300, height: 338, alt: 'The mixer: pan, low, mid and high knobs, a limiter, a volume fader and two meters.' }],
        html: `<p>Volume, pan, low, mid and high for everything you hear, with a limiter and two meters.</p>
<p>It is how the song sounds on your machine and not part of the song. A file you export, and someone you jam with, get the song without it.</p>`,
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
        html: `<p>Weft keeps your songs itself and writes every change down as you make it, so closing the app loses nothing. <kbd>Cmd</kbd> <kbd>S</kbd> saves a version you can go back to from the song's menu.</p>
<p><b>Export</b> makes files. A song file (.weft) is the whole song with your own sounds inside, to open in Weft on another machine or to send to someone. Code (.js) is the code alone. Export audio makes a WAV or an MP3 of the song. With Each pattern chosen it makes a zip with a file for every pattern, all the same length, to mix in another audio program.</p>
<p><b>Publish</b> puts a song among the <a href="/songs">songs on this site</a>, where anyone can listen to half a minute of it, download it and open it in Weft. It needs an account, made in the same window with an email and a password. An account holds ten songs of up to 1 MB each, and Weft makes your own sounds smaller where it has to.</p>
<p>A song from someone else is code. Weft plays it only if it is music code and nothing more. If it holds anything else, it says which line and asks first.</p>`,
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
<div><dt>Arrow keys</dt><dd>Move the chosen note in a roll; with <kbd>Shift</kbd>, left and right change its length</dd></div>
<div><dt><kbd>Delete</kbd></dt><dd>Remove the chosen note</dd></div>
</dl>
<p>Weft looks for a newer version of itself when it starts, and offers it in a card at the bottom right. Update and restart puts it in.</p>`,
    },
]

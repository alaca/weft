# Weft

A free, open-source desktop app for making music with [Strudel](https://strudel.cc). Every pattern in a song is shown twice: as controls and as Strudel code. The code is the song; the controls read it and rewrite it.

"Weft" is a working name. The app is at slice 2 of 4: it plays a song from the editor, draws a strip for each named pattern with mute and solo, gives every number in the code a knob, and has a sound panel per pattern with wave, filter and echo switches and a browser of every other control. Tempo and master volume are in the top bar and the Output strip. Editing patterns from the controls and files come next. See `docs/superpowers/specs/2026-10-10-weft-design.md`.

## Run it

    npm install
    npm run dev          # in a browser, http://localhost:5180
    npm run tauri:dev    # in a desktop window (needs Rust)

## Test it

    npm test             # unit tests
    npm run test:e2e     # browser tests, in Chromium and in WebKit (what the macOS window uses)
    npm run typecheck

## Licence

AGPL-3.0-or-later, the same as Strudel, which this app is built on.

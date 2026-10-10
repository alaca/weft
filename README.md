# Weft

A free, open-source desktop app for making music with [Strudel](https://strudel.cc). Every pattern in a song is shown twice: as controls and as Strudel code. The code is the song; the controls read it and rewrite it.

"Weft" is a working name. The app is at slice 3 of 4: it plays a song from the editor, draws a strip for each named pattern, gives every number in the code a knob with a sound panel per pattern, lets you click drum hits into a step grid where every sound has its own controls, and notes into a piano roll, adds new patterns from starters, has a browser for trying and choosing sounds, and has a playlist where you choose the bars each pattern plays in, all without writing code. Opening and saving files come next. See `docs/superpowers/specs/2026-10-10-weft-design.md`.

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

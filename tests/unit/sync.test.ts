import { ChangeSet } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { collide } from '../../src/engine/sync'

const LENGTH = 40
const change = (from: number, to: number, insert: string) => ChangeSet.of({ from, to, insert }, LENGTH)

describe('collide', () => {
    it('is true when two changes rewrite the same stretch, or stretches that overlap', () => {
        expect(collide(change(10, 14, '0.6'), change(10, 14, '0.7'))).toBe(true)
        expect(collide(change(10, 14, 'a'), change(13, 20, 'b'))).toBe(true)
        expect(collide(change(5, 30, 'whole'), change(12, 13, 'x'))).toBe(true)
    })

    it('is false for changes that stand apart or only touch', () => {
        expect(collide(change(10, 11, 'x'), change(12, 13, 'x'))).toBe(false)
        expect(collide(change(10, 14, 'a'), change(14, 20, 'b'))).toBe(false)
    })

    it('is false for two things put in at the same place, and for one put in at the edge of a rewrite', () => {
        expect(collide(change(40, 40, 'one'), change(40, 40, 'two'))).toBe(false)
        expect(collide(change(10, 14, 'a'), change(14, 14, 'b'))).toBe(false)
        expect(collide(change(10, 10, 'a'), change(10, 14, 'b'))).toBe(false)
    })

    it('is true for something put in inside a stretch the other rewrote', () => {
        expect(collide(change(12, 12, 'a'), change(10, 14, 'b'))).toBe(true)
        expect(collide(change(10, 14, 'b'), change(12, 12, 'a'))).toBe(true)
    })

    it('looks at every part of a change that has several', () => {
        const several = ChangeSet.of([{ from: 2, to: 3, insert: 'x' }, { from: 30, to: 31, insert: 'y' }], LENGTH)
        expect(collide(several, change(30, 31, 'z'))).toBe(true)
        expect(collide(several, change(10, 11, 'z'))).toBe(false)
    })
})

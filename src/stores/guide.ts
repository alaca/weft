import { createSignal } from 'solid-js'

// The first beat that is being made with the guide: which of its steps is shown, none when no
// guide is on, and whether that step was just done.
export const [guideStep, setGuideStep] = createSignal<number | null>(null)
export const [guideGood, setGuideGood] = createSignal(false)

import { createSignal } from 'solid-js'

// A newer version of the app. `found` is one that is there to be had, `fetching` is it on its
// way, `failed` is one that could not be put in place, and `said` is the answer to someone who
// asked whether there is one.
export type UpdateStage = 'none' | 'found' | 'fetching' | 'failed' | 'said'

export const [updateStage, setUpdateStage] = createSignal<UpdateStage>('none')
export const [updateVersion, setUpdateVersion] = createSignal('')
export const [updateNotes, setUpdateNotes] = createSignal('')
export const [updateDone, setUpdateDone] = createSignal(0)
export const [updateNote, setUpdateNote] = createSignal<string | null>(null)

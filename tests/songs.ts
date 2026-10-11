import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The songs that used to come with the app. They are kept as song files in `demos/`, for the
// owner to publish, and the tests still read them as songs that are known to be good.
const folder = fileURLToPath(new URL('../demos/', import.meta.url))
const read = (file: string) => JSON.parse(readFileSync(`${folder}${file}`, 'utf8')) as { name: string; code: string }

export const STARTER_NAME = 'Night bus'
export const STARTER: string = read(`${STARTER_NAME}.weft`).code
export const DEMOS: { name: string; code: string }[] = readdirSync(folder)
    .filter((file) => file.endsWith('.weft') && file !== `${STARTER_NAME}.weft`)
    .sort()
    .map(read)

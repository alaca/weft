import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The songs that used to come with the app. They are kept as song files in `demos/`, for the
// owner to publish, and the tests still read them as songs that are known to be good.
const folder = fileURLToPath(new URL('../demos/', import.meta.url))
const read = (file: string) => JSON.parse(readFileSync(`${folder}${file}`, 'utf8')) as { name: string; code: string }

export const STARTER_NAME = 'Night bus'
export const STARTER: string = read(`${STARTER_NAME}.weft`).code
// The folder also holds songs the owner picked later for the demo on the site. Those are made
// another way and are not among these.
const CAME_WITH = ['Glasshouse', 'Grey area', 'Low sun', 'Night shift', 'Slow burn', 'Spiral', 'Squelch', 'Undertow']
export const DEMOS: { name: string; code: string }[] = CAME_WITH.map((name) => read(`${name}.weft`))

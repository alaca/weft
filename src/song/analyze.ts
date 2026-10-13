import { parse } from 'acorn'
import { readMeter } from './meter'
import type { Arg, Call, PatternBlock, Song, Tempo, Variants } from './types'

type Node = { type: string; start: number; end: number; loc: { start: { line: number }; end: { line: number } }; [key: string]: any }

const ONE_WORD = /^[\w-]+$/

function numberOf(node: Node): number | null {
    if (node.type === 'Literal' && typeof node.value === 'number') return node.value
    if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
        return -node.argument.value
    }
    return null
}

function toArg(node: Node): Arg {
    const value = numberOf(node)
    if (value !== null) return { kind: 'number', value, from: node.start, to: node.end }
    if (node.type === 'Literal' && typeof node.value === 'string') return { kind: 'string', value: node.value, from: node.start, to: node.end }
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return { kind: 'string', value: node.quasis[0].value.cooked ?? '', from: node.start, to: node.end }
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'slider' && node.arguments.length) {
        const first: Node = node.arguments[0]
        const start = numberOf(first)
        const min = node.arguments[1] ? numberOf(node.arguments[1]) : 0
        const max = node.arguments[2] ? numberOf(node.arguments[2]) : 1
        if (start !== null && min !== null && max !== null) {
            return { kind: 'slider', value: start, min, max, from: node.start, to: node.end, valueFrom: first.start, valueTo: first.end }
        }
    }
    if (node.type === 'CallExpression') {
        const calls = callChain(node)
        if (calls.length) return { kind: 'chain', calls, root: rootOf(node), from: node.start, to: node.end }
    }
    return { kind: 'other', from: node.start, to: node.end }
}

// What a chain of calls starts from, when that is a plain name: `sine` in sine.range(1, 2).slow(4).
function rootOf(expression: Node): string | undefined {
    let node: Node = expression
    while (node.type === 'CallExpression' || node.type === 'MemberExpression') node = node.type === 'CallExpression' ? node.callee : node.object
    return node.type === 'Identifier' ? node.name : undefined
}

// How loud a pattern is, is written as .mul(postgain(0.8)): the level after its effects, times
// whatever the pattern already says of it, which is the louder hits of a drum row and the
// rows of a kit. A plain .postgain(0.8) would put those aside. It is read as a call of its own,
// `volume`, given the number.
export const VOLUME = 'volume'

function loudness(node: Node, callee: Node): Node | null {
    const inner: Node | undefined = node.arguments[0]
    if (callee.property.name !== 'mul' || node.arguments.length !== 1 || !inner) return null
    if (inner.type !== 'CallExpression' || inner.callee.type !== 'Identifier' || inner.callee.name !== 'postgain' || inner.arguments.length !== 1) return null
    return inner.arguments[0]
}

function callChain(expression: Node): Call[] {
    const calls: Call[] = []
    let node: Node | undefined = expression
    while (node && node.type === 'CallExpression') {
        const callee: Node = node.callee
        const loud = callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ? loudness(node, callee) : null
        const args = loud ? [toArg(loud)] : (node.arguments as Node[]).map(toArg)
        if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
            calls.unshift({
                name: loud ? VOLUME : callee.property.name,
                from: callee.object.end,
                to: node.end,
                nameFrom: callee.property.start,
                nameTo: callee.property.end,
                args,
            })
            node = callee.object
        } else if (callee.type === 'Identifier') {
            calls.unshift({ name: callee.name, from: node.start, to: node.end, nameFrom: callee.start, nameTo: callee.end, args })
            node = undefined
        } else {
            node = undefined
        }
    }
    return calls
}

// A pattern with versions is written as a list of them, with a row in front that says which
// version each bar takes:
//
//   bass: "<0!8 1!8>".pick([
//     note(`c2 ~ c2 ~`),
//     note(`c2 e2 g2 e2`),
//   ])
//     .s("sawtooth")
//
// Read as one, its calls are those of the version that is shown and then the ones they all
// share, so that everything that reads and changes a pattern works on the version in sight.
//
// The numbers of the row have a space between them. Were the space left to choice, a long
// row that is no such row would be tried with its digits cut in every way there is, which
// does not end.
const CHOICES = /^\s*<\s*\d+(!\d+)?(\s+\d+(!\d+)?)*\s*>\s*$/

function versions(expression: Node, shown: number): { variants: Variants; calls: Call[] } | null {
    let node: Node = expression
    while (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
        const callee: Node = node.callee
        const list: Node | undefined = node.arguments[0]
        if (callee.property.type === 'Identifier' && callee.property.name === 'pick' && callee.object.type === 'Literal' && typeof callee.object.value === 'string') {
            if (node.arguments.length !== 1 || !list || list.type !== 'ArrayExpression' || !list.elements.length || !CHOICES.test(callee.object.value)) return null
            const items = list.elements as (Node | null)[]
            if (items.some((item) => !item || item.type !== 'CallExpression')) return null
            const at = Math.min(Math.max(0, shown), items.length - 1)
            const inner = callChain(items[at] as Node)
            if (!inner.length) return null
            const chooser = { kind: 'string' as const, value: callee.object.value as string, from: callee.object.start, to: callee.object.end }
            const shared = callChain(expression).slice(1)
            return { variants: { chooser, items: (items as Node[]).map((item) => ({ from: item.start, to: item.end })), shown: at, from: callee.object.start, to: node.end }, calls: [...inner, ...shared] }
        }
        node = callee.object
    }
    return null
}

function stringArg(call: Call): string | null {
    const first = call.args[0]
    return first && first.kind === 'string' ? first.value : null
}

function soundName(calls: Call[]): string | null {
    const bank = calls.find((call) => call.name === 'bank')
    const banked = bank ? stringArg(bank) : null
    if (banked) return banked
    for (const call of calls) {
        if (call.name !== 's' && call.name !== 'sound') continue
        const value = stringArg(call)
        if (value && ONE_WORD.test(value)) return value
    }
    return null
}

const TEMPO_UNITS: Record<string, Tempo['unit']> = { setcpm: 'cpm', setCpm: 'cpm', setcps: 'cps', setCps: 'cps' }

function staticNumber(node: Node): number | null {
    const direct = numberOf(node)
    if (direct !== null) return direct
    if (node.type === 'BinaryExpression' && (node.operator === '/' || node.operator === '*')) {
        const left = staticNumber(node.left)
        const right = staticNumber(node.right)
        if (left === null || right === null) return null
        return node.operator === '/' ? left / right : left * right
    }
    return null
}

function tempoOf(body: Node[], quarters: number): { tempo: Tempo | null; locked: boolean } {
    for (const node of body) {
        if (node.type !== 'ExpressionStatement' || node.expression.type !== 'CallExpression') continue
        const call: Node = node.expression
        if (call.callee.type !== 'Identifier' || call.arguments.length !== 1) continue
        const unit = TEMPO_UNITS[call.callee.name]
        if (!unit) continue
        const value = staticNumber(call.arguments[0])
        if (value === null) return { tempo: null, locked: true }
        const bpm = Math.round((unit === 'cpm' ? value * quarters : value * 60 * quarters) * 100) / 100
        return { tempo: { bpm, from: call.arguments[0].start, to: call.arguments[0].end, unit, ...(quarters === 4 ? {} : { quarters }) }, locked: false }
    }
    return { tempo: null, locked: false }
}

// `shown` says, for the patterns that have versions, which one is in sight.
export function analyze(code: string, shown: Record<string, number> = {}): Song {
    let ast: Node
    try {
        ast = parse(code, { ecmaVersion: 2022, allowAwaitOutsideFunction: true, locations: true }) as unknown as Node
    } catch (err) {
        const e = err as { message?: string; loc?: { line?: number } }
        return {
            patterns: [],
            tempo: null,
            tempoLocked: false,
            insertAt: 0,
            error: { message: String(e.message ?? err).replace(/\s*\(\d+:\d+\)$/, ''), line: e.loc?.line ?? 1 },
        }
    }

    const patterns: PatternBlock[] = []
    let anonymous = 0
    for (const node of ast.body as Node[]) {
        if (node.type !== 'LabeledStatement' || node.body.type !== 'ExpressionStatement') continue
        const label: string = node.label.name
        const bare = label.replace(/^_+|_+$/g, '')
        const id = bare.includes('$') ? `pattern ${++anonymous}` : bare
        const versioned = versions(node.body.expression, shown[id] ?? 0)
        const calls = versioned?.calls ?? callChain(node.body.expression)
        patterns.push({
            id,
            label,
            muted: label.startsWith('_') || label.endsWith('_'),
            labelFrom: node.label.start,
            labelTo: node.label.end,
            from: node.start,
            to: node.end,
            lineFrom: node.loc.start.line,
            lineTo: node.loc.end.line,
            soundName: soundName(calls),
            calls,
            ...(versioned ? { variants: versioned.variants } : {}),
        })
    }
    const body = ast.body as Node[]
    const { tempo, locked } = tempoOf(body, readMeter(code).quarters)
    return { patterns, tempo, tempoLocked: locked, insertAt: body[0]?.start ?? 0, error: null }
}

import { parse } from 'acorn'
import type { Arg, Call, PatternBlock, Song, Tempo } from './types'

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
        if (calls.length) return { kind: 'chain', calls, from: node.start, to: node.end }
    }
    return { kind: 'other', from: node.start, to: node.end }
}

function callChain(expression: Node): Call[] {
    const calls: Call[] = []
    let node: Node | undefined = expression
    while (node && node.type === 'CallExpression') {
        const callee: Node = node.callee
        const args = (node.arguments as Node[]).map(toArg)
        if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
            calls.unshift({
                name: callee.property.name,
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

function tempoOf(body: Node[]): { tempo: Tempo | null; locked: boolean } {
    for (const node of body) {
        if (node.type !== 'ExpressionStatement' || node.expression.type !== 'CallExpression') continue
        const call: Node = node.expression
        if (call.callee.type !== 'Identifier' || call.arguments.length !== 1) continue
        const unit = TEMPO_UNITS[call.callee.name]
        if (!unit) continue
        const value = staticNumber(call.arguments[0])
        if (value === null) return { tempo: null, locked: true }
        const bpm = Math.round((unit === 'cpm' ? value * 4 : value * 240) * 100) / 100
        return { tempo: { bpm, from: call.arguments[0].start, to: call.arguments[0].end, unit }, locked: false }
    }
    return { tempo: null, locked: false }
}

export function analyze(code: string): Song {
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
        const calls = callChain(node.body.expression)
        patterns.push({
            id: bare.includes('$') ? `pattern ${++anonymous}` : bare,
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
        })
    }
    const body = ast.body as Node[]
    const { tempo, locked } = tempoOf(body)
    return { patterns, tempo, tempoLocked: locked, insertAt: body[0]?.start ?? 0, error: null }
}

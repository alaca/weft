import { parse } from 'acorn'
import type { PatternBlock, Song } from './types'

type Node = { type: string; start: number; end: number; loc: { start: { line: number }; end: { line: number } }; [key: string]: any }

type Call = { name: string; args: Node[] }

const ONE_WORD = /^[\w-]+$/

function callChain(expression: Node): Call[] {
    const calls: Call[] = []
    let node: Node | undefined = expression
    while (node && node.type === 'CallExpression') {
        const callee: Node = node.callee
        if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
            calls.unshift({ name: callee.property.name, args: node.arguments })
            node = callee.object
        } else if (callee.type === 'Identifier') {
            calls.unshift({ name: callee.name, args: node.arguments })
            node = undefined
        } else {
            node = undefined
        }
    }
    return calls
}

function stringArg(call: Call): string | null {
    const first = call.args[0]
    return first && first.type === 'Literal' && typeof first.value === 'string' ? first.value : null
}

function soundName(expression: Node): string | null {
    const calls = callChain(expression)
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

export function analyze(code: string): Song {
    let ast: Node
    try {
        ast = parse(code, { ecmaVersion: 2022, allowAwaitOutsideFunction: true, locations: true }) as unknown as Node
    } catch (err) {
        const e = err as { message?: string; loc?: { line?: number } }
        return {
            patterns: [],
            error: { message: String(e.message ?? err).replace(/\s*\(\d+:\d+\)$/, ''), line: e.loc?.line ?? 1 },
        }
    }

    const patterns: PatternBlock[] = []
    let anonymous = 0
    for (const node of ast.body as Node[]) {
        if (node.type !== 'LabeledStatement' || node.body.type !== 'ExpressionStatement') continue
        const label: string = node.label.name
        const bare = label.replace(/^_+|_+$/g, '')
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
            soundName: soundName(node.body.expression),
        })
    }
    return { patterns, error: null }
}

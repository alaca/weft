import { parse, tokenizer, type Options } from 'acorn'

// The code laid out the way the app writes it: one blank line between the patterns of a song, a
// pattern's first call on the line with its name and each call after it on a line of its own,
// and the parts of a stack one to a line. Only spaces and line breaks move. What a string, a
// template or a comment says stays as it was written, and the result is read again and given
// back only when it is the same code, token for token and comment for comment.

type Node = { type: string; start: number; end: number; [key: string]: any }
type Note = { start: number; end: number; text: string }

const OPTIONS: Options = { ecmaVersion: 2022, allowAwaitOutsideFunction: true }
const STEP = '  '
// Calls whose parts are each a pattern of its own, one to a line when there are several.
const LISTS = new Set(['stack', 'cat', 'seq', 'sequence', 'fastcat', 'slowcat', 'arrange', 'polymeter', 'randcat', 'timecat', 'timeCat'])

export type Formatted = { code: string } | { why: string }

export function formatCode(code: string): Formatted {
    const notes: Note[] = []
    let ast: Node
    try {
        ast = parse(code, { ...OPTIONS, onComment: (block, text, start, end) => notes.push({ start, end, text: block ? `/*${text}*/` : `//${text}`.trimEnd() }) }) as unknown as Node
    } catch {
        return { why: 'The code has an error, so it cannot be laid out. Fix it first.' }
    }
    const out = layout(code, ast.body as Node[], notes)
    return sameCode(code, out) ? { code: out } : { why: 'The code could not be laid out without changing it, so it is left as it is.' }
}

function layout(code: string, body: Node[], notes: Note[]): string {
    const inside = (note: Note) => body.some((statement) => note.start >= statement.start && note.end <= statement.end)
    const items: { start: number; end: number; text: string; pattern: boolean }[] = [
        ...body.map((statement) => ({ start: statement.start, end: statement.end, text: statementText(code, statement, notes), pattern: statement.type === 'LabeledStatement' })),
        ...notes.filter((note) => !inside(note)).map((note) => ({ start: note.start, end: note.end, text: note.text, pattern: false })),
    ].sort((a, b) => a.start - b.start)
    let out = ''
    items.forEach((item, at) => {
        if (at > 0) {
            const before = items[at - 1]
            const lines = code.slice(before.end, item.start).split('\n').length - 1
            const isNote = (one: { text: string }) => one.text.startsWith('//') || one.text.startsWith('/*')
            if (lines === 0) out += ' '
            else if (lines > 1 || (!isNote(before) && (before.pattern || item.pattern))) out += '\n\n'
            else out += '\n'
        }
        out += item.text
    })
    return out ? `${out}\n` : ''
}

// A statement laid out, or as it was written when a comment inside it sits where lines would move.
function statementText(code: string, statement: Node, notes: Note[]): string {
    const written = code.slice(statement.start, statement.end).trim()
    const mine = notes.filter((note) => note.start >= statement.start && note.end <= statement.end)
    const said = new Set<Note>()
    const kept: [number, number][] = []
    const ctx: Ctx = { code, notes: mine, said, kept }
    let text: string | null = null
    if (statement.type === 'LabeledStatement' && statement.body.type === 'ExpressionStatement') {
        text = `${statement.label.name}: ${expression(ctx, statement.body.expression, '')}`
    } else if (statement.type === 'ExpressionStatement') {
        text = expression(ctx, statement.expression, '')
    }
    if (text === null) return written
    const lost = mine.some((note) => !said.has(note) && !kept.some(([from, to]) => note.start >= from && note.end <= to))
    if (lost) return written
    return code[statement.end - 1] === ';' ? `${text};` : text
}

type Ctx = { code: string; notes: Note[]; said: Set<Note>; kept: [number, number][] }

const verbatim = (ctx: Ctx, node: Node): string => {
    ctx.kept.push([node.start, node.end])
    return ctx.code.slice(node.start, node.end)
}

// The comments between two places, each on a line of its own at `indent`, except one that stands
// on the line the gap begins on, which stays at its end.
function gap(ctx: Ctx, from: number, to: number, indent: string): string {
    let out = ''
    for (const note of ctx.notes) {
        if (note.start < from || note.end > to || ctx.said.has(note)) continue
        ctx.said.add(note)
        const sameLine = !ctx.code.slice(from, note.start).includes('\n')
        out += sameLine && !out ? ` ${note.text}` : `\n${indent}${note.text}`
    }
    return out
}

function expression(ctx: Ctx, node: Node, indent: string): string {
    const links: Node[] = []
    let base = node
    while (base.type === 'CallExpression' && !base.optional && base.callee.type === 'MemberExpression' && !base.callee.computed && !base.callee.optional && base.callee.property.type === 'Identifier') {
        links.unshift(base)
        base = base.callee.object
    }
    let out = call(ctx, base, indent)
    let end = base.end
    for (const link of links) {
        const property = link.callee.property
        out += gap(ctx, end, property.start, indent + STEP)
        out += `\n${indent}${STEP}.${property.name}${args(ctx, link, indent + STEP, property.end)}`
        end = link.end
    }
    return out
}

function call(ctx: Ctx, node: Node, indent: string): string {
    if (node.type !== 'CallExpression' || node.optional) return verbatim(ctx, node)
    return verbatim(ctx, node.callee) + args(ctx, node, indent, node.callee.end)
}

// The arguments of a call, from its opening bracket on. `after` is where the callee ends.
function args(ctx: Ctx, node: Node, indent: string, after: number): string {
    const given: Node[] = node.arguments
    const open = ctx.code.indexOf('(', after)
    if (!given.length) {
        const said = gap(ctx, open + 1, node.end - 1, indent + STEP)
        return said ? `(${said}\n${indent})` : '()'
    }
    const name = node.callee.type === 'Identifier' ? node.callee.name : null
    const texts = given.map((arg) => verbatim(ctx, arg))
    const remarks = ctx.notes.some((note) => note.start > open && note.end < node.end && !given.some((arg) => note.start >= arg.start && note.end <= arg.end))
    const wrote = ctx.code.slice(node.start, node.end).includes('\n')
    // A comment among the arguments of a call written on one line stays in that line as it is.
    if (remarks && !wrote) {
        ctx.kept.push([open, node.end])
        return ctx.code.slice(open, node.end)
    }
    const listed = name !== null && LISTS.has(name) && (given.length > 1 || wrote)
    if (!listed && !remarks && (given.length === 1 || !texts.some((text) => text.includes('\n')))) return `(${texts.join(', ')})`
    const inner = indent + STEP
    let out = '('
    let from = open + 1
    given.forEach((arg, at) => {
        out += gap(ctx, from, arg.start, inner)
        out += `\n${inner}${texts[at]},`
        from = arg.end
    })
    out += gap(ctx, from, node.end - 1, inner)
    return `${out}\n${indent})`
}

// The two are the same code when they read as the same tokens, written alike, and the same
// comments. A comma before a closing bracket counts for nothing, as it does in the language.
function sameCode(a: string, b: string): boolean {
    const read = (code: string) => {
        const notes: string[] = []
        const tokens: string[] = []
        try {
            for (const token of tokenizer(code, { ...OPTIONS, onComment: (_block, text) => notes.push(text.trimEnd()) })) {
                const text = code.slice(token.start, token.end)
                if (/^[)\]}]$/.test(text) && tokens[tokens.length - 1] === ',') tokens.pop()
                tokens.push(text)
            }
        } catch {
            return null
        }
        return `${tokens.join('\u0000')}\u0001${notes.join('\u0000')}`
    }
    const first = read(a)
    return first !== null && first === read(b)
}

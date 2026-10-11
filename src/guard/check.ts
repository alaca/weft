import { parse } from 'acorn'
import { FUNCTIONS, MATH, METHODS } from './names'

// A song is code, and code can do anything the app can. A song that came from someone else is
// therefore only played when all of it is music code: patterns, sounds, numbers and text, the
// functions of Strudel that make and shape sound, values given a name, and small functions
// written with an arrow. Everything is refused unless it is known to be that, so what this
// check has never heard of is refused too.
export type Refused = { line: number; what: string }

type Node = { type: string; loc?: { start: { line: number } }; [key: string]: any }
type Scope = ReadonlySet<string>

const PLAIN = new Set(['undefined', 'NaN', 'Infinity'])
const UNARY = new Set(['-', '+', '!', '~', 'typeof', 'void'])
const BINARY = new Set(['+', '-', '*', '/', '%', '**', '==', '!=', '===', '!==', '<', '<=', '>', '>=', '&', '|', '^', '<<', '>>', '>>>'])
const HIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

// What a kind of code is called when it is refused, for the kinds a person is likely to meet.
const CALLED: Record<string, string> = {
    AssignmentExpression: 'changing a value with =',
    UpdateExpression: 'changing a value with ++ or --',
    NewExpression: 'new',
    ThisExpression: 'this',
    AwaitExpression: 'await',
    ImportExpression: 'import',
    ImportDeclaration: 'import',
    ExportNamedDeclaration: 'export',
    ExportDefaultDeclaration: 'export',
    FunctionExpression: 'a function written with the word function',
    FunctionDeclaration: 'a function written with the word function',
    ClassExpression: 'a class',
    ClassDeclaration: 'a class',
    TaggedTemplateExpression: 'a function put in front of text in backticks',
    SequenceExpression: 'several things in one with commas',
    IfStatement: 'if',
    ForStatement: 'a loop',
    ForInStatement: 'a loop',
    ForOfStatement: 'a loop',
    WhileStatement: 'a loop',
    DoWhileStatement: 'a loop',
    TryStatement: 'try',
    ThrowStatement: 'throw',
    ReturnStatement: 'return',
    BlockStatement: 'a block in curly brackets',
    YieldExpression: 'yield',
    MetaProperty: 'import',
    Super: 'super',
    DebuggerStatement: 'debugger',
    WithStatement: 'with',
    SwitchStatement: 'switch',
}

class Refusal extends Error {
    constructor(
        readonly node: Node,
        readonly what: string,
    ) {
        super(what)
    }
}

const refuse = (node: Node, what: string): never => {
    throw new Refusal(node, what)
}
const notMusic = (node: Node) => refuse(node, `${CALLED[node.type] ?? 'this'} is not music code`)

function member(node: Node, scope: Scope) {
    const { object, property } = node
    if (object.type === 'Identifier' && object.name === 'Math' && !scope.has('Math')) {
        if (node.computed || property.type !== 'Identifier' || !MATH.has(property.name)) refuse(property, 'only the numbers and functions of Math can be used from it')
        return
    }
    expression(object, scope)
    if (node.computed) {
        if (property.type !== 'Literal' || typeof property.value !== 'number') refuse(property, 'square brackets may only hold a plain number')
        return
    }
    if (property.type !== 'Identifier' || !METHODS.has(property.name)) refuse(property, `.${property.name ?? ''} is not something a song can use`)
}

function parameter(node: Node, scope: Scope): string {
    if (node.type === 'Identifier') return node.name
    if (node.type === 'RestElement' && node.argument.type === 'Identifier') return node.argument.name
    if (node.type === 'AssignmentPattern' && node.left.type === 'Identifier') {
        expression(node.right, scope)
        return node.left.name
    }
    return refuse(node, 'what a function takes must be plain names')
}

function expression(node: Node | null, scope: Scope): void {
    if (!node) return
    switch (node.type) {
        case 'Literal':
            if (node.regex) refuse(node, 'a search pattern between slashes is not music code')
            return
        case 'TemplateLiteral':
            return void node.expressions.forEach((inner: Node) => expression(inner, scope))
        case 'Identifier':
            if (scope.has(node.name) || FUNCTIONS.has(node.name) || PLAIN.has(node.name)) return
            return refuse(node, `${node.name} is not something a song can use`)
        case 'ChainExpression':
            return expression(node.expression, scope)
        case 'MemberExpression':
            return member(node, scope)
        case 'CallExpression':
            if (node.callee.type === 'MemberExpression') member(node.callee, scope)
            else if (node.callee.type === 'Identifier' || node.callee.type === 'ArrowFunctionExpression' || node.callee.type === 'CallExpression') expression(node.callee, scope)
            else notMusic(node.callee)
            return void node.arguments.forEach((given: Node) => expression(given.type === 'SpreadElement' ? given.argument : given, scope))
        case 'ArrowFunctionExpression': {
            if (node.async) refuse(node, 'a function that waits is not music code')
            if (node.body.type === 'BlockStatement') refuse(node.body, 'a function may only be one expression after its arrow')
            const inner = new Set(scope)
            for (const taken of node.params) inner.add(parameter(taken, inner))
            return expression(node.body, inner)
        }
        case 'UnaryExpression':
            if (!UNARY.has(node.operator)) refuse(node, `${node.operator} is not music code`)
            return expression(node.argument, scope)
        case 'BinaryExpression':
            if (!BINARY.has(node.operator)) refuse(node, `${node.operator} is not music code`)
            expression(node.left, scope)
            return expression(node.right, scope)
        case 'LogicalExpression':
            expression(node.left, scope)
            return expression(node.right, scope)
        case 'ConditionalExpression':
            expression(node.test, scope)
            expression(node.consequent, scope)
            return expression(node.alternate, scope)
        case 'ArrayExpression':
            return void node.elements.forEach((item: Node | null) => expression(item?.type === 'SpreadElement' ? item.argument : item, scope))
        case 'ObjectExpression':
            for (const entry of node.properties as Node[]) {
                if (entry.type === 'SpreadElement') {
                    expression(entry.argument, scope)
                    continue
                }
                const named = entry.key.type === 'Identifier' ? entry.key.name : entry.key.type === 'Literal' ? String(entry.key.value) : null
                if (entry.kind !== 'init' || entry.method || entry.computed || named === null || HIDDEN.has(named)) refuse(entry, 'a list of named values may only hold plain names and values')
                expression(entry.value, scope)
            }
            return
        default:
            return notMusic(node)
    }
}

function statement(node: Node, scope: Set<string>): void {
    if (node.type === 'EmptyStatement') return
    if (node.type === 'ExpressionStatement') return expression(node.expression, scope)
    if (node.type === 'LabeledStatement') {
        if (node.body.type !== 'ExpressionStatement' && node.body.type !== 'LabeledStatement') notMusic(node.body)
        return statement(node.body, scope)
    }
    if (node.type === 'VariableDeclaration') {
        if (node.kind === 'var') refuse(node, 'a name is given with const or let, not var')
        for (const made of node.declarations as Node[]) {
            if (made.id.type !== 'Identifier') refuse(made.id, 'a name is given to one value at a time')
            expression(made.init, scope)
            scope.add(made.id.name)
        }
        return
    }
    notMusic(node)
}

// Null when all of the code is music code. Otherwise the first thing that is not, and its line.
// Code that cannot be read at all is refused as well: it would not play either.
export function checkSong(code: string): Refused | null {
    let program: Node
    try {
        program = parse(code, { ecmaVersion: 2022, allowAwaitOutsideFunction: true, locations: true }) as unknown as Node
    } catch (err) {
        const failed = err as { message?: string; loc?: { line?: number } }
        return { line: failed.loc?.line ?? 1, what: String(failed.message ?? 'the code cannot be read').replace(/\s*\(\d+:\d+\)$/, '') }
    }
    const scope = new Set<string>()
    try {
        for (const node of program.body as Node[]) statement(node, scope)
        return null
    } catch (err) {
        if (err instanceof Refusal) return { line: err.node.loc?.start.line ?? 1, what: err.what }
        throw err
    }
}

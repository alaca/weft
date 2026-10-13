import { spawn } from 'node:child_process'
import { createRelay } from './relay'
import { createSite } from './site'
import { createStun } from './stun'

// The site and the relay of a jam as they run on a server, behind a web server that holds the
// certificate and passes requests on. Both listen on this machine only. Everything that differs
// from one place to another is read from the environment, so that nothing of a place is
// written into the project:
//
//   WEFT_RUN         `site` or `relay` to run only that one; both when not said. They are run
//                    apart on a server, so that the site can be renewed without ending a jam
//   WEFT_DATA        folder for accounts and published songs (must be there to start the site)
//   WEFT_ORIGIN      the address people reach the site at, like https://weftloom.dev
//   WEFT_SITE_PORT   port of the site, 5191 unless said
//   WEFT_RELAY_PORT  port of the relay, 5190 unless said
//   WEFT_STUN_PORT   port on which machines are told their address from outside, for calls
//                    between two networks; not run unless said. Open to the world, over UDP.
//   WEFT_SOURCE      where the source code can be read, when there is such a place
//   WEFT_RELEASES    folder that releases of the app are put into, when there is one
//   WEFT_SENDMAIL    a program that sends a mail it is given, like /usr/bin/msmtp
//   WEFT_MAIL_FROM   the address that mail is sent from
//   WEFT_STUN        who tells a machine its address from outside, as the app is to be told,
//                    like stun:weftloom.dev:3478
//   WEFT_TURN        who carries a call that cannot go directly, like turn:weftloom.dev:3479
//   WEFT_TURN_SECRET the secret that carrier shares with the site, for the passes it hands out
//   WEFT_REPORTS_TO  the address that is mailed when a song is reported; reports are kept
//                    either way, and nobody is mailed unless this is set
//
// Without the last two the site sends no mail, and says so to whoever forgot a password.
const env = process.env
const port = (value: string | undefined, usual: number): number => {
    const read = Number(value ?? usual)
    if (!Number.isInteger(read) || read < 1 || read > 65535) throw new Error(`${value} is not a port.`)
    return read
}

// A mail, handed to the program that sends mail. The address it goes to was checked to be one
// address and nothing more before it comes here, and what a stranger wrote is only ever in the
// body, on lines of its own, never in a line of the head.
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ')
function mailer(program: string, from: string) {
    return (to: string, subject: string, lines: string[]) =>
        new Promise<void>((done, failed) => {
            const sending = spawn(program, ['-t', '-f', from], { stdio: ['pipe', 'ignore', 'ignore'] })
            sending.on('error', failed)
            sending.on('close', (status) => (status === 0 ? done() : failed(new Error(`${program} ended with ${status}`))))
            sending.stdin.end([`From: Weft Loom <${from}>`, `To: ${to}`, `Subject: ${oneLine(subject)}`, 'Content-Type: text/plain; charset=utf-8', '', ...lines.map(oneLine), ''].join('\r\n'))
        })
}
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

async function start() {
    const run = env.WEFT_RUN ?? 'both'
    if (!['site', 'relay', 'both'].includes(run)) throw new Error('WEFT_RUN is neither site nor relay.')
    const closing: (() => Promise<void>)[] = []
    let ending = false
    const end = () => {
        if (ending) return
        ending = true
        void Promise.allSettled(closing.map((close) => close())).then(() => process.exit(0))
        setTimeout(() => process.exit(0), 5000).unref()
    }
    process.on('SIGTERM', end)
    process.on('SIGINT', end)

    if (run !== 'site') {
        const relay = await createRelay({ port: port(env.WEFT_RELAY_PORT, 5190), host: '127.0.0.1', behindProxy: true })
        closing.push(relay.close)
        console.log(`weft: relay on 127.0.0.1:${relay.port}`)
        if (env.WEFT_STUN_PORT) {
            const stun = await createStun({ port: port(env.WEFT_STUN_PORT, 3478) })
            closing.push(stun.close)
            console.log(`weft: addresses told on UDP ${stun.port}`)
        }
    }
    if (run === 'relay') return

    const dataDir = env.WEFT_DATA
    const origin = env.WEFT_ORIGIN
    if (!dataDir) throw new Error('WEFT_DATA is not set: the folder for accounts and published songs.')
    if (!origin || !/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error('WEFT_ORIGIN is not set to an https address without a path, like https://weftloom.dev.')
    const from = env.WEFT_MAIL_FROM
    const program = env.WEFT_SENDMAIL
    if (Boolean(from) !== Boolean(program)) throw new Error('WEFT_SENDMAIL and WEFT_MAIL_FROM go together: set both, or neither.')
    if (from && !ADDRESS.test(from)) throw new Error('WEFT_MAIL_FROM is not an email address.')
    const reportsTo = env.WEFT_REPORTS_TO
    if (reportsTo && (!ADDRESS.test(reportsTo) || !from)) throw new Error('WEFT_REPORTS_TO needs to be an email address, and needs the two settings for sending mail.')
    const send = from && program ? mailer(program, from) : null

    const site = await createSite({
        port: port(env.WEFT_SITE_PORT, 5191),
        host: '127.0.0.1',
        dataDir,
        origin,
        source: env.WEFT_SOURCE,
        releases: env.WEFT_RELEASES,
        behindProxy: true,
        ice: {
            stun: env.WEFT_STUN ? [env.WEFT_STUN] : undefined,
            turn: env.WEFT_TURN && env.WEFT_TURN_SECRET ? { urls: [`${env.WEFT_TURN}?transport=udp`, `${env.WEFT_TURN}?transport=tcp`], secret: env.WEFT_TURN_SECRET } : undefined,
        },
        mail: send
            ? (to, code) =>
                  send(to, 'Your code for a new Weft Loom password', [
                      'Someone, most likely you, asked for a new password for the Weft Loom account with this email.',
                      '',
                      `The code is ${code}`,
                      '',
                      'Type it into the app, with the new password. It works once and for a quarter of an hour.',
                      'If it was not you, do nothing: the password stays as it is.',
                  ])
            : undefined,
        reported: send && reportsTo ? (report) => send(reportsTo, `A song on Weft Loom was reported: ${report.name}`, [`The song: ${origin}/songs/${report.id}`, '', 'What was said about it:', report.reason, '', 'It can be hidden or deleted by whoever published it, in the app under Your account.']) : undefined,
    })
    closing.push(site.close)
    console.log(`weft: site on 127.0.0.1:${site.port} as ${origin}, mail ${from ? 'on' : 'off'}`)
}

// The site and every jam run in this one program. Something that goes wrong for one request or
// one message is noted and must not end it for everyone.
process.on('uncaughtException', (err) => console.error(`weft: ${err?.stack ?? err}`))
process.on('unhandledRejection', (err) => console.error(`weft: ${err instanceof Error ? (err.stack ?? err.message) : err}`))

start().catch((err) => {
    console.error(`weft: not started. ${err instanceof Error ? err.message : err}`)
    process.exit(1)
})

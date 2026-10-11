import { spawn } from 'node:child_process'
import { createRelay } from './relay'
import { createSite } from './site'

// The site and the relay of a jam as they run on a server, behind a web server that holds the
// certificate and passes requests on. Both listen on this machine only. Everything that differs
// from one place to another is read from the environment, so that nothing of a place is
// written into the project:
//
//   WEFT_DATA        folder for accounts and published songs (must be there to start)
//   WEFT_ORIGIN      the address people reach the site at, like https://weftloom.dev
//   WEFT_SITE_PORT   port of the site, 5191 unless said
//   WEFT_RELAY_PORT  port of the relay, 5190 unless said
//   WEFT_SOURCE      where the source code can be read, when there is such a place
//   WEFT_SENDMAIL    a program that sends a mail it is given, like /usr/bin/msmtp
//   WEFT_MAIL_FROM   the address that mail is sent from
//
// Without the last two the site sends no mail, and says so to whoever forgot a password.
const env = process.env
const port = (value: string | undefined, usual: number): number => {
    const read = Number(value ?? usual)
    if (!Number.isInteger(read) || read < 1 || read > 65535) throw new Error(`${value} is not a port.`)
    return read
}

// A code for a new password, handed to the program that sends mail. The address was checked to
// be one address and nothing more before it comes here.
function mailer(program: string, from: string) {
    return (to: string, code: string) =>
        new Promise<void>((done, failed) => {
            const sending = spawn(program, ['-t', '-f', from], { stdio: ['pipe', 'ignore', 'ignore'] })
            sending.on('error', failed)
            sending.on('close', (status) => (status === 0 ? done() : failed(new Error(`${program} ended with ${status}`))))
            sending.stdin.end(
                [
                    `From: Weft <${from}>`,
                    `To: ${to}`,
                    'Subject: Your code for a new Weft password',
                    'Content-Type: text/plain; charset=utf-8',
                    '',
                    `Someone, most likely you, asked for a new password for the Weft account with this email.`,
                    '',
                    `The code is ${code}`,
                    '',
                    'Type it into the app, with the new password. It works once and for a quarter of an hour.',
                    'If it was not you, do nothing: the password stays as it is.',
                    '',
                ].join('\r\n'),
            )
        })
}

async function start() {
    const dataDir = env.WEFT_DATA
    const origin = env.WEFT_ORIGIN
    if (!dataDir) throw new Error('WEFT_DATA is not set: the folder for accounts and published songs.')
    if (!origin || !/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error('WEFT_ORIGIN is not set to an https address without a path, like https://weftloom.dev.')
    const from = env.WEFT_MAIL_FROM
    const program = env.WEFT_SENDMAIL
    if (Boolean(from) !== Boolean(program)) throw new Error('WEFT_SENDMAIL and WEFT_MAIL_FROM go together: set both, or neither.')
    if (from && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) throw new Error('WEFT_MAIL_FROM is not an email address.')

    const site = await createSite({
        port: port(env.WEFT_SITE_PORT, 5191),
        host: '127.0.0.1',
        dataDir,
        origin,
        source: env.WEFT_SOURCE,
        behindProxy: true,
        mail: from && program ? mailer(program, from) : undefined,
    })
    const relay = await createRelay({ port: port(env.WEFT_RELAY_PORT, 5190), host: '127.0.0.1', behindProxy: true })
    console.log(`weft: site on 127.0.0.1:${site.port} as ${origin}, relay on 127.0.0.1:${relay.port}, mail ${from ? 'on' : 'off'}`)

    let ending = false
    const end = () => {
        if (ending) return
        ending = true
        void Promise.allSettled([site.close(), relay.close()]).then(() => process.exit(0))
        setTimeout(() => process.exit(0), 5000).unref()
    }
    process.on('SIGTERM', end)
    process.on('SIGINT', end)
}

start().catch((err) => {
    console.error(`weft: not started. ${err instanceof Error ? err.message : err}`)
    process.exit(1)
})

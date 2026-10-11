import type { IncomingMessage } from 'node:http'

// Who a request comes from, for the limits that are kept per sender. Behind a web server that
// passes requests on, every request arrives from that server, so the address it noted is
// taken instead. That is only believed where it is said that there is such a server in front:
// anyone could write the same line into a request sent here directly.
export function senderOf(request: IncomingMessage, behindProxy: boolean | undefined): string {
    const noted = behindProxy ? request.headers['x-real-ip'] : undefined
    const address = (Array.isArray(noted) ? noted[0] : noted)?.trim()
    return address || request.socket.remoteAddress || ''
}

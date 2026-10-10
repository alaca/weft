const NAMES: Record<string, string> = {
    bd: 'Kick',
    sd: 'Snare',
    cp: 'Clap',
    rim: 'Rim',
    hh: 'Closed hat',
    oh: 'Open hat',
    lt: 'Low tom',
    mt: 'Mid tom',
    ht: 'High tom',
    cr: 'Crash',
    rd: 'Ride',
    cb: 'Cowbell',
    sh: 'Shaker',
    tb: 'Tambourine',
    perc: 'Percussion',
    misc: 'Other',
    fx: 'Effect',
}

const USUAL = ['bd', 'sd', 'cp', 'rim', 'hh', 'oh', 'lt', 'mt', 'ht', 'cr', 'rd', 'cb', 'sh', 'tb', 'perc', 'misc', 'fx']
const FALLBACK = ['bd', 'sd', 'cp', 'rim', 'hh', 'oh', 'lt', 'ht', 'cr', 'rd']

export const drumLabel = (sound: string): string => NAMES[sound] ?? sound

export function drumChoices(available: string[], used: string[]): { sound: string; label: string }[] {
    const pool = available.length ? available : FALLBACK
    const rank = (sound: string) => (USUAL.includes(sound) ? USUAL.indexOf(sound) : USUAL.length)
    return [...new Set(pool)]
        .filter((sound) => !used.includes(sound))
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
        .map((sound) => ({ sound, label: drumLabel(sound) }))
}

export function maskSliders(code: string): string {
    return code.replace(/slider\(\s*-?\d*\.?\d+/g, 'slider(#')
}

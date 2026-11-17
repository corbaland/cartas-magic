const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const usdFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' })
const numFmt = new Intl.NumberFormat('es-ES')

export function eur(value: string | number | null | undefined): string | null {
  return value == null ? null : eurFmt.format(Number(value))
}

export function usd(value: string | number | null | undefined): string | null {
  return value == null ? null : usdFmt.format(Number(value))
}

export function num(value: string | number | null | undefined): string | null {
  return value == null ? null : numFmt.format(Number(value))
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${numFmt.format(n)} ${many}`
}

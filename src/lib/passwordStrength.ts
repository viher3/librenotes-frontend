import { COMMON_PASSWORDS } from './commonPasswords'

/**
 * A rough, local estimate of how hard a password is to guess. It is advisory only (the backend's 8-44 rule is
 * what decides) and a heuristic, not a measure of entropy: no dictionary beyond a short list of the most common
 * passwords, no network, and nothing is stored.
 */
export type StrengthLevel = 0 | 1 | 2 | 3

/** The single most useful thing to change, as a key under `password.strength.tips`. */
export type StrengthHint =
  'tooShort' | 'addVariety' | 'avoidRepeats' | 'avoidCommon' | 'avoidPersonal'

export interface PasswordContext {
  email?: string
  username?: string
}

export interface PasswordStrength {
  level: StrengthLevel
  hint: StrengthHint | null
}

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890']
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
}
const MIN_LENGTH = 8
const MIN_RUN = 5
/** Only count a sequence against the password when it makes up a good part of it. */
const RUN_SHARE = 0.4
const MIN_PERSONAL_LENGTH = 3
const MAX_BLOCK = 6
const REPEAT_SHARE = 0.9

export function scorePassword(password: string, context: PasswordContext = {}): PasswordStrength {
  const chars = [...password]
  const length = chars.length
  if (length < MIN_LENGTH) return { level: 0, hint: length === 0 ? null : 'tooShort' }

  // One or two distinct characters, however many: that is not a password.
  if (new Set(chars).size <= 2) return { level: 0, hint: 'avoidRepeats' }

  // Length is the main factor: a long phrase beats a short password full of symbols.
  const base: StrengthLevel = length < 12 ? 1 : length < 16 ? 2 : 3
  const classes = countClasses(password)

  let level: number = base
  if (classes < 2) level = Math.min(level, length >= 20 ? 2 : 1)
  else if (classes >= 3 && length >= 10) level += 1
  level = Math.min(level, 3)

  const repeated = hasRepeats(chars)
  const sequential = hasSequence(password.toLowerCase(), length)
  const common = isCommon(password)
  const personal = containsPersonal(password, context)
  for (const penalty of [repeated || sequential, common, personal]) {
    if (penalty) level -= 1
  }

  const final = Math.max(0, level) as StrengthLevel
  return {
    level: final,
    hint: pickHint({
      length,
      classes,
      repeated: repeated || sequential,
      common,
      personal,
      level: final,
    }),
  }
}

function pickHint(s: {
  length: number
  classes: number
  repeated: boolean
  common: boolean
  personal: boolean
  level: StrengthLevel
}): StrengthHint | null {
  if (s.personal) return 'avoidPersonal'
  if (s.common) return 'avoidCommon'
  if (s.repeated) return 'avoidRepeats'
  if (s.classes < 2 && s.length < 20) return 'addVariety'
  if (s.length < 12 && s.level < 3) return 'tooShort'
  return null
}

/** Lower case, upper case, digits and everything else (symbols, spaces); other scripts count as letters. */
function countClasses(password: string): number {
  return [/\p{Ll}|\p{Lo}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((r) => r.test(password))
    .length
}

/** `aaaaaa`, `abababab`, `xyz-xyz-xyz`: a character or a short block repeated over and over. */
function hasRepeats(chars: string[]): boolean {
  if (/(.)\1{3,}/su.test(chars.join(''))) return true

  // A block of up to MAX_BLOCK characters that (almost) every later character repeats.
  for (let period = 1; period <= MAX_BLOCK && period * 2 <= chars.length; period++) {
    let matches = 0
    for (let i = period; i < chars.length; i++) if (chars[i] === chars[i - period]) matches++
    if (matches / (chars.length - period) >= REPEAT_SHARE) return true
  }
  return false
}

/** `12345`, `edcba`, `qwerty`: a run of neighbours in the alphabet, the digits or a keyboard row. */
function hasSequence(lower: string, length: number): boolean {
  const threshold = Math.max(MIN_RUN, Math.ceil(length * RUN_SHARE))
  const codes = [...lower].map((c) => c.codePointAt(0) ?? 0)

  let run = 1
  let direction = 0
  for (let i = 1; i < codes.length; i++) {
    const step = codes[i] - codes[i - 1]
    if ((step === 1 || step === -1) && (direction === 0 || direction === step)) {
      run += 1
      direction = step
    } else {
      run = step === 1 || step === -1 ? 2 : 1
      direction = step === 1 || step === -1 ? step : 0
    }
    if (run >= threshold) return true
  }

  return KEYBOARD_ROWS.some(
    (row) =>
      longestShared(lower, row) >= threshold ||
      longestShared(lower, [...row].reverse().join('')) >= threshold,
  )
}

/** Length of the longest piece of `row` that appears in `text` (rows are short, so this stays cheap). */
function longestShared(text: string, row: string): number {
  let best = 0
  for (let start = 0; start < row.length; start++) {
    for (let end = start + best + 1; end <= row.length; end++) {
      if (text.includes(row.slice(start, end))) best = end - start
      else break
    }
  }
  return best
}

function isCommon(password: string): boolean {
  const lower = password.toLowerCase()
  const folded = [...lower].map((c) => LEET[c] ?? c).join('')
  const candidates = new Set<string>([lower, folded])
  // "password2024!" is still "password": drop what is stuck on the end.
  for (const value of [lower, folded]) candidates.add(value.replace(/[\d\p{P}\p{S}\s]+$/u, ''))
  return [...candidates].some(
    (c) => COMMON_PASSWORDS.has(c) || COMMON_PASSWORDS.has(c.replace(/\s+/g, '')),
  )
}

function containsPersonal(password: string, { email, username }: PasswordContext): boolean {
  const lower = password.toLowerCase()
  const needles = [email?.split('@')[0], username]
    .map((v) => v?.trim().toLowerCase() ?? '')
    .filter((v) => v.length >= MIN_PERSONAL_LENGTH)
  return needles.some((n) => lower.includes(n))
}

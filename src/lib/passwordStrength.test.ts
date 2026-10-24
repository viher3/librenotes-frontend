import { describe, expect, it } from 'vitest'
import { scorePassword } from './passwordStrength'

const level = (password: string, context?: Parameters<typeof scorePassword>[1]) =>
  scorePassword(password, context).level

describe('scorePassword', () => {
  it('says nothing about an empty password and calls a short one weak', () => {
    expect(scorePassword('')).toEqual({ level: 0, hint: null })
    expect(scorePassword('aB3$')).toEqual({ level: 0, hint: 'tooShort' })
    expect(level('aB3$xY7')).toBe(0) // 7 characters: below the minimum
  })

  it.each([
    [8, 1],
    [11, 1],
    [12, 2],
    [15, 2],
    [16, 3],
  ])('rewards length: %i varied characters give level %i', (length, expected) => {
    // Mixed classes but no repeat, sequence or common word, so only length decides (the bonus needs 3 classes).
    const password = 'Kx9_mQ4wTz7#vB2rLn5@Jd8h'.slice(0, length)
    const withBonus = Math.min(3, expected + (length >= 10 ? 1 : 0))
    expect(level(password)).toBe(withBonus)
  })

  it('caps a password with a single character class', () => {
    expect(level('jkxqzwvbmnhgfdsa')).toBe(1) // 16 lower-case letters, no variety
    expect(level('jkxqzwvbmnhgfdsapoiu')).toBe(2) // 20 are enough for "Good"
  })

  it('does not over-penalise a long lower-case passphrase with spaces', () => {
    expect(level('horse stapler purple lamp')).toBe(3)
  })

  it('penalises repeats', () => {
    expect(level('aaaaaaaaaaaaaaaaaaaa')).toBe(0)
    expect(level('abababababababab')).toBe(0)
    expect(level('xyz-xyz-xyz-xyz-xyz')).toBeLessThan(level('xyq-wmz-pLk-vtc-nbd'))
    expect(scorePassword('Zaaaaa9!Kd').hint).toBe('avoidRepeats')
  })

  it.each(['12345678', 'abcdefgh', 'hgfedcba', '98765432', 'qwertyuiop', 'asdfghjkl', 'mnbvcxz'])(
    'penalises the sequence %s',
    (password) => {
      expect(level(password)).toBe(0)
    },
  )

  it('ignores a short sequence inside a long, varied password', () => {
    expect(level('Tr4in!abcde-lampshade-9Zq')).toBe(3)
  })

  it.each([
    'password',
    'Password1',
    'p4ssw0rd',
    'PASSWORD123',
    'Qwerty123!',
    'iloveyou',
    'contraseña'.normalize('NFD'),
  ])('knows the common password %s', (password) => {
    expect(level(password)).toBeLessThanOrEqual(1)
  })

  it('flags a common password with its hint', () => {
    expect(scorePassword('letmein2024!').hint).toBe('avoidCommon')
    expect(scorePassword('Welcome123').level).toBeLessThanOrEqual(1)
  })

  it('penalises the user name and the email', () => {
    const plain = level('Orange-ladder-54')
    expect(level('Orange-ladder-54', { username: 'ladder' })).toBe(plain - 1)
    expect(level('Orange-ladder-54', { email: 'orange@example.com' })).toBe(plain - 1)
    expect(scorePassword('Orange-ladder-54', { username: 'ladder' }).hint).toBe('avoidPersonal')
  })

  it('ignores user names too short to be telling', () => {
    expect(level('Orange-ladder-54', { username: 'or' })).toBe(level('Orange-ladder-54'))
  })

  it('never goes below weak', () => {
    expect(level('password', { username: 'password', email: 'password@example.com' })).toBe(0)
  })

  it('asks for variety when there is only one class', () => {
    expect(scorePassword('jkxqzwvbmnhg').hint).toBe('addVariety')
  })

  it('suggests a longer phrase when it is short but otherwise fine', () => {
    expect(scorePassword('Kx9_mQ4w').hint).toBe('tooShort')
    expect(scorePassword('Kx9_mQ4wTz7#vB2rLn5@').hint).toBeNull()
  })

  it('handles any input without throwing and is deterministic', () => {
    for (const password of [
      '🔒🔑🗝️🔐🔓🔏🔒🔑',
      'ÅÄÖåäö-ÅÄÖåäö',
      '日本語のパスワードです',
      ' '.repeat(10),
      '\u0000'.repeat(9),
    ]) {
      expect(() => scorePassword(password)).not.toThrow()
      expect(scorePassword(password)).toEqual(scorePassword(password))
    }
  })
})

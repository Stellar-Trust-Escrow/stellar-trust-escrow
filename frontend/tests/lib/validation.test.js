import { isValidStellarAddress } from '../../lib/validation';

describe('isValidStellarAddress', () => {
  const VALID = 'GA7YNBW5CBTJZ3ZZOWX3ZNBKD6OE7A7IHUQVWMY62W2ZBG2SGZVOOPVH';

  it('Test 1: rejects a 55-character string', () => {
    const short = VALID.slice(0, 55); // 55 chars
    expect(isValidStellarAddress(short)).toBe(false);
  });

  it('Test 2: rejects a 56-character string starting with S (secret key)', () => {
    const secretKey = 'S' + VALID.slice(1); // same length, starts with S
    expect(isValidStellarAddress(secretKey)).toBe(false);
  });

  it('Test 3: accepts a valid G-address and returns true', () => {
    expect(isValidStellarAddress(VALID)).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidStellarAddress(`  ${VALID}  `)).toBe(true);
  });

  it('rejects a 57-character string', () => {
    expect(isValidStellarAddress(VALID + 'A')).toBe(false);
  });

  it('rejects lowercase characters', () => {
    expect(isValidStellarAddress(VALID.toLowerCase())).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidStellarAddress('')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidStellarAddress(null)).toBe(false);
    expect(isValidStellarAddress(undefined)).toBe(false);
  });
});

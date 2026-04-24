import { truncateAddress, isValidStellarAddress, stroopsToXlm } from '../lib/stellar';

describe('stellar utils', () => {
  it('truncates address correctly', () => {
    const addr = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(truncateAddress(addr, 6, 4)).toBe('GABCDE…WXYZ');
  });

  it('validates stellar addresses', () => {
    expect(isValidStellarAddress('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWNA')).toBe(
      true,
    );
    expect(isValidStellarAddress('invalid')).toBe(false);
    expect(isValidStellarAddress('')).toBe(false);
  });

  it('converts stroops to XLM', () => {
    expect(stroopsToXlm('10000000')).toBe('1.00');
    expect(stroopsToXlm('100000000')).toBe('10.00');
  });
});

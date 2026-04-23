import { truncateAddress, isValidStellarAddress, stroopsToXlm } from '../lib/stellar';

describe('stellar utils', () => {
  it('truncates address correctly', () => {
    const addr = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(truncateAddress(addr, 6, 4)).toBe('GABCDE\u2026WXYZ');
  });

  it('validates stellar addresses', () => {
    expect(isValidStellarAddress('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN')).toBe(
      true,
    );
    expect(isValidStellarAddress('invalid')).toBe(false);
    expect(isValidStellarAddress('')).toBe(false);
  });

  it('converts stroops to XLM', () => {
    // 10_000_000 stroops = 1 XLM
    const oneXlm = stroopsToXlm('10000000');
    expect(parseFloat(oneXlm.replace(/,/g, ''))).toBeCloseTo(1, 2);

    const tenXlm = stroopsToXlm('100000000');
    expect(parseFloat(tenXlm.replace(/,/g, ''))).toBeCloseTo(10, 2);
  });
});

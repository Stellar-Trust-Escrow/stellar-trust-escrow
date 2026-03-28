'use client';

/**
 * CurrencyAmount
 *
 * Renders a monetary amount converted to the user's selected currency.
 * Shows the fiat value prominently and the USDC denomination as a subtitle.
 *
 * @param {object}  props
 * @param {string|number|bigint} props.amount   — raw on-chain stroop amount
 * @param {boolean} [props.showUsdc=false]      — show "X USDC" below the fiat value
 * @param {boolean} [props.compact=false]       — use compact notation (1.2K)
 * @param {string}  [props.className]
 * @param {'sm'|'md'|'lg'} [props.size='md']
 *
 * @example
 * // Raw stroop amount from API
 * <CurrencyAmount amount="2000000000" showUsdc />
 * // → "$200.00" (USD) or "€184.00" (EUR)
 * //   "200.00 USDC"
 */

import { useCurrency } from '../../contexts/CurrencyContext.jsx';

const SIZE_CLASSES = {
  sm: { value: 'text-sm font-semibold', sub: 'text-xs' },
  md: { value: 'text-base font-bold',   sub: 'text-xs' },
  lg: { value: 'text-2xl font-bold',    sub: 'text-sm' },
};

export default function CurrencyAmount({
  amount,
  showUsdc = false,
  compact = false,
  className = '',
  size = 'md',
}) {
  const { format, formatUSDC, ratesLoading } = useCurrency();
  const classes = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;

  if (amount === undefined || amount === null) {
    return <span className={`text-gray-500 ${classes.value} ${className}`}>—</span>;
  }

  const fiatStr = format(amount, { compact });
  const usdcStr = formatUSDC(amount);

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span
        className={`${classes.value} text-white ${ratesLoading ? 'opacity-70' : ''}`}
        title={usdcStr}
      >
        {fiatStr}
      </span>
      {showUsdc && (
        <span className={`${classes.sub} text-gray-500`}>{usdcStr}</span>
      )}
    </span>
  );
}

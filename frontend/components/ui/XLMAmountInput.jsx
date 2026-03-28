/**
 * XLMAmountInput
 *
 * A number input with an XLM symbol prefix positioned inside the field.
 * Drop-in replacement for plain <input type="number"> on amount fields.
 *
 * Props:
 *   value       — controlled value
 *   onChange    — change handler (receives the event)
 *   placeholder — defaults to "0.00"
 *   className   — extra classes applied to the outer wrapper
 *   inputClassName — extra classes applied to the <input>
 *   id          — forwarded to <input> for label association
 */
export default function XLMAmountInput({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  inputClassName = '',
  id,
  ...rest
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <span
        className="absolute left-3 text-gray-400 text-sm font-medium select-none pointer-events-none"
        aria-hidden="true"
      >
        XLM
      </span>
      <input
        id={id}
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg pl-12 pr-4 py-2.5
                    text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500
                    ${inputClassName}`}
        {...rest}
      />
    </div>
  );
}

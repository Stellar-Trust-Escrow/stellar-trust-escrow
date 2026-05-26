/**
 * XLMAmountInput
 *
 * A number input with an XLM symbol prefix positioned inside the field.
 * Drop-in replacement for plain <input type="number"> on amount fields.
 *
 * Props:
 *   value          — controlled value
 *   onChange       — change handler (receives the event)
 *   placeholder    — defaults to "0.00"
 *   className      — extra classes applied to the outer wrapper
 *   inputClassName — extra classes applied to the <input>
 *   id             — forwarded to <input> for label association
 *   error          — error message string; triggers red border when set
 *   errorId        — id for the error <p> element (for aria-describedby)
 */
export default function XLMAmountInput({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  inputClassName = '',
  id,
  error,
  errorId,
  ...rest
}) {
  return (
    <div className={`relative flex flex-col ${className}`}>
      <div className="relative flex items-center">
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
          aria-invalid={!!error}
          aria-describedby={error && errorId ? errorId : undefined}
          className={`w-full bg-gray-800 border rounded-lg pl-12 pr-4 py-2.5
                      text-white placeholder-gray-500 focus:outline-none transition-colors
                      ${error ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-indigo-500'}
                      ${inputClassName}`}
          {...rest}
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

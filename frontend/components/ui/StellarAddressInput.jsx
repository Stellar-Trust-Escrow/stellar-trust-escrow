import { isValidStellarAddress } from '../../lib/validation';

/**
 * Controlled address input with inline Stellar validation.
 *
 * Props:
 *   value      {string}   controlled value
 *   onChange   {function} called with the trimmed string on every keystroke
 *   label      {string}   field label
 *   placeholder {string}
 *   id         {string}   for label/input association
 *   required   {boolean}
 */
export default function StellarAddressInput({
  value,
  onChange,
  label = 'Stellar Address',
  placeholder = 'GABCD…',
  id = 'stellar-address',
  required = false,
}) {
  const touched = value.length > 0;
  const isValid = isValidStellarAddress(value);
  const showError = touched && !isValid;

  function handleChange(e) {
    onChange(e.target.value);
  }

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm text-gray-400 mb-1">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        aria-invalid={showError}
        aria-describedby={showError ? `${id}-error` : undefined}
        className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white
          placeholder-gray-500 focus:outline-none transition-colors
          ${showError ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-indigo-500'}`}
      />
      {showError && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-400" role="alert">
          Invalid Stellar address. Must be 56 characters starting with G.
        </p>
      )}
    </div>
  );
}

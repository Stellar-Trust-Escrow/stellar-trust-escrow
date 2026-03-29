import { render, screen, fireEvent } from '@testing-library/react';
import StellarAddressInput from '../../../components/ui/StellarAddressInput';

const VALID = 'GA7YNBW5CBTJZ3ZZOWX3ZNBKD6OE7A7IHUQVWMY62W2ZBG2SGZVOOPVH';

function renderInput(value, onChange = jest.fn()) {
  return render(
    <StellarAddressInput value={value} onChange={onChange} id="test-addr" />,
  );
}

describe('StellarAddressInput', () => {
  it('Test 1: shows error for a 55-character string', () => {
    renderInput(VALID.slice(0, 55));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid Stellar address');
  });

  it('Test 2: shows error for a 56-character string starting with S', () => {
    renderInput('S' + VALID.slice(1));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid Stellar address');
  });

  it('Test 3: shows no error and marks input valid for a correct G-address', () => {
    renderInput(VALID);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('shows no error when the field is empty (not yet touched)', () => {
    renderInput('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('trims whitespace and calls onChange with trimmed value', () => {
    const onChange = jest.fn();
    renderInput('', onChange);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: `  ${VALID}  ` } });
    expect(onChange).toHaveBeenCalledWith(VALID);
  });

  it('marks input aria-invalid when value is invalid', () => {
    renderInput('INVALID');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});

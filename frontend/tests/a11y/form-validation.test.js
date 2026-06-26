/**
 * Form Validation Tests
 *
 * Tests inline field validation, real-time error messages, ARIA support,
 * and specific error messaging for form controls.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock validation schemas
const createMockValidator = (rules) => {
  return (value) => {
    const errors = [];

    if (rules.required && !value) {
      errors.push(rules.required.message);
    }

    if (rules.stellar && value && !value.startsWith('G')) {
      errors.push(rules.stellar.message);
    }

    if (rules.minLength && value && value.length < rules.minLength.value) {
      errors.push(`Minimum ${rules.minLength.value} characters required`);
    }

    if (rules.email && value && !value.includes('@')) {
      errors.push('Invalid email address');
    }

    return errors;
  };
};

describe('Form Validation', () => {
  describe('Inline Field Validation', () => {
    it('should show error on blur when field is invalid', async () => {
      const user = userEvent.setup();

      const TestForm = () => {
        const [email, setEmail] = React.useState('');
        const [touched, setTouched] = React.useState(false);
        const [errors, setErrors] = React.useState([]);

        const validateEmail = (value) => {
          if (!value) return ['Email is required'];
          if (!value.includes('@')) return ['Invalid email address'];
          return [];
        };

        const handleBlur = () => {
          setTouched(true);
          setErrors(validateEmail(email));
        };

        return (
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={handleBlur}
              aria-describedby={touched && errors.length ? 'email-error' : undefined}
            />
            {touched && errors.length > 0 && (
              <div id="email-error" role="alert">
                {errors[0]}
              </div>
            )}
          </div>
        );
      };

      render(<TestForm />);

      const input = screen.getByLabelText('Email');
      await user.click(input);
      await user.keyboard('invalid');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Invalid email address');
      });
    });

    it('should not show errors on untouched fields', async () => {
      const TestForm = () => {
        const [email, setEmail] = React.useState('');
        const [touched, setTouched] = React.useState(false);

        return (
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && !email && <div role="alert">Email is required</div>}
          </div>
        );
      };

      render(<TestForm />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should clear error when field becomes valid', async () => {
      const user = userEvent.setup();

      const TestForm = () => {
        const [email, setEmail] = React.useState('invalid');
        const [touched, setTouched] = React.useState(true);

        const hasError = !email.includes('@');

        return (
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={hasError ? 'email-error' : undefined}
            />
            {hasError && (
              <div id="email-error" role="alert">
                Invalid email address
              </div>
            )}
          </div>
        );
      };

      render(<TestForm />);

      expect(screen.getByRole('alert')).toBeInTheDocument();

      const input = screen.getByLabelText('Email');
      await user.clear(input);
      await user.keyboard('valid@example.com');

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Real-time Validation After First Blur', () => {
    it('should validate on blur then on every change', async () => {
      const user = userEvent.setup();

      const TestForm = () => {
        const [value, setValue] = React.useState('');
        const [touched, setTouched] = React.useState(false);
        const errors = !value || value.length < 3 ? ['Minimum 3 characters'] : [];

        return (
          <div>
            <label htmlFor="input">Name</label>
            <input
              id="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-describedby={touched && errors.length ? 'error' : undefined}
            />
            {touched && errors.length > 0 && (
              <div id="error" role="alert">
                {errors[0]}
              </div>
            )}
          </div>
        );
      };

      render(<TestForm />);

      const input = screen.getByLabelText('Name');

      // No error before blur
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      // Error after blur on empty field
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Minimum 3 characters');
      });

      // Error clears as user types
      await user.keyboard('ab');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      await user.keyboard('c');

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Specific Error Messages', () => {
    it('should show specific message for Stellar address validation', async () => {
      const user = userEvent.setup();

      const validator = createMockValidator({
        stellar: { message: 'Address must be a valid Stellar public key (starts with G)' },
      });

      const TestForm = () => {
        const [address, setAddress] = React.useState('');
        const [touched, setTouched] = React.useState(false);
        const errors = touched ? validator(address) : [];

        return (
          <div>
            <label htmlFor="address">Stellar Address</label>
            <input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-describedby={errors.length ? 'address-error' : undefined}
            />
            {errors.length > 0 && (
              <div id="address-error" role="alert">
                {errors[0]}
              </div>
            )}
          </div>
        );
      };

      render(<TestForm />);

      const input = screen.getByLabelText('Stellar Address');
      await user.click(input);
      await user.keyboard('INVALID_ADDRESS');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/starts with G/);
      });
    });

    it('should show field-specific error messages not generic ones', async () => {
      const user = userEvent.setup();

      const TestForm = () => {
        const [amount, setAmount] = React.useState('');
        const [touched, setTouched] = React.useState(false);

        const getError = () => {
          if (!amount) return 'Amount is required';
          if (isNaN(amount)) return 'Amount must be a number';
          if (parseFloat(amount) <= 0) return 'Amount must be greater than 0';
          if (parseFloat(amount) > 1000000) return 'Amount exceeds maximum (1,000,000 XLM)';
          return null;
        };

        const error = touched ? getError() : null;

        return (
          <div>
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-describedby={error ? 'amount-error' : undefined}
            />
            {error && (
              <div id="amount-error" role="alert">
                {error}
              </div>
            )}
          </div>
        );
      };

      render(<TestForm />);

      const input = screen.getByLabelText('Amount');
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Amount is required');
      });

      await user.click(input);
      await user.keyboard('abc');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Amount must be a number');
      });
    });
  });

  describe('ARIA Support', () => {
    it('should associate error messages with input via aria-describedby', async () => {
      const user = userEvent.setup();

      const TestForm = () => {
        const [value, setValue] = React.useState('');
        const [error, setError] = React.useState(null);

        const handleBlur = () => {
          if (!value) setError('This field is required');
        };

        return (
          <div>
            <label htmlFor="input">Field</label>
            <input
              id="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={handleBlur}
              aria-describedby={error ? 'error' : undefined}
            />
            {error && <div id="error">{error}</div>}
          </div>
        );
      };

      render(<TestForm />);

      const input = screen.getByLabelText('Field');
      expect(input).not.toHaveAttribute('aria-describedby');

      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-describedby', 'error');
      });
    });

    it('should mark invalid fields with aria-invalid', async () => {
      const user = userEvent.setup();

      const TestForm = () => {
        const [value, setValue] = React.useState('');
        const [touched, setTouched] = React.useState(false);
        const isInvalid = touched && !value;

        return (
          <div>
            <label htmlFor="input">Required Field</label>
            <input
              id="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={isInvalid}
            />
          </div>
        );
      };

      render(<TestForm />);

      const input = screen.getByLabelText('Required Field');
      expect(input).toHaveAttribute('aria-invalid', 'false');

      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('should announce errors to screen readers', async () => {
      const user = userEvent.setup();

      const TestForm = () => {
        const [value, setValue] = React.useState('');
        const [touched, setTouched] = React.useState(false);

        return (
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && !value && (
              <div role="alert" aria-live="polite">
                Email is required
              </div>
            )}
          </div>
        );
      };

      render(<TestForm />);

      const input = screen.getByLabelText('Email');
      await user.click(input);
      await user.tab();

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Form Submission Validation', () => {
    it('should prevent submission if form has errors', async () => {
      const user = userEvent.setup();
      const handleSubmit = jest.fn();

      const TestForm = () => {
        const [email, setEmail] = React.useState('');

        const onSubmit = (e) => {
          e.preventDefault();
          if (!email.includes('@')) {
            return;
          }
          handleSubmit();
        };

        return (
          <form onSubmit={onSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit">Submit</button>
          </form>
        );
      };

      render(<TestForm />);

      const submitButton = screen.getByRole('button', { name: /Submit/i });
      await user.click(submitButton);

      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('should allow submission when all fields are valid', async () => {
      const user = userEvent.setup();
      const handleSubmit = jest.fn();

      const TestForm = () => {
        const [email, setEmail] = React.useState('valid@example.com');

        const onSubmit = (e) => {
          e.preventDefault();
          handleSubmit();
        };

        return (
          <form onSubmit={onSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit">Submit</button>
          </form>
        );
      };

      render(<TestForm />);

      const submitButton = screen.getByRole('button', { name: /Submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalled();
      });
    });
  });
});

/**
 * Button Component
 *
 * Reusable button with variant and size support.
 * Supports loading states, disabled, and full-width.
 */

import React from 'react';
import { cn } from '../../../lib/utils';
import { Spinner } from './Spinner';

const ButtonVariants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
};

const ButtonSizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-10 w-10',
};

const Button = React.forwardRef(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      isLoading = false,
      isFullWidth = false,
      children,
      disabled,
      _asChild = false,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        className={cn(
          ButtonVariants[variant],
          ButtonSizes[size],
          isFullWidth && 'w-full',
          isLoading && 'cursor-not-allowed opacity-75',
          disabled && 'cursor-not-allowed opacity-75',
          className,
        )}
        ref={ref}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button, ButtonVariants, ButtonSizes };

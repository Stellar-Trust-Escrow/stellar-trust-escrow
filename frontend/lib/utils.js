import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tw-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

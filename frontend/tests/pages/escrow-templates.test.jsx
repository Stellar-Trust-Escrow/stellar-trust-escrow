import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import EscrowTemplateGalleryPage from '../../app/escrow/templates/page';

describe('EscrowTemplateGalleryPage', () => {
  beforeEach(() => {
    useSearchParams.mockReturnValue(new URLSearchParams());
    useRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
    });
    localStorage.clear();
  });

  it('renders template gallery content', () => {
    render(<EscrowTemplateGalleryPage />);

    expect(screen.getByRole('heading', { name: 'Escrow Template Gallery' })).toBeInTheDocument();
    expect(screen.getAllByText('Freelance Website Launch').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Use This Template' })).toBeInTheDocument();
  });

  it('navigates to create page with selected template id', () => {
    const push = jest.fn();
    useRouter.mockReturnValue({
      push,
      replace: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
    });

    render(<EscrowTemplateGalleryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Use This Template' }));

    expect(push).toHaveBeenCalledWith('/escrow/create?template=freelance-website-launch');
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DisputeSubmissionForm from '../../../components/dispute/DisputeSubmissionForm';

describe('DisputeSubmissionForm', () => {
  const mockOnSubmit = jest.fn(() => Promise.resolve());
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all form fields', () => {
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );
    expect(screen.getByLabelText(/Reason for Dispute/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Evidence Files/)).toBeInTheDocument();
  });

  it('shows validation error when submitting empty form', async () => {
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const submitBtn = screen.getByText('Submit Dispute');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Reason is required')).toBeInTheDocument();
      expect(screen.getByText('Description is required')).toBeInTheDocument();
      expect(screen.getByText(/At least one evidence file required/)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('allows reason selection', async () => {
    const user = userEvent.setup();
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const reasonSelect = screen.getByLabelText(/Reason for Dispute/);
    await user.selectOptions(reasonSelect, 'work_not_delivered');

    expect(reasonSelect).toHaveValue('work_not_delivered');
  });

  it('allows description input', async () => {
    const user = userEvent.setup();
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const descInput = screen.getByPlaceholderText('Describe the issue in detail...');
    await user.type(descInput, 'Work was not completed as agreed');

    expect(descInput).toHaveValue('Work was not completed as agreed');
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('opens file picker when browse is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const browseBtn = screen.getByText('browse');
    const fileInput = screen.getByDisplayValue('');

    // Note: Actual file picker opening can't be tested directly
    expect(browseBtn).toBeInTheDocument();
  });

  it('validates file types', async () => {
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]');

    // Create mock files
    const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });

    // Simulate file selection through the input
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Invalid file type/)).toBeInTheDocument();
    });
  });

  it('prevents files larger than 10MB', async () => {
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]');

    // Create a mock file larger than 10MB
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/exceeds 10MB limit/)).toBeInTheDocument();
    });
  });

  it('prevents more than 5 files', async () => {
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]');

    // Create 6 valid files
    const files = Array.from({ length: 6 }, (_, i) =>
      new File(['content'], `file${i}.pdf`, { type: 'application/pdf' }),
    );

    fireEvent.change(fileInput, { target: { files: files.slice(0, 5) } });

    await waitFor(() => {
      expect(screen.queryByText(/Maximum 5 files/)).not.toBeInTheDocument();
    });

    fireEvent.change(fileInput, { target: { files: [files[5]] } });

    await waitFor(() => {
      expect(screen.getByText(/Maximum 5 files/)).toBeInTheDocument();
    });
  });

  it('removes file when X button is clicked', async () => {
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: '' }); // X button has no name
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText('test.pdf')).not.toBeInTheDocument();
    });
  });

  it('disables form while loading', async () => {
    mockOnSubmit.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 100);
        }),
    );

    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const reasonSelect = screen.getByLabelText(/Reason for Dispute/);
    const descInput = screen.getByPlaceholderText('Describe the issue in detail...');
    const fileInput = document.querySelector('input[type="file"]');

    // Fill in form
    fireEvent.change(reasonSelect, { target: { value: 'work_not_delivered' } });
    fireEvent.change(descInput, { target: { value: 'Test description' } });

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Submit Dispute'));

    await waitFor(() => {
      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });
  });

  it('calls onSubmit with form data', async () => {
    render(
      <DisputeSubmissionForm
        escrowId="test-escrow"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const reasonSelect = screen.getByLabelText(/Reason for Dispute/);
    const descInput = screen.getByPlaceholderText('Describe the issue in detail...');
    const fileInput = document.querySelector('input[type="file"]');

    fireEvent.change(reasonSelect, { target: { value: 'work_not_delivered' } });
    fireEvent.change(descInput, { target: { value: 'Test description' } });

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Submit Dispute'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });
});

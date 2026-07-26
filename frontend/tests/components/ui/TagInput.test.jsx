import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagInput from '../../../components/ui/TagInput';

describe('TagInput', () => {
  it('renders with placeholder when no tags', () => {
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} placeholder="Add tags…" />);
    expect(screen.getByPlaceholderText('Add tags…')).toBeInTheDocument();
  });

  it('adds a tag on Enter', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByLabelText('Add tag');
    await user.type(input, 'designer{Enter}');

    expect(onChange).toHaveBeenCalledWith(['designer']);
  });

  it('adds a tag on comma', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByLabelText('Add tag');
    await user.type(input, 'designer,');

    expect(onChange).toHaveBeenCalledWith(['designer']);
  });

  it('clears input after adding a tag', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByLabelText('Add tag');
    await user.type(input, 'designer{Enter}');

    expect(input).toHaveValue('');
  });

  it('renders tags as chips with remove buttons', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput tags={['alpha', 'beta']} onChange={onChange} />);

    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();

    // Click × on "alpha"
    const removeBtn = screen.getByLabelText('Remove alpha');
    await user.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith(['beta']);
  });

  it('removes last tag on Backspace when input is empty', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput tags={['alpha', 'beta']} onChange={onChange} />);

    const input = screen.getByLabelText('Add tag');
    await user.click(input);
    await user.keyboard('{Backspace}');

    expect(onChange).toHaveBeenCalledWith(['alpha']);
  });

  it('does not remove tag on Backspace when input has text', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput tags={['alpha']} onChange={onChange} />);

    const input = screen.getByLabelText('Add tag');
    await user.type(input, 'x{Backspace}');

    // onChange should only be called for the removed 'x' — not for tag removal
    expect(onChange).not.toHaveBeenCalledWith([]);
  });

  it('enforces maxTags limit', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput tags={['one', 'two']} maxTags={2} onChange={onChange} />);

    // Input should be disabled
    expect(screen.queryByLabelText('Add tag')).not.toBeInTheDocument();
    expect(screen.getByText('Max 2 tags')).toBeInTheDocument();
  });

  it('disables input when maxTags is reached dynamically', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(
      <TagInput tags={['one']} maxTags={2} onChange={onChange} />,
    );

    expect(screen.getByLabelText('Add tag')).toBeInTheDocument();

    rerender(<TagInput tags={['one', 'two']} maxTags={2} onChange={onChange} />);
    expect(screen.queryByLabelText('Add tag')).not.toBeInTheDocument();
    expect(screen.getByText('Max 2 tags')).toBeInTheDocument();
  });

  it('does not add duplicate tags (case-insensitive)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput tags={['Alpha']} onChange={onChange} />);

    const input = screen.getByLabelText('Add tag');
    await user.type(input, 'alpha{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('trims whitespace from tag values', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByLabelText('Add tag');
    await user.type(input, '  designer  {Enter}');

    expect(onChange).toHaveBeenCalledWith(['designer']);
  });

  it('does not add empty tags', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByLabelText('Add tag');
    await user.type(input, '{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('handles disabled prop', () => {
    const onChange = jest.fn();
    render(<TagInput tags={['one']} disabled onChange={onChange} />);

    expect(screen.queryByLabelText('Add tag')).not.toBeInTheDocument();
    // Remove buttons should not be present
    expect(screen.queryByLabelText('Remove one')).not.toBeInTheDocument();
  });

  it('has role="list" on the container', () => {
    render(<TagInput tags={['one']} onChange={jest.fn()} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('has role="listitem" on each chip', () => {
    render(<TagInput tags={['one', 'two']} onChange={jest.fn()} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });
});

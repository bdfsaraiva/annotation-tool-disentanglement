import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MessageBubble from './MessageBubble';

const baseMessage = {
  id: 1,
  turn_id: 'T001',
  user_id: 'user_a',
  turn_text: 'Hello world',
  reply_to_turn: null,
};

describe('MessageBubble', () => {
  it('renders message text', () => {
    render(<MessageBubble message={baseMessage} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows the turn id', () => {
    render(<MessageBubble message={baseMessage} />);
    expect(screen.getByText('1')).toBeInTheDocument(); // numeric turn id
  });

  it('truncates long text and shows "See more" button', () => {
    const longMessage = { ...baseMessage, turn_text: 'x'.repeat(350) };
    render(<MessageBubble message={longMessage} />);
    expect(screen.getByText(/see more/i)).toBeInTheDocument();
  });

  it('expands text on "See more" click', () => {
    const longMessage = { ...baseMessage, turn_text: 'x'.repeat(350) };
    render(<MessageBubble message={longMessage} />);
    fireEvent.click(screen.getByText(/see more/i));
    expect(screen.getByText(/see less/i)).toBeInTheDocument();
  });

  it('shows Add Thread button in disentanglement mode', () => {
    render(<MessageBubble message={baseMessage} />);
    expect(screen.getByText(/add thread/i)).toBeInTheDocument();
  });

  it('does not show Add Thread button in relation mode', () => {
    render(<MessageBubble message={baseMessage} relationMode />);
    expect(screen.queryByText(/add thread/i)).not.toBeInTheDocument();
  });
});

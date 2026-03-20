import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import InstructionsPanel from './InstructionsPanel';

const stats = { annotatedMessages: 5, totalMessages: 10, unannotatedMessages: 5, annotationPercentage: 50 };

describe('InstructionsPanel', () => {
  it('renders disentanglement instructions by default', () => {
    render(<InstructionsPanel annotationMode="disentanglement" statistics={stats} />);
    expect(screen.getByText(/chat disentanglement task/i)).toBeInTheDocument();
  });

  it('renders adjacency pairs instructions in adjacency_pairs mode', () => {
    render(<InstructionsPanel annotationMode="adjacency_pairs" statistics={stats} />);
    expect(screen.getByText(/adjacency pairs task/i)).toBeInTheDocument();
  });

  it('shows progress bar in disentanglement mode', () => {
    render(<InstructionsPanel annotationMode="disentanglement" statistics={stats} />);
    expect(screen.getByText(/5 of 10 turns annotated/i)).toBeInTheDocument();
  });
});

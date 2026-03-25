import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ErrorBoundary } from '../ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Test Content</Text>
      </ErrorBoundary>
    );

    expect(getByText('Test Content')).toBeTruthy();
  });

  it('renders error UI when error occurs', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    // Suppress console.error for this test
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByText } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(getByText(/Something went wrong/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('renders custom fallback when provided', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    const customFallback = <Text>Custom Error UI</Text>;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByText } = render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(getByText('Custom Error UI')).toBeTruthy();
    spy.mockRestore();
  });
});

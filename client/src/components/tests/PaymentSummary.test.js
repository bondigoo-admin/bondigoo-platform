import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PaymentStatus from '../payment/PaymentStatus';
import { logger } from '../../utils/logger';

// Mock translations
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: jest.fn() }
  })
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('PaymentStatus Component', () => {
  const defaultProps = {
    status: 'processing',
    amount: 100,
    currency: 'CHF',
    paymentMethod: {
      brand: 'Visa',
      last4: '4242'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders processing state correctly', () => {
    render(<PaymentStatus {...defaultProps} />);
    expect(screen.getByText('payments:statusProcessing')).toBeInTheDocument();
    expect(screen.getByText('payments:processingDescription')).toBeInTheDocument();
  });

  it('shows error message when payment fails', () => {
    const error = 'Card declined';
    render(<PaymentStatus {...defaultProps} status="failed" error={error} />);
    expect(screen.getByText(error)).toBeInTheDocument();
  });

  it('displays payment method information when provided', () => {
    render(<PaymentStatus {...defaultProps} />);
    expect(screen.getByText(/Visa •••• 4242/)).toBeInTheDocument();
  });

  it('shows retry button when payment fails and onRetry provided', () => {
    const onRetry = jest.fn();
    render(<PaymentStatus {...defaultProps} status="failed" onRetry={onRetry} />);
    
    const retryButton = screen.getByText('payments:retryPayment');
    fireEvent.click(retryButton);
    
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('formats amount correctly', () => {
    render(<PaymentStatus {...defaultProps} />);
    expect(screen.getByText(/CHF 100\.00/)).toBeInTheDocument();
  });

  it('logs status updates', () => {
    render(<PaymentStatus {...defaultProps} />);
    expect(logger.info).toHaveBeenCalledWith(
      '[PaymentStatus] Payment status updated:',
      expect.objectContaining({
        status: 'processing',
        hasError: false
      })
    );
  });

  it('hides amount when showAmount is false', () => {
    const { queryByText } = render(
      <PaymentStatus {...defaultProps} showAmount={false} />
    );
    expect(queryByText(/CHF 100\.00/)).not.toBeInTheDocument();
  });
});
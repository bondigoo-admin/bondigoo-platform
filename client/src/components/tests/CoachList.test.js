import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from 'react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import CoachList from '../CoachList';
import { getCoaches } from '../../services/coachAPI';
import { requestConnection, getConnectionStatus } from '../../services/connectionAPI';

jest.mock('../../services/coachAPI');
jest.mock('../../services/connectionAPI');

const queryClient = new QueryClient();

const mockUser = { id: 'user1', role: 'client' };

const renderCoachList = (user = mockUser) => {
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user }}>
        <MemoryRouter>
          <CoachList />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('CoachList', () => {
  beforeEach(() => {
    getCoaches.mockResolvedValue({
      coaches: [
        { id: 'coach1', name: 'John Doe', specialty: 'Life Coach', rating: 4.5, hourlyRate: 50 },
        { id: 'coach2', name: 'Jane Smith', specialty: 'Career Coach', rating: 4.8, hourlyRate: 60 },
      ],
      currentPage: 1,
      totalPages: 1,
      hasMore: false,
    });
    getConnectionStatus.mockResolvedValue('not_connected');
  });

  it('renders coaches', async () => {
    renderCoachList();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  it('handles connection requests', async () => {
    renderCoachList();

    await waitFor(() => {
      expect(screen.getAllByText('Connect')).toHaveLength(2);
    });

    requestConnection.mockResolvedValueOnce({});

    userEvent.click(screen.getAllByText('Connect')[0]);

    await waitFor(() => {
      expect(requestConnection).toHaveBeenCalledWith('coach1');
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  it('loads more coaches', async () => {
    getCoaches.mockResolvedValueOnce({
      coaches: [{ id: 'coach1', name: 'John Doe', specialty: 'Life Coach', rating: 4.5, hourlyRate: 50 }],
      currentPage: 1,
      totalPages: 2,
      hasMore: true,
    }).mockResolvedValueOnce({
      coaches: [{ id: 'coach2', name: 'Jane Smith', specialty: 'Career Coach', rating: 4.8, hourlyRate: 60 }],
      currentPage: 2,
      totalPages: 2,
      hasMore: false,
    });

    renderCoachList();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Load More')).toBeInTheDocument();
    });

    userEvent.click(screen.getByText('Load More'));

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    });
  });
});
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import App from '../../App';
import { searchUsers } from '../../services/userAPI';
import { requestConnection, getConnections } from '../../services/connectionAPI';

jest.mock('../../services/userAPI');
jest.mock('../../services/connectionAPI');

const mockUser = {
  id: 1,
  name: 'Test User',
  role: 'user'
};

const renderWithAuth = (component) => {
  return render(
    <AuthContext.Provider value={{ user: mockUser, isAuthenticated: true }}>
      <MemoryRouter>{component}</MemoryRouter>
    </AuthContext.Provider>
  );
};

describe('Connection Flow', () => {
  it('allows a user to search, send a connection request, and see the pending connection', async () => {
    searchUsers.mockResolvedValue([{ id: 2, name: 'John Doe' }]);
    requestConnection.mockResolvedValue({ success: true });
    getConnections.mockResolvedValue([{ id: 2, name: 'John Doe', status: 'pending' }]);

    renderWithAuth(<App />);

    // Navigate to the connections page
    const connectionsLink = screen.getByText('Connections');
    fireEvent.click(connectionsLink);

    // Perform a search
    const searchInput = screen.getByPlaceholderText('Search users...');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Send a connection request
    const connectButton = screen.getByText('Connect');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(requestConnection).toHaveBeenCalledWith(2);
    });

    // Verify that the pending connection appears in the list
    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });
});
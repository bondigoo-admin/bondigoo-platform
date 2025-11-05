import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserSearch from '../UserSearch';
import { searchUsers } from '../../services/userAPI';
import { requestConnection } from '../../services/connectionAPI';

jest.mock('../../services/userAPI');
jest.mock('../../services/connectionAPI');

describe('UserSearch component', () => {
  it('renders the search input', () => {
    render(<UserSearch />);
    expect(screen.getByPlaceholderText('Search users...')).toBeInTheDocument();
  });

  it('performs a search when the input has 3 or more characters', async () => {
    searchUsers.mockResolvedValue([{ id: 1, name: 'John Doe' }]);
    
    render(<UserSearch />);
    const input = screen.getByPlaceholderText('Search users...');
    
    fireEvent.change(input, { target: { value: 'Joh' } });
    
    await waitFor(() => {
      expect(searchUsers).toHaveBeenCalledWith('Joh');
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('sends a connection request when the connect button is clicked', async () => {
    searchUsers.mockResolvedValue([{ id: 1, name: 'John Doe' }]);
    requestConnection.mockResolvedValue({ success: true });

    render(<UserSearch />);
    const input = screen.getByPlaceholderText('Search users...');
    
    fireEvent.change(input, { target: { value: 'John' } });
    
    await waitFor(() => {
      const connectButton = screen.getByText('Connect');
      fireEvent.click(connectButton);
    });

    await waitFor(() => {
      expect(requestConnection).toHaveBeenCalledWith(1);
    });
  });
});
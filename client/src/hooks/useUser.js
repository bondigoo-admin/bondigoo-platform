import { useMutation, useQueryClient } from 'react-query';
import api from '../services/api';
import { toast } from 'react-hot-toast';

export const useUpdateDashboardPreferences = () => {
    const queryClient = useQueryClient();

    return useMutation(
        (dashboardPreferences) => api.patch('/api/v1/users/me/dashboard-preferences', { dashboardPreferences }),
        {
            onSuccess: () => {
                toast.success('Dashboard layout saved!');
                // This assumes your user data is keyed as 'self' or similar after login.
                // Adjust if your application uses a different key for the logged-in user.
                queryClient.invalidateQueries('self');
            },
            onError: () => {
                toast.error('Failed to save layout.');
            }
        }
    );
};
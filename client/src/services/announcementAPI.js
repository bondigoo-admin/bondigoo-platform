import api from './api';

// For Admin Panel
export const getAnnouncements = async () => {
    const { data } = await api.get('/api/admin/announcements');
    return data;
};

export const createAnnouncement = async (announcementData) => {
    const { data } = await api.post('/api/admin/announcements', announcementData);
    return data;
};

export const updateAnnouncement = async (id, updateData) => {
    const { data } = await api.patch(`/api/admin/announcements/${id}`, updateData);
    return data;
};

export const deleteAnnouncement = async (id) => {
    const { data } = await api.delete(`/api/admin/announcements/${id}`);
    return data;
};

// For Public Display
export const getActiveAnnouncements = async (location) => {
    const { data } = await api.get('/api/announcements/active', {
        params: { location }
    });
    return data;
};

// For Analytics
export const trackAnnouncementView = (id) => {
    return api.post(`/api/announcements/${id}/view`);
};

export const trackAnnouncementClick = (id) => {
    return api.post(`/api/announcements/${id}/click`);
};
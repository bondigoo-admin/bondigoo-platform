import api, { fileApi } from './api';

export const fetchDashboardStats = async () => {
    console.log('[EarningsAPI] Fetching dashboard stats with cache buster.');
    const { data } = await api.get('/api/earnings/dashboard-stats', {
        // THIS IS THE FIX: Add a unique parameter to prevent browser caching.
        params: {
            _c: Date.now() 
        }
    });
    console.log('[EarningsAPI] Received stats from backend:', data);
    return data;
};

export const fetchTransactions = async ({ queryKey }) => {
    const [_key, { page, limit }] = queryKey;
    const { data } = await api.get('/api/earnings/transactions', { params: { page, limit } });
    return data;
};

export const getStatementDownload = async ({ paymentId, language }) => { 
    console.log(`[PDF TRACE] Frontend: earningsAPI.js is requesting PDF for paymentId: ${paymentId} in language: ${language}`);
    
    const response = await fileApi.get(`/api/earnings/transaction-statement/${paymentId}`, {
        responseType: 'blob',
        params: { lang: language } 
    });

    console.log('[PDF TRACE] Frontend: Received response from server. It should be a blob.', {
        status: response.status,
        contentType: response.headers['content-type'],
        contentDisposition: response.headers['content-disposition']
    });

    const contentDisposition = response.headers['content-disposition'];
    let filename = `statement-${paymentId}.pdf`;
    if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch.length === 2) {
            filename = filenameMatch[1];
        }
    }
    
    return { data: response.data, filename };
};

export const getB2bDocumentUrl = async ({ invoiceId }) => {
    const { data } = await api.get(`/api/earnings/documents/b2b/${invoiceId}`);
    return data;
};

export const fetchAdjustments = async () => {
    const { data } = await api.get('/api/earnings/adjustments');
    return data;
};

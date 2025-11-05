import api from './api'; 

/**
 * Fetches all invoices for the currently logged-in user.
 * @returns {Promise<Array>} A promise that resolves to an array of invoice objects.
 */
export const fetchInvoices = async () => {
    const { data } = await api.get('/api/invoices/my-invoices');
    return data;
};

/**
 * Gets a fresh, temporary download URL for a specific invoice PDF.
 * @param {string} invoiceId - The database ID of the invoice.
 * @returns {Promise<string>} A promise that resolves to the PDF download URL.
 */
export const getInvoiceDownloadUrl = async (invoiceId) => {
    const { data } = await api.get(`/api/invoices/download-link/${invoiceId}`);
    return data.url;
};
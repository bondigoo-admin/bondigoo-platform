import React, { useEffect, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { verifyEmailChange } from '../services/userAPI';
import { AuthContext } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const EmailVerificationPage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { logout } = useContext(AuthContext);
    const { t } = useTranslation(['userprofile', 'common']);

    const [status, setStatus] = useState('verifying'); // verifying, success, error
    const [message, setMessage] = useState('');

    useEffect(() => {
        const handleVerification = async () => {
            if (!token) {
                setStatus('error');
                setMessage(t('userprofile:verificationTokenMissing'));
                return;
            }

            try {
                const response = await verifyEmailChange(token);
                setStatus('success');
                setMessage(response.message || t('userprofile:emailVerifiedSuccess'));
                toast.success(response.message || t('userprofile:emailVerifiedSuccess'));
                logout();
                setTimeout(() => navigate('/login'), 3000);
            } catch (error) {
                const errorMessage = error.response?.data?.message || t('userprofile:verificationFailed');
                setStatus('error');
                setMessage(errorMessage);
                toast.error(errorMessage);
                setTimeout(() => navigate('/login'), 5000);
            }
        };

        handleVerification();
    }, [token, t, logout, navigate]);

    return (
        <div className="email-verification-container">
            {status === 'verifying' && (
                <>
                    <LoadingSpinner />
                    <p>{t('userprofile:verifyingEmail')}</p>
                </>
            )}
            {status === 'success' && (
                <div className="email-verification-message success">
                    <h2>{t('common:success')}</h2>
                    <p>{message}</p>
                    <p>{t('userprofile:redirectingToLogin')}</p>
                </div>
            )}
            {status === 'error' && (
                <div className="email-verification-message error">
                    <h2>{t('common:error')}</h2>
                    <p>{message}</p>
                    <p>{t('userprofile:redirectingToLogin')}</p>
                </div>
            )}
        </div>
    );
};

export default EmailVerificationPage;
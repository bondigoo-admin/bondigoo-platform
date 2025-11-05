import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { verifyPasswordResetToken, resetPassword } from '../services/userAPI';

const ResetPasswordPage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation('userprofile');

    const [verificationStatus, setVerificationStatus] = useState('verifying'); // verifying, valid, invalid, success
    const [passwords, setPasswords] = useState({ newPassword: '', confirmPassword: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const verifyToken = async () => {
            if (!token) {
                setVerificationStatus('invalid');
                return;
            }
            try {
                await verifyPasswordResetToken(token);
                setVerificationStatus('valid');
            } catch (error) {
                console.error("Token verification failed:", error);
                setVerificationStatus('invalid');
            }
        };
        verifyToken();
    }, [token]);

    const handleChange = (e) => {
        setPasswords({ ...passwords, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (passwords.newPassword.length < 6) {
            toast.error(t('passwordTooShort'));
            return;
        }
        if (passwords.newPassword !== passwords.confirmPassword) {
            toast.error(t('passwordsDoNotMatch'));
            return;
        }
        
        setIsSubmitting(true);
        try {
            const response = await resetPassword({ token, newPassword: passwords.newPassword });
            toast.success(response.message || t('resetPassword.toast.success'));
            setVerificationStatus('success'); 
            setTimeout(() => navigate('/login'), 3000);
        } catch (error) {
            toast.error(error.response?.data?.message || t('resetPassword.toast.error'));
            setIsSubmitting(false);
        }
    };

    const renderContent = () => {
        switch (verificationStatus) {
            case 'verifying':
                return (
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
                        <p>{t('resetPassword.verifying')}</p>
                    </div>
                );
            case 'invalid':
                return (
                    <div className="text-center">
                        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">{t('resetPassword.invalidTitle')}</h2>
                        <p>{t('resetPassword.invalidMessage')}</p>
                        <Link to="/forgot-password" className="login-button mt-4 inline-block">{t('resetPassword.requestNewLink')}</Link>
                    </div>
                );
            case 'success':
                 return (
                    <div className="text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">{t('resetPassword.successTitle')}</h2>
                        <p>{t('resetPassword.successMessage')}</p>
                    </div>
                );
            case 'valid':
                return (
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <h2 className="text-2xl font-bold">{t('resetPassword.formTitle')}</h2>
                        <div className="form-group">
                            <label htmlFor="newPassword">
                                <Lock size={20} />
                                {t('newPassword')}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="newPassword"
                                    name="newPassword"
                                    value={passwords.newPassword}
                                    onChange={handleChange}
                                    placeholder={t('resetPassword.newPasswordPlaceholder')}
                                    required
                                    minLength="6"
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 bg-transparent border-none cursor-pointer">
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="confirmPassword">
                                <Lock size={20} />
                                {t('confirmNewPassword')}
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                name="confirmPassword"
                                value={passwords.confirmPassword}
                                onChange={handleChange}
                                placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                                required
                            />
                        </div>
                        <button type="submit" className="login-button w-full" disabled={isSubmitting}>
                            {isSubmitting ? t('resetPassword.submittingButton') : t('resetPassword.submitButton')}
                        </button>
                    </form>
                );
            default:
                return null;
        }
    };

    return (
        <div className="login-container">
            <div className="login-form">
                {renderContent()}
            </div>
        </div>
    );
};

export default ResetPasswordPage;
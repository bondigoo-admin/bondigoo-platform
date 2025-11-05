import React, { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset } from '../services/userAPI';
import { Link } from 'react-router-dom';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const { t } = useTranslation('userprofile');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await requestPasswordReset(email);
            setIsSubmitted(true);
        } catch (error) {
            console.error(error); 
            setIsSubmitted(true);
        } finally {
            setIsLoading(false);
        }
    };

    if (isSubmitted) {
        return (
            <div className="login-container">
                <div className="login-form text-center">
                    <Send size={48} className="mx-auto text-green-500 mb-4" />
                    <h2 className="text-2xl font-bold mb-2">{t('forgotPassword.submittedTitle')}</h2>
                    <p>{t('forgotPassword.submittedMessage', { email })}</p>
                    <p className="mt-4">
                        <Link to="/login" className="text-blue-600 hover:underline">{t('forgotPassword.backToLoginLink')}</Link>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="login-container">
            <form className="login-form" onSubmit={handleSubmit}>
                <h2>{t('forgotPassword.title')}</h2>
                <p>{t('forgotPassword.prompt')}</p>
                
                <div className="form-group">
                    <label htmlFor="email">
                        <Mail size={20} />
                        {t('forgotPassword.emailLabel')}
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('forgotPassword.emailPlaceholder')}
                        required
                    />
                </div>

                <button type="submit" className="login-button" disabled={isLoading}>
                    {isLoading ? t('forgotPassword.sendingButton') : t('forgotPassword.sendButton')}
                    {!isLoading && <Send size={20} />}
                </button>
                <div className="additional-options">
                    <Link to="/login">{t('forgotPassword.rememberedLink')}</Link>
                </div>
            </form>
        </div>
    );
};

export default ForgotPasswordPage;
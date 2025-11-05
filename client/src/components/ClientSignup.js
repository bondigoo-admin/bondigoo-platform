import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import zxcvbn from 'zxcvbn';
import { registerUser } from '../services/userAPI';
import { User, Mail, Lock, Loader2, Calendar } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { AuthContext } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Checkbox } from './ui/checkbox.tsx';
import { Label } from './ui/label.tsx';

const PasswordStrengthIndicator = ({ score }) => {
  const { t } = useTranslation('coachsignup'); // Using shared namespace as before
  const strengthLabels = [
    t('passwordStrength.veryWeak'),
    t('passwordStrength.weak'),
    t('passwordStrength.fair'),
    t('passwordStrength.strong'),
    t('passwordStrength.veryStrong')
  ];
  const strengthColors = [
    'bg-red-500',      // Very Weak
    'bg-orange-500',   // Weak
    'bg-yellow-500',   // Fair
    'bg-blue-500',     // strong
    'bg-green-500',    // very strong
  ];

  const barWidth = `${(score + 1) * 20}%`;
  const barColor = strengthColors[score];

  return (
    <div className="mt-2 space-y-1">
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
        <div 
          className={`h-1.5 rounded-full transition-all duration-300 ${barColor}`} 
          style={{ width: barWidth }}
        ></div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{strengthLabels[score]}</p>
    </div>
  );
};

const ClientSignup = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('clientSignup');
  const { login } = useContext(AuthContext);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isDobFocused, setIsDobFocused] = useState(false);

  useEffect(() => {
    if (formData.password) {
      const result = zxcvbn(formData.password);
      setPasswordStrength(result.score);
    } else {
      setPasswordStrength(0);
    }
  }, [formData.password]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({ ...prevState, [name]: value }));
    if (errors[name]) {
      setErrors(prevErrors => ({ ...prevErrors, [name]: null }));
    }
  };

  const handleDateChange = (e) => {
    let value = e.target.value.replace(/[^\d]/g, '');

    if (value.length > 8) value = value.slice(0, 8);

    if (value.length > 4) {
      value = `${value.slice(0, 2)}.${value.slice(2, 4)}.${value.slice(4)}`;
    } else if (value.length > 2) {
      value = `${value.slice(0, 2)}.${value.slice(2)}`;
    }
    
    setFormData(prevState => ({ ...prevState, dateOfBirth: value }));

    if (errors.dateOfBirth) {
        setErrors(prevErrors => ({...prevErrors, dateOfBirth: null}));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.firstName.trim()) newErrors.firstName = t('errors.firstName', 'First name is required');
    if (!formData.lastName.trim()) newErrors.lastName = t('errors.lastName', 'Last name is required');
    if (!formData.email) newErrors.email = t('errors.email.required', 'Email is required');
    else if (!/^\S+@\S+\.\S+$/.test(formData.email)) newErrors.email = t('errors.email.invalid', 'Invalid email address');
    if (!formData.password) newErrors.password = t('errors.password.required', 'Password is required');
    else if (formData.password.length < 8) newErrors.password = t('errors.password.length', 'Password must be at least 8 characters');
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = t('errors.confirmPassword', 'Passwords do not match');
    if (!termsAccepted) newErrors.terms = t('errors.terms', 'You must accept the terms and policies to continue.');
    
    if (!formData.dateOfBirth.trim()) {
        newErrors.dateOfBirth = t('errors.dateOfBirth.required', 'Date of birth is required');
    } else {
        const parts = formData.dateOfBirth.split('.');
        if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
            newErrors.dateOfBirth = t('errors.dateOfBirth.format', 'Please use DD.MM.YYYY format.');
        } else {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            const birthDate = new Date(year, month, day);

            if (isNaN(birthDate.getTime()) || birthDate.getFullYear() !== year || birthDate.getMonth() !== month || birthDate.getDate() !== day) {
                newErrors.dateOfBirth = t('errors.dateOfBirth.invalid', 'Please enter a valid date.');
            } else {
                let age = new Date().getFullYear() - birthDate.getFullYear();
                const m = new Date().getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && new Date().getDate() < birthDate.getDate())) {
                    age--;
                }
                if (age < 18) {
                    newErrors.dateOfBirth = t('errors.dateOfBirth.underage', 'You must be at least 18 years old');
                }
            }
        }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const { confirmPassword, ...submissionData } = formData;
      
      const parts = submissionData.dateOfBirth.split('.');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const formattedDate = new Date(year, month, day).toISOString();

      const response = await registerUser({ 
        ...submissionData, 
        termsAccepted: true,
        marketingOptIn: marketingOptIn,
        dateOfBirth: formattedDate
      });

      logger.info('[ClientSignup] Registration successful', response);
      
      login(response);
      toast.success(t('toasts.success', 'Account created successfully!'), { duration: 2000 });
      
      setTimeout(() => navigate('/onboarding/client'), 1000);

    } catch (error) {
      logger.error('[ClientSignup] Registration failed', error);
      const message = error.response?.data?.msg || t('toasts.error.generic', 'An unexpected error occurred.');
      toast.error(t('toasts.error.api', { message }));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-100 dark:bg-slate-900 text-foreground flex flex-col items-center justify-center p-4 sm:p-6">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="w-full max-w-md md:max-w-lg mx-auto bg-card p-6 md:p-10 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800">
        <h2 className="text-3xl font-bold text-center mb-2 text-card-foreground dark:text-slate-100">
          {t('step1.title', 'Create Your Account')}
        </h2>
        <p className="text-center text-muted-foreground mb-8">
          {t('signupPrompt.subtitle', 'Get started in under 30 seconds.')}
        </p>
        
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
            <div>
              <Input id="firstName" name="firstName" type="text" label={t('firstName.label')} value={formData.firstName} onChange={handleChange} icon={User} autoComplete="given-name" error={errors.firstName} />
              {errors.firstName && <span className="mt-1 ml-1 text-xs text-red-500">{errors.firstName}</span>}
            </div>
            <div>
              <Input id="lastName" name="lastName" type="text" label={t('lastName.label')} value={formData.lastName} onChange={handleChange} icon={User} autoComplete="family-name" error={errors.lastName} />
              {errors.lastName && <span className="mt-1 ml-1 text-xs text-red-500">{errors.lastName}</span>}
            </div>
          </div>
         <div>
            <Input id="email" name="email" type="email" label={t('email.label')} value={formData.email} onChange={handleChange} icon={Mail} autoComplete="email" error={errors.email} />
            {errors.email && <span className="mt-1 ml-1 text-xs text-red-500">{errors.email}</span>}
          </div>
          
          <div>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="text"
              label={t('dateOfBirth.label', 'Date of Birth')}
              value={formData.dateOfBirth}
              onChange={handleDateChange}
              icon={Calendar}
              autoComplete="bday"
              error={errors.dateOfBirth}
              placeholder={isDobFocused ? 'DD.MM.YYYY' : ' '}
              onFocus={() => setIsDobFocused(true)}
              onBlur={() => setIsDobFocused(false)}
            />
            {errors.dateOfBirth && <span className="mt-1 ml-1 text-xs text-red-500">{errors.dateOfBirth}</span>}
          </div>

          <div>
            <Input id="password" name="password" type="password" label={t('password.label')} value={formData.password} onChange={handleChange} icon={Lock} autoComplete="new-password" error={errors.password} />
            {formData.password && <PasswordStrengthIndicator score={passwordStrength} />}
            {errors.password && <span className="mt-1 ml-1 text-xs text-red-500">{errors.password}</span>}
          </div>
          <div>
            <Input id="confirmPassword" name="confirmPassword" type="password" label={t('confirmPassword.label')} value={formData.confirmPassword} onChange={handleChange} icon={Lock} autoComplete="new-password" error={errors.confirmPassword} />
            {errors.confirmPassword && <span className="mt-1 ml-1 text-xs text-red-500">{errors.confirmPassword}</span>}
          </div>

          <div className="pt-2 space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox id="terms" checked={termsAccepted} onCheckedChange={setTermsAccepted} aria-invalid={!!errors.terms} />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="terms" className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  <Trans
                          i18nKey="step2.terms.label"
                          t={t}
                          components={{
                            tos: <Link to="/terms-of-service" className="font-bold underline hover:text-primary" target="_blank" rel="noopener noreferrer" />,
                            privacy: <Link to="/privacy-policy" className="font-bold underline hover:text-primary" target="_blank" rel="noopener noreferrer" />,
                            community: <Link to="/community-guidelines" className="font-bold underline hover:text-primary" target="_blank" rel="noopener noreferrer" />,
                          }}
                        />
                      </Label>
              </div>
            </div>
            {errors.terms && <span className="mt-1 ml-1 text-xs text-red-500">{errors.terms}</span>}
            
            <div className="flex items-start space-x-3">
              <Checkbox id="marketing" checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="marketing" className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  {t('marketing.label', 'I would like to receive promotional emails and newsletters.')}
                </Label>
              </div>
            </div>
          </div>
          
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('buttons.submitting', 'Creating Account...') : t('buttons.createAccount', 'Create Account')}
          </Button>
        </form>

        <div className="text-center mt-8">
          <p className="text-sm text-muted-foreground">
            {t('loginPrompt.text', 'Already have an account?')}
            <Button variant="link" asChild className="font-semibold text-primary pl-1">
              <Link to="/login">{t('loginPrompt.link', 'Log In')}</Link>
            </Button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClientSignup;
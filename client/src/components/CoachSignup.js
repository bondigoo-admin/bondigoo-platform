import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { registerCoach } from '../services/coachService';
import { useAuth } from '../contexts/AuthContext';
import { toast, Toaster } from 'react-hot-toast';
import zxcvbn from 'zxcvbn';

// Lucide Icons
import { User, Mail, Lock, Globe, Loader2, Calendar } from 'lucide-react';

// ShadCN/UI Component Imports
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Checkbox } from './ui/checkbox.tsx';
import { Label } from './ui/label.tsx';

// A small helper component for the password strength meter, styled with Tailwind
const PasswordStrengthIndicator = ({ score }) => {
  const { t } = useTranslation('coachsignup');
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
    'bg-blue-500',      // strong
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

const CoachSignup = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('coachsignup');
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    preferredLanguage: i18n.language.split('-')[0] || 'en',
  });

  const [errors, setErrors] = useState({});
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
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

  const handleLanguageChange = (value) => {
    setFormData(prevState => ({ ...prevState, preferredLanguage: value }));
    i18n.changeLanguage(value);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.firstName.trim()) newErrors.firstName = t('errors.firstName');
    if (!formData.lastName.trim()) newErrors.lastName = t('errors.lastName');
    if (!formData.email) newErrors.email = t('errors.email.required');
    else if (!/^\S+@\S+\.\S+$/.test(formData.email)) newErrors.email = t('errors.email.invalid');
    if (!formData.password) newErrors.password = t('errors.password.required');
    else if (formData.password.length < 8) newErrors.password = t('errors.password.length');
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = t('errors.confirmPassword');
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
    if (validateForm()) {
      setIsSubmitting(true);
      try {
        const { confirmPassword, ...submissionData } = formData;
      
        const parts = submissionData.dateOfBirth.split('.');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const formattedDate = new Date(year, month, day).toISOString();

        const response = await registerCoach({ 
          ...submissionData, 
          termsAccepted: true,
          marketingOptIn: marketingOptIn,
          dateOfBirth: formattedDate
        });
        
        login(response);
        toast.success(t('toasts.success', 'Account created successfully!'), { duration: 2000 });
        setTimeout(() => navigate(`/coach-profile/${response.user.id}/setup`), 1000);
      } catch (error) {
        const message = error.response?.data?.message || t('toasts.error.generic');
        toast.error(message);
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-full bg-slate-100 dark:bg-slate-900 text-foreground flex flex-col items-center justify-center p-4 sm:p-6">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="w-full max-w-xl mx-auto bg-card p-6 md:p-10 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800">
        <h2 className="text-3xl font-bold text-center mb-2 text-card-foreground dark:text-slate-100">
          {t('title', 'Become a Coach')}
        </h2>
        <p className="text-center text-muted-foreground mb-8">
          {t('signupPrompt.subtitle', 'Start your journey with us today.')}
        </p>
        
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-6">
            <div>
              <Input id="firstName" name="firstName" type="text" label={t('firstName.label')} value={formData.firstName} onChange={handleChange} icon={User} autoComplete="given-name" error={errors.firstName}/>
              {errors.firstName && <p className="mt-1 ml-1 text-xs text-red-500">{errors.firstName}</p>}
            </div>
            <div>
              <Input id="lastName" name="lastName" type="text" label={t('lastName.label')} value={formData.lastName} onChange={handleChange} icon={User} autoComplete="family-name" error={errors.lastName} />
              {errors.lastName && <p className="mt-1 ml-1 text-xs text-red-500">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <Input id="email" name="email" type="email" label={t('email.label')} value={formData.email} onChange={handleChange} icon={Mail} autoComplete="email" error={errors.email} />
            {errors.email && <p className="mt-1 ml-1 text-xs text-red-500">{errors.email}</p>}
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
            {errors.dateOfBirth && <p className="mt-1 ml-1 text-xs text-red-500">{errors.dateOfBirth}</p>}
          </div>

          <div>
            <Input id="password" name="password" type="password" label={t('password.label')} value={formData.password} onChange={handleChange} icon={Lock} autoComplete="new-password" error={errors.password} />
            {formData.password && <PasswordStrengthIndicator score={passwordStrength} />}
            {errors.password && <p className="mt-1 ml-1 text-xs text-red-500">{errors.password}</p>}
          </div>

          <div>
            <Input id="confirmPassword" name="confirmPassword" type="password" label={t('confirmPassword.label')} value={formData.confirmPassword} onChange={handleChange} icon={Lock} autoComplete="new-password" error={errors.confirmPassword} />
            {errors.confirmPassword && <p className="mt-1 ml-1 text-xs text-red-500">{errors.confirmPassword}</p>}
          </div>
          
          <div>
              <label htmlFor="preferredLanguage" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 ml-1">{t('language.label')}</label>
              <Select value={formData.preferredLanguage} onValueChange={handleLanguageChange}>
                  <SelectTrigger id="preferredLanguage" className="w-full h-14 rounded-xl text-sm">
                      <div className="flex items-center gap-3">
                          <Globe className="h-5 w-5 text-slate-400" />
                          <SelectValue placeholder={t('language.placeholder')} />
                      </div>
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="en">{t('languages.english')}</SelectItem>
                      <SelectItem value="fr">{t('languages.french')}</SelectItem>
                      <SelectItem value="de">{t('languages.german')}</SelectItem>
                  </SelectContent>
              </Select>
          </div>

           <div className="pt-2 space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox id="terms" checked={termsAccepted} onCheckedChange={setTermsAccepted} aria-invalid={!!errors.terms} />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="terms" className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  <Trans
                    i18nKey="terms.label"
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
            {errors.terms && <p className="mt-1 ml-1 text-xs text-red-500">{errors.terms}</p>}

            <div className="flex items-start space-x-3">
              <Checkbox id="marketing" checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="marketing" className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  {t('marketing.label', 'I would like to receive promotional emails and newsletters.')}
                </Label>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {isSubmitting ? t('buttons.submitting', 'Creating Account...') : t('buttons.register', 'Create Account')}
            </Button>
          </div>
        </form>
        <div className="text-center mt-6">
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

export default CoachSignup;
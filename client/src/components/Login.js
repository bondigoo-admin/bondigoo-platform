import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle, University } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { login as apiLogin } from '../services/api';
import { AuthContext } from '../contexts/AuthContext';
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Alert, AlertDescription } from "./ui/alert.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Label } from "./ui/label.tsx";
import logoWhite from '../assets/logo_white.svg';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [rememberMe, setRememberMe] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const { t } = useTranslation(['common', 'login', 'header', 'pageTitles']);

  useEffect(() => {
  document.title = t('pageTitles:login', 'Login - Bondigoo');
}, [t]);

 useEffect(() => {
    const header = document.querySelector('.main-header');
    if (header) header.style.display = 'none';

    const appContainer = document.querySelector('main')?.parentElement;
    if (appContainer) {
      appContainer.style.backgroundColor = 'transparent';
    }
    document.body.style.backgroundColor = 'transparent';
    
    return () => {
      if (header) header.style.display = '';
      if (appContainer) {
        appContainer.style.backgroundColor = '';
      }
      document.body.style.backgroundColor = '';
    };
  }, []);
 
   const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errorMessage) {
      setErrorMessage('');
      setFieldErrors({});
    }
  };

const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setFieldErrors({});

    try {
      const response = await apiLogin(formData.email, formData.password);
      if (!response.user || !response.token) {
        throw new Error(t('login:invalidResponse'));
      }
      login(response, rememberMe);
      setTimeout(() => {
        navigate('/dashboard');
      }, 500);
    } catch (err) {
      const messageFromServer = (err?.response?.data?.msg || err?.msg || '').toLowerCase();
      if (messageFromServer.includes('user not found')) {
        setErrorMessage(t('login:error_userNotFound'));
        setFieldErrors({ email: true });
      } else if (messageFromServer.includes('invalid password') || messageFromServer.includes('wrong password')) {
        setErrorMessage(t('login:error_invalidPassword'));
        setFieldErrors({ password: true });
      } else if (messageFromServer.includes('invalid credentials')) {
        setErrorMessage(t('login:error_invalidCredentials'));
      } else {
        const message = err?.response?.data?.msg || err?.msg || t('login:loginError');
        setErrorMessage(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,_#6e8efb_0%,_#a777e3_100%)] dark:bg-[linear-gradient(135deg,_#1d2b64_0%,_#48267d_100%)]" />
      
      <Link to="/" className="absolute top-8 left-8 z-20">
        <img src={logoWhite} alt="Bondigoo Logo" className="h-10 w-auto" />
      </Link>
      
    <div className="relative z-10 flex h-full w-full items-center justify-center p-4">
 
  <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
          <div className="hidden md:flex flex-col gap-4 text-left text-primary-foreground dark:text-white">
             <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
               {t('login:welcomeTitle', 'Welcome back to your journey.')}
             </h1>
             <p className="text-lg text-primary-foreground/90 dark:text-white/90">
               {t('login:welcomeSubtitle', 'Sign in to connect with your coaches and continue your progress.')}
             </p>
          </div>
          <Card className="w-full max-w-md mx-auto rounded-2xl bg-card/60 dark:bg-card/80 backdrop-blur-lg border border-border/10 shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
                {t('login:welcomeBack')}
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">{t('login:enterDetails')}</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit} noValidate>
             <CardContent className="space-y-4">
               <div className="space-y-2">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    label={t('login:email')}
                    icon={Mail}
                    value={formData.email}
                    onChange={handleChange}
                    autoComplete="email"
                    required
                    disabled={isLoading}
                    className="bg-transparent dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    label={t('login:password')}
                    icon={Lock}
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    required
                    disabled={isLoading}
                    className="bg-transparent dark:bg-slate-900"
                  />
                </div>
                {errorMessage && (
                  <Alert variant="destructive" className="p-3 flex items-center text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="ml-2">
                      {errorMessage}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex items-center justify-between text-sm pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember-me"
                      checked={rememberMe}
                      onCheckedChange={setRememberMe}
                      disabled={isLoading}
                    />
                    <Label htmlFor="remember-me" className="font-medium text-slate-800 dark:text-slate-300">
                      {t('login:rememberMe', 'Login speichern')}
                    </Label>
                  </div>
                  <Link to="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
                    {t('login:forgotPassword')}
                  </Link>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t('login:verifying', 'Anmeldung wird geprüft...')}
                    </>
                  ) : (
                    <>
                      {t('login:logIn')}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  {t('login:noAccount')}{' '}
                  <Link to="/signup" className="font-bold text-primary underline-offset-4 hover:underline">
                    {t('login:signUp')}
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;
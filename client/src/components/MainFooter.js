import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { University, Twitter, Linkedin, Instagram } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.svg';

const FooterLink = ({ to, children }) => (
  <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-primary dark:hover:text-primary-foreground">
    {children}
  </Link>
);

const MainFooter = () => {
  const { t } = useTranslation(['common', 'header']);
  const { isAuthenticated } = useAuth();

  return (
    <footer className="bg-secondary text-secondary-foreground border-t">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-y-10 gap-x-8">
          
          {/* Column 1: Brand & Socials */}
          <div className="col-span-2 lg:col-span-1">
            <Link to="/" className="block mb-4">
                <img src={logo} alt="Bondigoo Logo" className="h-16 w-auto" />
            </Link>
            <p className="text-muted-foreground text-sm max-w-xs">
              {t('footer.tagline', 'Unlock your potential, on-demand.')}
            </p>
            <div className="flex items-center space-x-4 mt-6">
             {/* <a href="#" aria-label="Twitter" className="text-muted-foreground hover:text-primary dark:hover:text-primary-foreground"><Twitter size={20} /></a>
              <a href="#" aria-label="LinkedIn" className="text-muted-foreground hover:text-primary dark:hover:text-primary-foreground"><Linkedin size={20} /></a>
              <a href="#" aria-label="Instagram" className="text-muted-foreground hover:text-primary dark:hover:text-primary-foreground"><Instagram size={20} /></a>*/}
            </div>
          </div>

          {/* Column 2: Platform Links */}
          <div className="flex flex-col space-y-4">
            <h4 className="font-semibold text-foreground">{t('footer.platform', 'Platform')}</h4>
            <FooterLink to="/coaches">{t('header:findCoaches', 'Find Coaches')}</FooterLink>
            <FooterLink to="/programs">{t('common:programs', 'Programs')}</FooterLink>
            <FooterLink to="/how-it-works">{t('header:howItWorks', 'How It Works')}</FooterLink>
          </div>

          {/* Column 3: For Clients */}
          <div className="flex flex-col space-y-4">
            <h4 className="font-semibold text-foreground">{t('footer.forClients', 'For Clients')}</h4>
            {isAuthenticated ? (
                <FooterLink to="/dashboard">{t('header:dashboard', 'Dashboard')}</FooterLink>
            ) : (
                <FooterLink to="/client-signup">{t('footer.clientSignup', 'Sign Up as Client')}</FooterLink>
            )}
            <FooterLink to="/my-calendar">{t('header:calendar', 'My Calendar')}</FooterLink>
            <FooterLink to="#">{t('footer.helpCenter', 'Help Center')}</FooterLink>
          </div>

          {/* Column 4: For Coaches */}
          <div className="flex flex-col space-y-4">
            <h4 className="font-semibold text-foreground">{t('footer.forCoaches', 'For Coaches')}</h4>
            <FooterLink to="/coach-signup">{t('footer.coachSignup', 'Become a Coach')}</FooterLink>
            <FooterLink to="#">{t('footer.coachResources', 'Coach Resources')}</FooterLink>
          </div>

          {/* Column 5: Legal */}
          <div className="flex flex-col space-y-4">
            <h4 className="font-semibold text-foreground">{t('footer.legal', 'Legal')}</h4>
            <FooterLink to="/terms-of-service">{t('footer.terms', 'Terms of Service')}</FooterLink>
            <FooterLink to="/privacy-policy">{t('footer.privacy', 'Privacy Policy')}</FooterLink>
            <FooterLink to="/community-guidelines">{t('footer.guidelines', 'Community Guidelines')}</FooterLink>
          </div>

        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
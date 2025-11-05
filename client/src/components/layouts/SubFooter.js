import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const SubFooter = () => {
  const { t } = useTranslation('common');

  return (
    <footer className="w-full bg-background border-t border-border py-4 px-4 md:px-6">
      <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center text-sm text-muted-foreground">
        <p>{t('footer.copyright', { year: new Date().getFullYear(), defaultValue: `© ${new Date().getFullYear()} Definitive Plan. All rights reserved.` })}</p>
        <div className="flex gap-4 mt-2 sm:mt-0">
          <Link to="/terms-of-service" className="hover:text-primary transition-colors">{t('footer.terms', 'Terms of Service')}</Link>
          <Link to="/privacy-policy" className="hover:text-primary transition-colors">{t('footer.privacy', 'Privacy Policy')}</Link>
          <Link to="/community-guidelines" className="hover:text-primary transition-colors">{t('footer.community', 'Community Guidelines')}</Link>
        </div>
      </div>
    </footer>
  );
};

export default SubFooter;
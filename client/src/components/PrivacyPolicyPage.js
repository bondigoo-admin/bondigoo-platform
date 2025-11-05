import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink } from 'lucide-react';

const PolicyHeader = ({ title, lastUpdated }) => (
  <div className="text-center mb-12 md:mb-16">
    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-50">{title}</h1>
    <p className="mt-4 text-base text-slate-500 dark:text-slate-400">{lastUpdated}</p>
  </div>
);

const PolicySection = ({ title, intro, children }) => (
  <section className="mb-12 md:mb-16">
    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50 border-b-2 border-primary/10 dark:border-primary/20 pb-4 mb-8">
      {title}
    </h2>
    <div className="prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-6 text-base leading-relaxed">
      {intro && <p className="text-lg text-slate-600 dark:text-slate-400">{intro}</p>}
      {children}
    </div>
  </section>
);

const PolicySubSection = ({ title, paragraph, children }) => (
  <div className="mt-8 first:mt-0">
    <h3 className="text-xl md:text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">{title}</h3>
    {paragraph && <p>{paragraph}</p>}
    {children}
  </div>
);

const ExternalLinkRenderer = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline inline-flex items-center gap-1.5">
    {children}
    <ExternalLink size={14} />
  </a>
);

const Bold = ({ children }) => <strong className="font-semibold">{children}</strong>;

const PrivacyPolicyPage = () => {
  const { t } = useTranslation('privacyPolicy');
  const lastUpdatedDate = new Date().toLocaleDateString('en-CA');

  return (
    <div className="bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto max-w-5xl py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <PolicyHeader title={t('title')} lastUpdated={t('lastUpdated', { date: lastUpdatedDate })} />

        <Card className="mb-12 md:mb-16 shadow-lg bg-slate-100 dark:bg-slate-900 border-primary/10">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">{t('preamble.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-700 dark:text-slate-300"><Trans i18nKey="preamble.p1" t={t} /></p>
            <p className="text-slate-700 dark:text-slate-300">
              <Trans
                i18nKey="preamble.p2" t={t}
                components={{ 1: <Link to="/terms-of-service" className="font-medium text-primary hover:underline" /> }}
              />
            </p>
          </CardContent>
        </Card>

        <PolicySection title={t('chapter1.title')} intro={t('chapter1.intro')}>
          <PolicySubSection title={t('chapter1.direct.title')} paragraph={t('chapter1.direct.p1')}>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter1.direct.list.account" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.direct.list.profile" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.direct.list.financial" t={t} components={{ 0: <Bold />, 1: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.direct.list.communications" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.direct.list.verification" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter1.automatic.title')} paragraph={t('chapter1.automatic.p1')}>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter1.automatic.list.usage" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.automatic.list.log" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.automatic.list.cookies" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.automatic.list.transaction" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter1.activity.title')} paragraph={t('chapter1.activity.p1')}>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter1.activity.list.booking" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.activity.list.session" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.activity.list.live" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.activity.list.progress" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter1.activity.list.recordings" t={t} components={{ 0: <Bold />, 1: <Bold />, 2: <Bold />, 3: <Bold />, 4: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
        </PolicySection>

        <PolicySection title={t('chapter2.title')} intro={t('chapter2.intro')}>
          <PolicySubSection title={t('chapter2.provide.title')} paragraph={t('chapter2.provide.p1')}>
           <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter2.provide.list.accounts" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter2.provide.list.facilitate" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter2.provide.list.payments" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter2.provide.list.access" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter2.provide.list.support" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter2.improve.title')} paragraph={t('chapter2.improve.p1')}>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
                <li><Trans i18nKey="chapter2.improve.list.analytics" t={t} components={{ 0: <Bold /> }} /></li>
                <li><Trans i18nKey="chapter2.improve.list.security" t={t} components={{ 0: <Bold /> }} /></li>
                <li><Trans i18nKey="chapter2.improve.list.integrity" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter2.communicate.title')} paragraph={t('chapter2.communicate.p1')}>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter2.communicate.list.transactional" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter2.communicate.list.administrative" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter2.communicate.list.marketing" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter2.legal.title')} paragraph={t('chapter2.legal.p1')}>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter2.legal.list.invoicing" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter2.legal.list.enforce" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter2.legal.list.requests" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
        </PolicySection>

        <PolicySection title={t('chapter3.title')} intro={t('chapter3.intro')}>
          <PolicySubSection title={t('chapter3.users.title')} paragraph={t('chapter3.users.p1')}>
           <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter3.users.list.profile" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter3.users.list.booking" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter3.users.list.communication" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter3.providers.title')} paragraph={t('chapter3.providers.p1')}>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter3.providers.list.payments" t={t} components={{ 0: <Bold />, 1: <ExternalLinkRenderer href="https://stripe.com" /> }} /></li>
              <li><Trans i18nKey="chapter3.providers.list.hosting" t={t} components={{ 0: <Bold />, 1: <ExternalLinkRenderer href="https://aws.amazon.com" />, 3: <ExternalLinkRenderer href="https://cloud.google.com" /> }} /></li>
              <li><Trans i18nKey="chapter3.providers.list.files" t={t} components={{ 0: <Bold />, 1: <ExternalLinkRenderer href="https://cloudinary.com" /> }} /></li>
              <li><Trans i18nKey="chapter3.providers.list.communication" t={t} components={{ 0: <Bold />, 1: <ExternalLinkRenderer href="https://postmarkapp.com" />, 3: <ExternalLinkRenderer href="https://twilio.com" /> }} /></li>
              <li><Trans i18nKey="chapter3.providers.list.analytics" t={t} components={{ 0: <Bold />, 1: <ExternalLinkRenderer href="https://analytics.google.com" />, 3: <ExternalLinkRenderer href="https://plausible.io" /> }} /></li>
              <li><Trans i18nKey="chapter3.providers.list.queues" t={t} components={{ 0: <Bold />, 1: <ExternalLinkRenderer href="https://redis.io" /> }} /></li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter3.legal.title')} paragraph={t('chapter3.legal.p1')}>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li>{t('chapter3.legal.list.compliance')}</li>
              <li>{t('chapter3.legal.list.enforce')}</li>
              <li>{t('chapter3.legal.list.security')}</li>
              <li>{t('chapter3.legal.list.protect')}</li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter3.transfer.title')} paragraph={t('chapter3.transfer.p1')} />
        </PolicySection>

        <PolicySection title={t('chapter4.title')} intro={t('chapter4.intro')}>
          <PolicySubSection title={t('chapter4.access.title')} paragraph={t('chapter4.access.p1')} />
          <PolicySubSection title={t('chapter4.rectification.title')} paragraph={t('chapter4.rectification.p1')} />
          <PolicySubSection title={t('chapter4.erasure.title')}>
            <p>{t('chapter4.erasure.p1')}</p>
            <div className="!mt-4 p-4 flex items-start gap-4 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 rounded-lg border border-amber-200 dark:border-amber-500/30 text-sm">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
              <span className="flex-grow">
                <Trans i18nKey="chapter4.erasure.p2" t={t} components={{ 0: <Bold /> }} />
              </span>
            </div>
          </PolicySubSection>
          <PolicySubSection title={t('chapter4.portability.title')} paragraph={t('chapter4.portability.p1')} />
          <PolicySubSection title={t('chapter4.objection.title')} paragraph={t('chapter4.objection.p1')} />
          <PolicySubSection title={t('chapter4.restriction.title')} paragraph={t('chapter4.restriction.p1')} />
          <PolicySubSection title={t('chapter4.exercise.title')} paragraph={t('chapter4.exercise.p1')} />
          <PolicySubSection title={t('chapter4.complaint.title')} paragraph={t('chapter4.complaint.p1')} />
        </PolicySection>

        <PolicySection title={t('chapter5.title')} intro={t('chapter5.intro')}>
          <PolicySubSection title={t('chapter5.security.title')}>
            <p>{t('chapter5.security.p1')}</p>
           <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter5.security.list.encryption" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter5.security.list.access" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter5.security.list.audits" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter5.security.list.payments" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter5.transfers.title')}>
            <p>{t('chapter5.transfers.p1')}</p>
            <p className="!mt-2">{t('chapter5.transfers.p2')}</p>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
              <li><Trans i18nKey="chapter5.transfers.list.adequacy" t={t} components={{ 0: <Bold /> }} /></li>
              <li><Trans i18nKey="chapter5.transfers.list.scc" t={t} components={{ 0: <Bold /> }} /></li>
            </ul>
            <p className="!mt-4 font-semibold">{t('chapter5.transfers.p3')}</p>
          </PolicySubSection>
        </PolicySection>

        <PolicySection title={t('chapter6.title')} intro={t('chapter6.intro')}>
          <PolicySubSection title={t('chapter6.account.title')} paragraph={t('chapter6.account.p1')} />
          <PolicySubSection title={t('chapter6.retention.title')}>
            <p>{t('chapter6.retention.p1')}</p>
            <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
                <li><Trans i18nKey="chapter6.retention.list.immediate" t={t} components={{ 0: <Bold /> }} /></li>
                <li className="font-semibold"><Trans i18nKey="chapter6.retention.list.legal" t={t} components={{ 0: <span className="font-bold" />, 1: <strong /> }} /></li>
                <li><Trans i18nKey="chapter6.retention.list.content" t={t} components={{ 0: <Bold /> }} /></li>
              </ul>
          </PolicySubSection>
          <PolicySubSection title={t('chapter6.backups.title')} paragraph={t('chapter6.backups.p1')} />
        </PolicySection>

        <PolicySection title={t('chapter7.title')}>
          <PolicySubSection title={t('chapter7.updates.title')} paragraph={t('chapter7.updates.p1')} />
          <PolicySubSection title={t('chapter7.contact.title')}>
            <p>{t('chapter7.contact.p1')}</p>
            <address className="not-italic mt-4 p-6 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              {t('chapter7.contact.list.company')}<br />
              {t('chapter7.contact.list.department')}<br />
              {t('chapter7.contact.list.address')}<br />
              <Trans i18nKey="chapter7.contact.list.email" t={t} components={{ 1: <a href="mailto:privacy@nomadikthread.com" className="font-medium text-primary hover:underline" /> }} />
            </address>
          </PolicySubSection>
        </PolicySection>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
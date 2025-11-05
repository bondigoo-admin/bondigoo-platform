import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, Users, Shield, DollarSign, MessageSquare } from 'lucide-react';

const TOSHeader = ({ title, lastUpdated }) => (
  <div className="text-center mb-12 md:mb-16">
    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-50">{title}</h1>
    <p className="mt-4 text-base text-slate-500 dark:text-slate-400">{lastUpdated}</p>
  </div>
);

const TOSSection = ({ title, children }) => (
  <section className="mb-12 md:mb-16">
    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50 border-b-2 border-primary/10 dark:border-primary/20 pb-4 mb-8">
      {title}
    </h2>
    <div className="prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-6 text-base leading-relaxed">
      {children}
    </div>
  </section>
);

const TOSSubSection = ({ title, children }) => (
  <div className="mt-8 first:mt-0">
    <h3 className="text-xl md:text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">{title}</h3>
    {children}
  </div>
);

const DefinitionItem = ({ term, definition }) => (
  <div className="border-l-4 border-primary/20 pl-4 py-2">
    <dt className="font-semibold text-lg text-slate-800 dark:text-slate-200">{term}</dt>
    <dd className="mt-1 text-slate-600 dark:text-slate-400">{definition}</dd>
  </div>
);

const GlanceItem = ({ icon, children }) => (
  <li className="flex items-start gap-3">
    <div className="flex-shrink-0 text-primary pt-1">{icon}</div>
    <span>{children}</span>
  </li>
);

const TermsOfServicePage = () => {
  const { t } = useTranslation('termsOfService');
  const lastUpdatedDate = new Date().toLocaleDateString('en-CA'); 

  const definitions = ['platform', 'user', 'coach', 'client', 'services'];

  return (
    <div className="bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto max-w-5xl py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <TOSHeader title={t('title')} lastUpdated={t('lastUpdated', { date: lastUpdatedDate })} />

        <Card className="mb-12 md:mb-16 shadow-lg bg-slate-100 dark:bg-slate-900 border-primary/10">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl flex items-center gap-3">
              <FileText className="text-primary" />
              {t('glance.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4 text-slate-700 dark:text-slate-300">
              <GlanceItem icon={<CheckCircle2 size={20} />}>{t('glance.p1')}</GlanceItem>
              <GlanceItem icon={<Users size={20} />}>{t('glance.p2')}</GlanceItem>
              <GlanceItem icon={<Shield size={20} />}>{t('glance.p3')}</GlanceItem>
              <GlanceItem icon={<DollarSign size={20} />}>{t('glance.p4')}</GlanceItem>
              <GlanceItem icon={<MessageSquare size={20} />}>{t('glance.p5')}</GlanceItem>
            </ul>
          </CardContent>
        </Card>

        <TOSSection title={t('preamble.title')}>
          <p>
            <Trans i18nKey="preamble.p1" t={t} />
          </p>
          <p>
            <Trans
              i18nKey="preamble.p2"
              t={t}
              components={{
                0: <Link to="/privacy-policy" className="font-medium text-primary hover:underline" />,
                1: <Link to="/community-guidelines" className="font-medium text-primary hover:underline" />,
              }}
            />
          </p>
        </TOSSection>
        
        <TOSSection title={t('definitions.title')}>
          <dl className="space-y-6">
            {definitions.map(key => (
              <DefinitionItem key={key} term={t(`definitions.${key}.term`)} definition={t(`definitions.${key}.def`)} />
            ))}
          </dl>
        </TOSSection>

        <TOSSection title={t('chapter1.title')}>
          <TOSSubSection title={t('chapter1.venue.title')}><p>{t('chapter1.venue.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter1.deemedSupplier.title')}><p>{t('chapter1.deemedSupplier.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter1.noGuarantee.title')}><p>{t('chapter1.noGuarantee.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter1.modifications.title')}><p>{t('chapter1.modifications.p1')}</p></TOSSubSection>
        </TOSSection>

        <TOSSection title={t('chapter2.title')}>
          <TOSSubSection title={t('chapter2.eligibility.title')}><p>{t('chapter2.eligibility.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter2.accountInfo.title')}><p>{t('chapter2.accountInfo.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter2.security.title')}><p>{t('chapter2.security.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter2.platformAccess.title')}><p>{t('chapter2.platformAccess.p1')}</p></TOSSubSection>
        </TOSSection>

        <TOSSection title={t('chapter3.title')}>
          <TOSSubSection title={t('chapter3.coachDisclaimer.title')}><p>{t('chapter3.coachDisclaimer.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter3.payment.title')}><p>{t('chapter3.payment.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter3.refunds.title')}><p>{t('chapter3.refunds.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter3.conduct.title')}><p>{t('chapter3.conduct.p1')}</p></TOSSubSection>
        </TOSSection>

        <TOSSection title={t('chapter4.title')}>
          <p className="italic text-slate-500 dark:text-slate-400 mb-8 border-l-4 border-slate-300 dark:border-slate-700 pl-4">{t('chapter4.preamble')}</p>
          <TOSSubSection title={t('chapter4.contractorStatus.title')}><p>{t('chapter4.contractorStatus.p1')}</p></TOSSubSection>
         <TOSSubSection title={t('chapter4.selfBilling.title')}>
  <p className="font-semibold">
    <Trans
      i18nKey="chapter4.selfBilling.p1"
      t={t}
      components={{ 0: <strong /> }}
    />
  </p>
  <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
    <li>
      <Trans
        i18nKey="chapter4.selfBilling.p2"
        t={t}
        components={{ 0: <strong /> }}
      />
    </li>
    <li>{t('chapter4.selfBilling.p3')}</li>
    <li>
      <Trans
        i18nKey="chapter4.selfBilling.p4"
        t={t}
        components={{ 0: <strong /> }}
      />
    </li>
  </ul>
</TOSSubSection>
         <TOSSubSection title={t('chapter4.ipLicense.title')}>
  <p>
    <Trans
      i18nKey="chapter4.ipLicense.p1"
      t={t}
      components={{ 0: <strong /> }}
    />
  </p>
  <p>
    <Trans
      i18nKey="chapter4.ipLicense.p2"
      t={t}
      components={{ 0: <strong /> }}
    />
  </p>
  <p>
    <Trans
      i18nKey="chapter4.ipLicense.p3"
      t={t}
      components={{ 0: <strong />, 1: <strong /> }}
    />
  </p>
</TOSSubSection>
          <TOSSubSection title={t('chapter4.feesAndPayouts.title')}>
            <p>{t('chapter4.feesAndPayouts.p1')}</p>
            <p>{t('chapter4.feesAndPayouts.p2')}</p>
            <p>{t('chapter4.feesAndPayouts.p3')}</p>
          </TOSSubSection>
          <TOSSubSection title={t('chapter4.conduct.title')}><p>{t('chapter4.conduct.p1')}</p></TOSSubSection>
        </TOSSection>

        <TOSSection title={t('chapter5.title')}>
          <p className="italic text-slate-500 dark:text-slate-400 mb-8 border-l-4 border-slate-300 dark:border-slate-700 pl-4">{t('chapter5.preamble')}</p>
          <TOSSubSection title={t('chapter5.userToUser.title')}><p>{t('chapter5.userToUser.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter5.escalation.title')}><p>{t('chapter5.escalation.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter5.finalArbiter.title')}>
  <p className="font-semibold">
    <Trans
      i18nKey="chapter5.finalArbiter.p1"
      t={t}
      components={{ 0: <strong />, 1: <strong /> }}
    />
  </p>
  <p>{t('chapter5.finalArbiter.p2')}</p>
  <p>{t('chapter5.finalArbiter.p3')}</p>
</TOSSubSection>
          <TOSSubSection title={t('chapter5.noLiability.title')}><p>{t('chapter5.noLiability.p1')}</p></TOSSubSection>
        </TOSSection>

        <TOSSection title={t('chapter6.title')}>
          <p className="italic text-slate-500 dark:text-slate-400 mb-8 border-l-4 border-slate-300 dark:border-slate-700 pl-4">{t('chapter6.preamble')}</p>
         <TOSSubSection title={t('chapter6.communityGuidelines.title')}>
  <p>
    <Trans
      i18nKey="chapter6.communityGuidelines.p1"
      t={t}
      components={{
        0: <Link to="/community-guidelines" className="font-medium text-primary hover:underline" />,
      }}
    />
  </p>
</TOSSubSection>
          <TOSSubSection title={t('chapter6.userContent.title')}><p>{t('chapter6.userContent.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter6.moderationRights.title')}>
  <p>
    <Trans
      i18nKey="chapter6.moderationRights.p1"
      t={t}
      components={{ 0: <strong /> }}
    />
  </p>
  <ul className="list-disc list-outside space-y-2 pl-5 mt-4">
    <li>{t('chapter6.moderationRights.list.item1')}</li>
    <li>{t('chapter6.moderationRights.list.item2')}</li>
    <li>{t('chapter6.moderationRights.list.item3')}</li>
  </ul>
  <p className="mt-4">{t('chapter6.moderationRights.p2')}</p>
</TOSSubSection>
          <TOSSubSection title={t('chapter6.reporting.title')}><p>{t('chapter6.reporting.p1')}</p></TOSSubSection>
        </TOSSection>

        <TOSSection title={t('chapter7.title')}>
          <p className="italic text-slate-500 dark:text-slate-400 mb-8 border-l-4 border-slate-300 dark:border-slate-700 pl-4">{t('chapter7.preamble')}</p>
          <TOSSubSection title={t('chapter7.asIs.title')}><p>{t('chapter7.asIs.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter7.noGuarantee.title')}><p>{t('chapter7.noGuarantee.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter7.userConduct.title')}><p>{t('chapter7.userConduct.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter7.limitation.title')}>
            <p>{t('chapter7.limitation.p1')}</p>
            <p className="font-semibold mt-4">{t('chapter7.limitation.p2')}</p>
          </TOSSubSection>
          <TOSSubSection title={t('chapter7.indemnity.title')}><p>{t('chapter7.indemnity.p1')}</p></TOSSubSection>
        </TOSSection>

        <TOSSection title={t('chapter8.title')}>
          <p className="italic text-slate-500 dark:text-slate-400 mb-8 border-l-4 border-slate-300 dark:border-slate-700 pl-4">{t('chapter8.preamble')}</p>
          <TOSSubSection title={t('chapter8.term.title')}><p>{t('chapter8.term.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter8.terminationByUser.title')}><p>{t('chapter8.terminationByUser.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter8.terminationByPlatform.title')}><p>{t('chapter8.terminationByPlatform.p1')}</p></TOSSubSection>
          <TOSSubSection title={t('chapter8.effect.title')}><p>{t('chapter8.effect.p1')}</p></TOSSubSection>
        </TOSSection>

        <TOSSection title={t('chapter9.title')}>
          <TOSSubSection title={t('chapter9.governingLaw.title')}>
            <p>
              <Trans
                i18nKey="chapter9.governingLaw.p1"
                t={t}
                components={{ 0: <strong /> }}
              />
            </p>
          </TOSSubSection>
          <TOSSubSection title={t('chapter9.jurisdiction.title')}>
            <p>
              <Trans
                i18nKey="chapter9.jurisdiction.p1"
                t={t}
                components={{ 0: <strong /> }}
              />
            </p>
          </TOSSubSection>
        </TOSSection>

        <TOSSection title={t('conclusion.title')}>
          <div className="text-center space-y-2 p-8 bg-slate-100 dark:bg-slate-900 rounded-lg">
            <p>{t('conclusion.p1')}</p>
            <p className="font-semibold text-lg text-slate-800 dark:text-slate-200">{t('conclusion.companyName')}</p>
            <p>{t('conclusion.address')}</p>
            <p>{t('conclusion.registration')}</p>
            <p>{t('conclusion.vatNumber')}</p>
          </div>
        </TOSSection>

      </div>
    </div>
  );
};

export default TermsOfServicePage;
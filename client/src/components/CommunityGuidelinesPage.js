
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Heart, UserCheck, Lock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Badge } from './ui/badge.tsx';

const GuidelineSection = ({ title, children }) => (
  <section className="mb-12 md:mb-16">
    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50 border-b-2 border-primary/10 dark:border-primary/20 pb-4 mb-8">
      {title}
    </h2>
    <div className="prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 text-base leading-relaxed">
      {children}
    </div>
  </section>
);

const StrikeBadge = ({ level }) => {
  const styles = {
    1: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    2: 'bg-rose-400 text-white dark:bg-rose-500',
    3: 'bg-red-500 text-white dark:bg-red-600',
  };
  return (
    <div className={`flex-shrink-0 flex flex-col items-center justify-center rounded-full w-14 h-14 p-1 text-center font-semibold leading-tight ${styles[level]}`}>
      <span className="text-[10px] uppercase tracking-wide">Strike</span>
      <span className="text-lg font-bold">{level}</span>
    </div>
  );
};

const PrincipleCard = ({ icon, title, text }) => (
  <div className="flex flex-col items-start text-left p-6 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900">
    <div className="mb-4 text-primary bg-primary/10 p-3 rounded-lg">{icon}</div>
    <div>
      <h4 className="font-semibold text-lg text-slate-800 dark:text-slate-200">{title}</h4>
      <p className="mt-1 text-slate-600 dark:text-slate-400">{text}</p>
    </div>
  </div>
);

const CommunityGuidelinesPage = () => {
  const { t } = useTranslation('communityGuidelines');

const principles = [
    { key: 'authenticity', icon: <Sparkles size={32} /> },
    { key: 'respect', icon: <Heart size={32} /> },
    { key: 'trust', icon: <UserCheck size={32} /> },
    { key: 'safety', icon: <Lock size={32} /> },
  ];

  return (
    <div className="bg-white dark:bg-slate-950">
     <div className="container mx-auto max-w-5xl py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 md:mb-16">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-50">{t('title')}</h1>
          <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 max-w-3xl mx-auto">{t('header')}</p>
        </div>

        <Card className="mb-12 md:mb-16 shadow-lg bg-slate-100 dark:bg-slate-900 border-primary/10">
          <CardContent className="p-6 md:p-8 space-y-4 text-base text-slate-700 dark:text-slate-300">
            <p>{t('introduction.p1')}</p>
            <p>{t('introduction.p2')}</p>
          </CardContent>
        </Card>

        <GuidelineSection title={t('principles.title')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 not-prose">
            {principles.map(p => (
              <PrincipleCard key={p.key} icon={p.icon} title={t(`principles.${p.key}.title`)} text={t(`principles.${p.key}.text`)} />
            ))}
          </div>
        </GuidelineSection>

        <GuidelineSection title={t('rules.title')}>
          <p className="mb-8">{t('rules.intro')}</p>
          <div className="space-y-8">
            <Card className="dark:bg-slate-900">
              <CardHeader><CardTitle>{t('rules.profile.title')}</CardTitle></CardHeader>
              <CardContent>
                <ul className="list-disc list-outside space-y-3 pl-5">
                  <li>{t('rules.profile.impersonation')}</li>
                  <li>{t('rules.profile.content')}</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="dark:bg-slate-900">
              <CardHeader><CardTitle>{t('rules.communication.title')}</CardTitle></CardHeader>
              <CardContent>
                <ul className="list-disc list-outside space-y-3 pl-5">
                  <li>{t('rules.communication.harassment')}</li>
                  <li>{t('rules.communication.hateSpeech')}</li>
                  <li>{t('rules.communication.spam')}</li>
                  <li>{t('rules.communication.inappropriate')}</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </GuidelineSection>

        <GuidelineSection title={t('consequences.title')}>
          <p className="mb-8">{t('consequences.intro')}</p>
          <Card className="dark:bg-slate-900 border-amber-500/20">
              <CardHeader>
                <CardTitle>{t('consequences.threeStrikes.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>{t('consequences.threeStrikes.intro')}</p>
                <ol className="space-y-6 pt-2">
                  <li className="flex items-center gap-4"><StrikeBadge level={1} /><span>{t('consequences.threeStrikes.strike1')}</span></li>
                  <li className="flex items-center gap-4"><StrikeBadge level={2} /><span>{t('consequences.threeStrikes.strike2')}</span></li>
                  <li className="flex items-center gap-4"><StrikeBadge level={3} /><span>{t('consequences.threeStrikes.strike3')}</span></li>
                </ol>
              </CardContent>
            </Card>
          <Card className="mt-8 border-red-500/30 dark:border-red-500/50 bg-red-50 dark:bg-destructive/10">
            <CardHeader>
                <CardTitle className="flex items-center gap-3 text-red-800 dark:text-red-300">
                    <AlertTriangle/>
                    {t('consequences.severeViolations.title')}
                </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-700 dark:text-red-300/90">{t('consequences.severeViolations.text')}</p>
            </CardContent>
          </Card>
        </GuidelineSection>
        
        <GuidelineSection title={t('appeals.title')}>
          <p>{t('appeals.intro')}</p>
        </GuidelineSection>
        
        <p className="text-center text-slate-500 dark:text-slate-400 mt-16">{t('conclusion')}</p>
      </div>
    </div>
  );
};

export default CommunityGuidelinesPage;
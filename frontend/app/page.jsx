/**
 * Home / Landing Page — /
 *
 * Public landing page shown before wallet connection.
 *
 * TODO (contributor — easy, Issue #42):
 * - If wallet is already connected, redirect to /dashboard
 * - Add animated stats counters (total escrows, total value locked)
 * - Add "How it works" section with a 3-step flow diagram
 * - Add testimonials or featured completed escrows
 */

import Button from '../components/ui/Button';
import { useI18n } from '../i18n/index.jsx';

const FEATURES = [
  { icon: '🔒', titleKey: 'home.feature.lock.title', descKey: 'home.feature.lock.desc' },
  { icon: '⭐', titleKey: 'home.feature.rep.title', descKey: 'home.feature.rep.desc' },
  { icon: '⚖️', titleKey: 'home.feature.dispute.title', descKey: 'home.feature.dispute.desc' },
  { icon: '🌐', titleKey: 'home.feature.decentralized.title', descKey: 'home.feature.decentralized.desc' },
];

const HOW_IT_WORKS_KEYS = [
  { step: '01', titleKey: 'home.how.create.title', descKey: 'home.how.create.desc' },
  { step: '02', titleKey: 'home.how.deliver.title', descKey: 'home.how.deliver.desc' },
  { step: '03', titleKey: 'home.how.release.title', descKey: 'home.how.release.desc' },
];

export default function HomePage() {
  const { t } = useI18n();
  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="text-center pt-16 pb-8 space-y-6">
        <div className="inline-flex items-center gap-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-xs px-3 py-1.5 rounded-full mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Built on Stellar · Powered by Soroban
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
          Trustless Escrow for the <span className="text-indigo-400">Decentralized Economy</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
          Lock funds in milestone-based smart contracts. Build your on-chain reputation. Work with
          anyone, anywhere — trustlessly.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button href="/escrow/create" variant="primary" size="lg" className="w-full sm:w-auto">
            {t('escrow.create')}
          </Button>
          <Button href="/explorer" variant="secondary" size="lg" className="w-full sm:w-auto">
            {t('nav.explorer')}
          </Button>
        </div>

        {/* TODO (contributor — Issue #42): add live platform stats here */}
        <div className="flex justify-center flex-wrap gap-8 md:gap-12 pt-8 border-t border-gray-800 text-center">
          {[
            { label: 'Escrows Created', value: '—' },
            { label: 'Total Value Locked', value: '—' },
            { label: 'Completed Projects', value: '—' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <h2 className="text-3xl font-bold text-white text-center">{t('home.howItWorks')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HOW_IT_WORKS_KEYS.map((step) => (
            <div key={step.step} className="card text-center space-y-3">
              <span className="text-4xl font-black text-indigo-500/30">{step.step}</span>
              <h3 className="text-white font-semibold text-lg">{t(step.titleKey)}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{t(step.descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <h2 className="text-3xl font-bold text-white text-center">{t('home.features.title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div key={f.titleKey} className="card flex gap-4">
              <span className="text-3xl flex-shrink-0">{f.icon}</span>
              <div>
                <h3 className="text-white font-semibold mb-1">{t(f.titleKey)}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{t(f.descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="text-center card bg-indigo-600/10 border-indigo-500/20 py-12 space-y-4">
        <h2 className="text-2xl font-bold text-white">{t('home.cta.title')}</h2>
        <p className="text-gray-400">{t('home.cta.desc')}</p>
        <Button href="/escrow/create" variant="primary" size="lg">
          {t('home.cta.button')}
        </Button>
      </section>
    </div>
  );
}

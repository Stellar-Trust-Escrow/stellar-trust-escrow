'use client';

import Button from '../components/ui/Button';
import LazySection from './LazySection';
import { useI18n } from '../i18n/index.jsx';

const FEATURES = [
  { icon: '🔒', title: 'Trustless Milestone Escrow', description: 'Funds are locked and released by contract rules.' },
  { icon: '⭐', title: 'On-chain Reputation', description: 'Build a verifiable record of completed work.' },
  { icon: '⚖️', title: 'Dispute Resolution', description: 'Raise and resolve disputes with transparent process.' },
  { icon: '🌐', title: 'Global and Fast', description: 'Work with anyone, anywhere, on Stellar.' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Create Escrow', desc: 'Define milestones and lock project funds.' },
  { step: '02', title: 'Deliver Work', desc: 'Freelancer submits deliverables per milestone.' },
  { step: '03', title: 'Release Funds', desc: 'Client approves milestones to release payments.' },
];

export default function HomePage() {
  const { t } = useI18n();

  return (
    <div className="space-y-24">
      <section className="text-center pt-16 pb-8 space-y-6">
        <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
          Trustless Escrow for the <span className="text-indigo-400">Decentralized Economy</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
          Lock funds in milestone-based smart contracts and build on-chain reputation.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button href="/escrow/create" variant="primary" size="lg" className="w-full sm:w-auto">
            {t('escrow.create')}
          </Button>
          <Button href="/explorer" variant="secondary" size="lg" className="w-full sm:w-auto">
            {t('nav.explorer')}
          </Button>
        </div>
      </section>

      <LazySection minHeight="220px" aria-label="How It Works">
        <section className="space-y-8">
          <h2 className="text-3xl font-bold text-white text-center">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="card text-center space-y-3">
                <span className="text-4xl font-black text-indigo-500/30">{step.step}</span>
                <h3 className="text-white font-semibold text-lg">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </LazySection>

      <LazySection minHeight="280px" aria-label="Features">
        <section className="space-y-8">
          <h2 className="text-3xl font-bold text-white text-center">Built for Freelancers & Clients</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="card flex gap-4">
                <span className="text-3xl flex-shrink-0">{f.icon}</span>
                <div>
                  <h3 className="text-white font-semibold mb-1">{f.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </LazySection>
    </div>
  );
}

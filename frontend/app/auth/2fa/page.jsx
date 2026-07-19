// frontend/app/auth/2fa/page.jsx
import { TwoFactorChallenge } from '../../../components/auth/TwoFactorChallenge';

export default function TwoFactorPage({ searchParams }) {
  return <TwoFactorChallenge mfaPendingToken={searchParams?.mfaPendingToken} />;
}
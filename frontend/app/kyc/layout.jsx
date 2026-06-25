import RouteGuard from '../../components/auth/RouteGuard';

export default function KycLayout({ children }) {
  return <RouteGuard>{children}</RouteGuard>;
}

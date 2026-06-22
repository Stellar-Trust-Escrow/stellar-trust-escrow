import RouteGuard from '../../components/auth/RouteGuard';

export default function EscrowLayout({ children }) {
  return <RouteGuard>{children}</RouteGuard>;
}

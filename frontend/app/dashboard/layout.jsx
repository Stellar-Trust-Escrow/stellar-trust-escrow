import RouteGuard from '../../components/auth/RouteGuard';

export default function DashboardLayout({ children }) {
  return <RouteGuard>{children}</RouteGuard>;
}

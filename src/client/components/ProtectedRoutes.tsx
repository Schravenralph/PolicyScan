import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { Layout } from './Layout';

export const ProtectedRoutes = () => {
  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  );
};

export const ProtectedLayoutRoutes = () => {
  return (
    <ProtectedRoute>
      <Layout>
        <Outlet />
      </Layout>
    </ProtectedRoute>
  );
};

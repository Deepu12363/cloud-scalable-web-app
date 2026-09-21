import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Loading from './Loading.jsx';

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loading message="Checking your session..." />;
  }

  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}

export default ProtectedRoute;
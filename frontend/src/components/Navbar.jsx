import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="site-header">
      <nav className="navbar container" aria-label="Main navigation">
        <Link className="brand" to="/">CloudApp</Link>
        <div className="nav-links">
          <NavLink to="/">Home</NavLink>
          {user ? <NavLink to="/dashboard">Dashboard</NavLink> : null}
          {user ? (
            <button className="button button-small button-outline" type="button" onClick={handleLogout}>
              Logout
            </button>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>
              <NavLink className="nav-action" to="/register">Register</NavLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
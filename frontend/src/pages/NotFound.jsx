import { Link } from 'react-router-dom';

function NotFound() {
  return <main className="center-page container"><p className="eyebrow">404</p><h1>Page not found</h1><p>The page you requested does not exist.</p><Link className="button button-primary" to="/">Return home</Link></main>;
}

export default NotFound;
function Loading({ message = 'Loading...' }) {
  return <div className="loading-state" role="status">{message}</div>;
}

export default Loading;
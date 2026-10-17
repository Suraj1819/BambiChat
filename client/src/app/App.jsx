import { Routes, Route, Navigate } from 'react-router-dom';
import { ChatPage } from '@/pages/ChatPage';
import { AuthPage } from '@/pages/AuthPage';
import { isAuthenticated } from '@/lib/session';

function RequireAuth({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Transactions from './pages/Transactions';
import Bundles from './pages/Bundles';
import Vouchers from './pages/Vouchers';
import Operators from './pages/Operators';
import Settlements from './pages/Settlements';
import AdminUsers from './pages/AdminUsers';
import OperatorLogin from './pages/OperatorLogin';
import OperatorSignup from './pages/OperatorSignup';
import OperatorDashboard from './pages/OperatorDashboard';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import AuditLogs from './pages/AuditLogs';
import { isLoggedIn, isSuperAdmin } from './utils/auth';
import { isOperatorLoggedIn } from './utils/operatorAuth';

function PrivateRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

function SuperAdminRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (!isSuperAdmin()) return <Navigate to="/" replace />;
  return children;
}

function OperatorRoute({ children }) {
  return isOperatorLoggedIn() ? children : <Navigate to="/operator/login" replace />;
}

export default function App() {
  return (
    <>
    {/* Hidden area used for voucher print sheets */}
    <div id="voucher-print-area" />
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Operator self-service portal — separate auth, no admin Layout */}
      <Route path="/operator/login" element={<OperatorLogin />} />
      <Route path="/operator/signup" element={<OperatorSignup />} />
      <Route path="/operator/dashboard" element={<OperatorRoute><OperatorDashboard /></OperatorRoute>} />
      <Route path="/operator" element={<Navigate to="/operator/dashboard" replace />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/bundles" element={<Bundles />} />
                <Route path="/vouchers" element={<Vouchers />} />
                {/* Superadmin-only routes */}
                <Route path="/operators" element={<SuperAdminRoute><Operators /></SuperAdminRoute>} />
                <Route path="/settlements" element={<SuperAdminRoute><Settlements /></SuperAdminRoute>} />
                <Route path="/users" element={<SuperAdminRoute><AdminUsers /></SuperAdminRoute>} />
                <Route path="/settings"   element={<SuperAdminRoute><Settings /></SuperAdminRoute>} />
                <Route path="/analytics"  element={<SuperAdminRoute><Analytics /></SuperAdminRoute>} />
                <Route path="/audit-logs" element={<SuperAdminRoute><AuditLogs /></SuperAdminRoute>} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
    </>
  );
}

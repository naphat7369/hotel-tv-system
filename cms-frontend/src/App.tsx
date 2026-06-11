import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import ChannelManagement from './pages/ChannelManagement';
import AppManagement from './pages/AppManagement';
import GuestServices from './pages/GuestServices';
import GuestRequests from './pages/GuestRequests';
import ScreenDesigner from './pages/ScreenDesigner';
import DeviceManagement from './pages/DeviceManagement';
import BroadcastManagement from './pages/BroadcastManagement';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="mdm" element={<DeviceManagement />} />
          <Route path="broadcast" element={<BroadcastManagement />} />
          <Route path="channels" element={<ChannelManagement />} />
          <Route path="apps" element={<AppManagement />} />
          <Route path="services" element={<GuestServices />} />
          <Route path="requests" element={<GuestRequests />} />
          <Route path="screens" element={<ScreenDesigner />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

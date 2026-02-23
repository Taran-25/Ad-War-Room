import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import IntelligenceHub from './pages/IntelligenceHub.jsx';
import Analysis from './pages/Analysis.jsx';
import GapRadar from './pages/GapRadar.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<IntelligenceHub />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/gaps" element={<GapRadar />} />
      </Route>
    </Routes>
  );
}

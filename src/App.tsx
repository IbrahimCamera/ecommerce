import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./routes/Login";
import { Signup } from "./routes/Signup";
import { DashboardLayout } from "./routes/DashboardLayout";
import { DashboardHome } from "./routes/DashboardHome";
import { SettingsYalidine } from "./routes/SettingsYalidine";
import { LandingPagesList } from "./routes/LandingPagesList";
import { LandingPageEditor } from "./routes/LandingPageEditor";
import { PublicLandingPage } from "./routes/PublicLandingPage";
import { OrdersList } from "./routes/OrdersList";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardHome />} />
            <Route path="yalidine" element={<SettingsYalidine />} />
            <Route path="landing-pages" element={<LandingPagesList />} />
            <Route path="landing-pages/:id" element={<LandingPageEditor />} />
            <Route path="orders" element={<OrdersList />} />
          </Route>
          <Route path="/:slug" element={<PublicLandingPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

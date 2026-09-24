import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import HomePage from '@/pages/home';
import PlanHub from '@/pages/plan';
import RentVsBuyPage from '@/pages/rent-vs-buy';
import LoanPage from '@/pages/loan';
import GoalsPage from '@/pages/goals';
import CalendarPage from '@/pages/calendar';
import ChatPage from '@/pages/chat';
import LearnPage from '@/pages/learn';
import OnboardingPage from '@/pages/onboarding';
import ImportHub from '@/pages/import-hub';
import BankStatementPage from '@/pages/bank-statement';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/" component={PlanHub} />
        <Route path="/plan/rent-vs-buy" component={RentVsBuyPage} />
        <Route path="/loan" component={LoanPage} />
        <Route path="/home" component={HomePage} />
        <Route path="/goals" component={GoalsPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/learn" component={LearnPage} />
        <Route path="/imports" component={ImportHub} />
        <Route path="/profile/bank-statement" component={BankStatementPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

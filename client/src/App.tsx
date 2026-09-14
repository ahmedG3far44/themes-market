import Home from './routes/home'
import Protected from './components/protected'

import { Link } from 'react-router-dom'
import { UserButton } from '@clerk/react'
import { useAppAuth } from './context/auth-store'
import { AuthProvider } from './context/auth-context'
import { AdminLayout } from './components/admin/admin-layout'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'

import { ToastProvider } from './context/toast-context'
import { CartProvider } from './context/cart-context'
import { Spinner } from './components/ui/spinner'

const InsightsPage = lazy(() => import('./routes/admin/insights'))
const UsersPage = lazy(() => import('./routes/admin/users'))
const TransactionsPage = lazy(() => import('./routes/admin/transactions'))
const ThemesPage = lazy(() => import('./routes/themes'))
const ThemeDetailPage = lazy(() => import('./routes/theme-detail'))
const CartPage = lazy(() => import('./routes/cart'))
const PurchasesPage = lazy(() => import('./routes/purchases'))
const OrderDetailPage = lazy(() => import('./routes/order-detail'))
const CheckoutSuccess = lazy(() => import('./routes/checkout-result').then((module) => ({ default: module.CheckoutSuccess })))
const CheckoutCancel = lazy(() => import('./routes/checkout-result').then((module) => ({ default: module.CheckoutCancel })))
const SignInPage = lazy(() => import('./routes/auth').then((module) => ({ default: module.SignInPage })))
const SignUpPage = lazy(() => import('./routes/auth').then((module) => ({ default: module.SignUpPage })))
const AdminThemesPage = lazy(() => import('./routes/admin/themes'))
const AdminThemeEditorPage = lazy(() => import('./routes/admin/theme-editor'))
const AdminOrdersPage = lazy(() => import('./routes/admin/orders'))
const AdminOrderDetailPage = lazy(() => import('./routes/admin/order-detail'))
const DiscountsPage = lazy(() => import('./routes/admin/discounts'))


function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider><CartProvider>
          <Suspense fallback={<div className="page-loader"><Spinner size="md" /></div>}><Routes>
            <Route index path='/' element={<Home />} />
            <Route path='/dashboard' element={<Protected><UserDashboard /></Protected>} />
            <Route path='/profile' element={<Protected><UserDashboard /></Protected>} />
            <Route path='/subscription' element={<Protected><UserDashboard /></Protected>} />
            <Route path='/themes' element={<ThemesPage />} />
            <Route path='/themes/:slug' element={<ThemeDetailPage />} />
            <Route path='/sign-in/*' element={<SignInPage />} />
            <Route path='/sign-up/*' element={<SignUpPage />} />
            <Route path='/cart' element={<Protected><CartPage /></Protected>} />
            <Route path='/purchases' element={<Protected customerOnly><PurchasesPage /></Protected>} />
            <Route path='/purchase' element={<Protected customerOnly><PurchasesPage /></Protected>} />
            <Route path='/orders/:id' element={<Protected customerOnly><OrderDetailPage /></Protected>} />
            <Route path='/checkout/success' element={<Protected><CheckoutSuccess /></Protected>} />
            <Route path='/checkout/cancel' element={<Protected><CheckoutCancel /></Protected>} />
            <Route path='/admin' element={<Protected adminOnly><AdminLayout /></Protected>}>
              <Route index element={<InsightsPage />} />
              <Route path='users' element={<UsersPage />} />
              <Route path='transactions' element={<TransactionsPage />} />
              <Route path='themes' element={<AdminThemesPage />} />
              <Route path='themes/new' element={<AdminThemeEditorPage />} />
              <Route path='themes/:id/edit' element={<AdminThemeEditorPage />} />
              <Route path='orders' element={<AdminOrdersPage />} />
              <Route path='orders/:id' element={<AdminOrderDetailPage />} />
              <Route path='discounts' element={<DiscountsPage />} />
            </Route>
            <Route path='*' element={<main className="centered-state"><h1>Page not found</h1><Link className="primary-button" to="/">Go home</Link></main>} />
          </Routes></Suspense>
        </CartProvider></ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

function UserDashboard() {
  const { user } = useAppAuth();
  return <div className="user-dashboard"><header><Link className="brand" to="/">PORTFOLIO <span>MARKET</span></Link><UserButton /></header><main><span className="eyebrow">Your account</span><h1>Welcome back, {user?.name}.</h1><p>Your account is active. Browse the theme library{user?.role === "customer" ? " or open your purchased downloads" : " or manage the marketplace"}.</p>{user?.role === "customer" && <Link className="secondary-button" to="/purchases">Open your library</Link>}{user?.role === "admin" && <Link className="primary-button" to="/admin">Open admin dashboard</Link>}</main></div>;
}

export default App

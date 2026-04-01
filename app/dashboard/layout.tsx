import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NavBar from '@/components/ui/NavBar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 'var(--nav-h)' }}>
      {children}
      <NavBar />
    </div>
  )
}

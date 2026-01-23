// Force all auth pages to render dynamically (avoid build-time Supabase errors)
export const dynamic = 'force-dynamic'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

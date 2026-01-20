import { requireAdmin } from '@/lib/auth'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
  // Server-side check - will redirect if not admin
  await requireAdmin()

  return <UsersClient />
}

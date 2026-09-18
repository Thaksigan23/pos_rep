import { requirePageAccess } from "@/lib/auth/workspace"
import type { AppPage } from "@/lib/auth/permissions"
import { ModulePlaceholder } from "@/features/workspace/module-placeholder"

export async function ModulePage({ page }: { page: AppPage }) {
  await requirePageAccess(page)
  return <ModulePlaceholder page={page} />
}

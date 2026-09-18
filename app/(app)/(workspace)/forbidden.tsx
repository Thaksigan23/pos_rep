import { AccessDenied } from "@/components/app/access-denied"

export default function WorkspaceForbidden() {
  return (
    <AccessDenied description="This section is outside your counter role. Use the menu to open a screen you can access." />
  )
}

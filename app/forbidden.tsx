import { AccessDenied } from "@/components/app/access-denied"

export default function ForbiddenPage() {
  return (
    <AccessDenied
      title="Access denied"
      description="Your account cannot open this part of the shop. If this is your first login, you may still need to be assigned to a shop."
      showSignOut
    />
  )
}

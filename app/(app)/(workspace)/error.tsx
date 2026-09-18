"use client"

import { ErrorState } from "@/components/app/error-state"

export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <ErrorState
      description={
        error.digest
          ? `The counter hit a problem (${error.digest}). Try again.`
          : "The counter hit a problem loading this screen."
      }
      retry={retry}
    />
  )
}

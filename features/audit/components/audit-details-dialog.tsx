"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function AuditDetailsDialog({
  action,
  beforeJson,
  afterJson,
}: {
  action: string
  beforeJson: unknown
  afterJson: unknown
}) {
  const [open, setOpen] = useState(false)
  const hasDetails = beforeJson != null || afterJson != null
  if (!hasDetails) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="btn-h h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        Details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit details</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {action}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-auto">
            {beforeJson != null ? (
              <div>
                <p className="section-label mb-1">Before</p>
                <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {JSON.stringify(beforeJson, null, 2)}
                </pre>
              </div>
            ) : null}
            {afterJson != null ? (
              <div>
                <p className="section-label mb-1">After</p>
                <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {JSON.stringify(afterJson, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

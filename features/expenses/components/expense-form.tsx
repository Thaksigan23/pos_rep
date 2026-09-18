"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import {
  createExpenseAction,
  createExpenseCategoryAction,
  updateExpenseAction,
} from "@/features/expenses/actions"
import type { ExpenseCategory } from "@/features/expenses/queries"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
} from "@/lib/expenses/constants"

const schema = z.object({
  categoryId: z.string().uuid("Select a category"),
  amount: z.number().positive("Amount must be greater than zero"),
  expenseDate: z.string().min(1),
  description: z.string().optional(),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "other"]),
})

type FormValues = z.infer<typeof schema>

export function ExpenseForm({
  mode,
  expenseId,
  categories: initialCategories,
  defaults,
}: {
  mode: "create" | "edit"
  expenseId?: string
  categories: ExpenseCategory[]
  defaults?: Partial<FormValues>
}) {
  const [pending, startTransition] = useTransition()
  const [categoryPending, startCategory] = useTransition()
  const [formError, setFormError] = useState<string>()
  const [categories, setCategories] = useState(initialCategories)
  const [newCategoryName, setNewCategoryName] = useState("")

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      categoryId: defaults?.categoryId ?? "",
      amount: defaults?.amount ?? (undefined as unknown as number),
      expenseDate: defaults?.expenseDate ?? "",
      description: defaults?.description ?? "",
      paymentMethod: defaults?.paymentMethod ?? "cash",
    },
  })

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createExpenseAction(values)
          : await updateExpenseAction(expenseId!, values)
      if (result && "error" in result && result.error) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }
      if (result && "success" in result) toast.success(result.success)
    })
  }

  function addCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    startCategory(async () => {
      const result = await createExpenseCategoryAction({ name })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      if (result.id) {
        setCategories((prev) =>
          [...prev, { id: result.id!, name, is_active: true }].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        )
        form.setValue("categoryId", result.id)
        setNewCategoryName("")
        toast.success("Category added")
      }
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.categoryId)}>
          <FieldLabel htmlFor="categoryId">Category</FieldLabel>
          <select
            id="categoryId"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            {...form.register("categoryId")}
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldError errors={[form.formState.errors.categoryId]} />
        </Field>

        <div className="flex flex-wrap items-end gap-2">
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="newCategory">New category</FieldLabel>
            <Input
              id="newCategory"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Utilities"
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={categoryPending || !newCategoryName.trim()}
            onClick={addCategory}
          >
            {categoryPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Add
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.amount)}>
            <FieldLabel htmlFor="amount">Amount</FieldLabel>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              {...form.register("amount", { valueAsNumber: true })}
            />
            <FieldError errors={[form.formState.errors.amount]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.expenseDate)}>
            <FieldLabel htmlFor="expenseDate">Date</FieldLabel>
            <Input id="expenseDate" type="date" {...form.register("expenseDate")} />
            <FieldError errors={[form.formState.errors.expenseDate]} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="paymentMethod">Payment method</FieldLabel>
          <select
            id="paymentMethod"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            {...form.register("paymentMethod")}
          >
            {EXPENSE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {EXPENSE_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea id="description" rows={3} {...form.register("description")} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="h-10">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {mode === "create" ? "Save expense" : "Update expense"}
      </Button>
    </form>
  )
}

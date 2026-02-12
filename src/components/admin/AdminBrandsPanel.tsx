import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Pencil, Trash2, Plus } from "lucide-react"

type BrandRow = {
  id: string
  name: string
  created_at?: string
}

async function fetchBrands(): Promise<BrandRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from("brands").select("id,name,created_at").order("name", { ascending: true })
  if (error) throw error
  return (data ?? []) as BrandRow[]
}

async function createBrand(name: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("brands").insert({ name })
  if (error) throw error
}

async function updateBrand(id: string, name: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("brands").update({ name }).eq("id", id)
  if (error) throw error
}

async function deleteBrand(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("brands").delete().eq("id", id)
  if (error) throw error
}

export default function AdminBrandsPanel() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "brands"],
    queryFn: fetchBrands,
  })

  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return data ?? []
    return (data ?? []).filter((b) => b.name.toLowerCase().includes(s))
  }, [data, search])

  const createMut = useMutation({
    mutationFn: (name: string) => createBrand(name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "brands"] })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateBrand(id, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "brands"] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "brands"] })
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Marcas</CardTitle>
          <p className="text-sm text-muted-foreground">Gestão embutida no Admin (sem rota separada).</p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            className="sm:w-[260px]"
            placeholder="Buscar marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <CreateBrandDialog isSubmitting={createMut.isPending} onCreate={(name) => createMut.mutate(name)} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isError ? (
          <Alert>
            <AlertDescription>Erro ao carregar marcas: {(error as any)?.message ?? "desconhecido"}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-[180px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Carregando marcas...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma marca encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <EditBrandDialog
                          brand={b}
                          isSubmitting={updateMut.isPending}
                          onSave={(name) => updateMut.mutate({ id: b.id, name })}
                        />

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteMut.mutate(b.id)}
                          disabled={deleteMut.isPending}
                        >
                          {deleteMut.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Se existir FK (ex: products.brand_id), deletar pode falhar. Nesse caso, trate depois com soft delete ou bloqueio
          de deleção quando em uso.
        </p>
      </CardContent>
    </Card>
  )
}

function CreateBrandDialog({
  isSubmitting,
  onCreate,
}: {
  isSubmitting: boolean
  onCreate: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")

  const submit = () => {
    const v = name.trim()
    if (!v || isSubmitting) return
    onCreate(v)
    setName("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && setOpen(v)}>
      <DialogTrigger asChild>
        <Button disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Nova marca
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar marca</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Philips" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditBrandDialog({
  brand,
  isSubmitting,
  onSave,
}: {
  brand: BrandRow
  isSubmitting: boolean
  onSave: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(brand.name)

  const submit = () => {
    const v = name.trim()
    if (!v || isSubmitting) return
    onSave(v)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isSubmitting) return
        setOpen(v)
        if (v) setName(brand.name)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar marca</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

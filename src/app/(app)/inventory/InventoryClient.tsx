"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import TablePagination from "@mui/material/TablePagination";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { alpha } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ModeEditOutlineRoundedIcon from "@mui/icons-material/ModeEditOutlineRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { SIGNAL, monoFont } from "@/theme/theme";
import {
  StatTile,
  SearchField,
  Toolbar,
  TableCard,
  EmptyRow,
  ConfirmDialog,
  headCellSx,
  screen,
  darkFieldSx,
} from "@/components/data/DataKit";
import { validateInteger, integerHint } from "@/lib/validation";

// Items can hold zero stock (received then fully shipped), so quantity is ≥ 0.
const QTY_MIN = 0;

const LOW_STOCK = 20;

interface Row {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  warehouseName: string;
}

export function InventoryClient({
  rows,
  warehouseOptions,
  perms,
}: {
  rows: Row[];
  warehouseOptions: { id: string; name: string }[];
  perms: { create: boolean; update: boolean; delete: boolean };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [whFilter, setWhFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const blank = () => ({
    sku: "",
    name: "",
    quantity: "",
    warehouseId: warehouseOptions[0]?.id ?? "",
  });
  const [form, setForm] = useState(blank);

  const hasActions = perms.update || perms.delete;

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((i) => {
      if (whFilter && i.warehouseName !== whFilter) return false;
      if (!q) return true;
      return (
        i.sku.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        i.warehouseName.toLowerCase().includes(q)
      );
    });
  }, [rows, query, whFilter]);

  // Only render the current page of rows. The full dataset can be thousands of
  // items; mounting them all into the MUI table is what made this page feel
  // slow. KPIs and search still run over the complete `rows`/`filtered` set, so
  // nothing is hidden — just the DOM is bounded.
  const paged = useMemo(
    () => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filtered, page, rowsPerPage],
  );

  // Any filter change can shrink the result below the current page — snap back
  // to the first page so the user isn't stranded on an empty one.
  useEffect(() => {
    setPage(0);
  }, [query, whFilter]);

  const totals = useMemo(
    () => ({
      units: rows.reduce((a, i) => a + i.quantity, 0),
      low: rows.filter((i) => i.quantity <= LOW_STOCK).length,
      warehouses: new Set(rows.map((i) => i.warehouseName)).size,
    }),
    [rows],
  );

  function openAdd() {
    setEditId(null);
    setForm(blank());
    setDialogOpen(true);
  }

  function openEdit(i: Row) {
    setEditId(i.id);
    setForm({ sku: i.sku, name: i.name, quantity: String(i.quantity), warehouseId: "" });
    setDialogOpen(true);
  }

  async function submit() {
    // Catch a bad quantity (negative / decimal / blank) up front so the user
    // sees a clear toast instead of the backend's "Invalid request body".
    const qtyError = validateInteger(form.quantity, { min: QTY_MIN, label: "Quantity" });
    if (qtyError) {
      setError(qtyError);
      return;
    }
    setBusy(true);
    setError(null);
    // Items can't be moved between warehouses via update — only sku/name/quantity.
    const body = editId
      ? { sku: form.sku, name: form.name, quantity: form.quantity }
      : form;
    const res = await fetch(
      editId ? `/api/inventory/${editId}` : "/api/inventory",
      {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(
        (await res.json()).error ??
          `Failed to ${editId ? "update" : "create"} item`,
      );
      return;
    }
    setDialogOpen(false);
    setEditId(null);
    setForm(blank());
    router.refresh();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    const res = await fetch(`/api/inventory/${toDelete.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to delete");
      setToDelete(null);
      return;
    }
    setToDelete(null);
    router.refresh();
  }

  // Live inline error — only once they've typed something, so the field doesn't
  // start out red. Emptiness is handled by the disabled submit button.
  const quantityError =
    form.quantity.trim() === ""
      ? null
      : validateInteger(form.quantity, { min: QTY_MIN, label: "Quantity" });

  const valid =
    form.sku.trim() &&
    form.name.trim() &&
    form.quantity &&
    (editId !== null || form.warehouseId);

  const addAction = perms.create && (
    <Button
      variant="contained"
      disableElevation
      startIcon={<AddRoundedIcon />}
      onClick={openAdd}
      disabled={warehouseOptions.length === 0}
    >
      Add item
    </Button>
  );

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <StatTile
          icon={<LayersRoundedIcon />}
          label="SKUs"
          value={rows.length}
          hint="Distinct items"
        />
        <StatTile
          icon={<Inventory2RoundedIcon />}
          label="Units in stock"
          value={totals.units.toLocaleString()}
          hint="Across all sites"
        />
        <StatTile
          icon={<WarningAmberRoundedIcon />}
          label="Low stock"
          value={totals.low}
          accent="#c77700"
          hint={`≤ ${LOW_STOCK} units on hand`}
        />
        <StatTile
          icon={<WarehouseRoundedIcon />}
          label="Warehouses"
          value={totals.warehouses}
          hint="Holding stock"
        />
      </Grid>

      <TableCard>
        <Toolbar count={filtered.length} noun="items" action={addAction}>
          <TextField
            select
            size="small"
            value={whFilter}
            onChange={(e) => setWhFilter(e.target.value)}
            sx={{ minWidth: 180, ...darkFieldSx }}
          >
            <MenuItem value="">All warehouses</MenuItem>
            {warehouseOptions.map((w) => (
              <MenuItem key={w.id} value={w.name}>
                {w.name}
              </MenuItem>
            ))}
          </TextField>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search SKU, name or warehouse…"
          />
        </Toolbar>
        <Box sx={{ overflowX: "auto" }}>
          <Table sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>SKU</TableCell>
                <TableCell sx={headCellSx}>Item</TableCell>
                <TableCell sx={headCellSx}>Warehouse</TableCell>
                <TableCell sx={headCellSx} align="right">
                  Quantity
                </TableCell>
                {hasActions && (
                  <TableCell sx={headCellSx} align="right" width={104} />
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.map((i) => {
                const low = i.quantity <= LOW_STOCK;
                return (
                  <TableRow
                    key={i.id}
                    sx={{
                      "&:hover": { bgcolor: screen.hover },
                      "& td": { color: screen.text, borderColor: screen.line },
                    }}
                  >
                    <TableCell>
                      <Box
                        component="span"
                        sx={{
                          fontFamily: monoFont,
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: screen.dim,
                          px: 1,
                          py: 0.4,
                          borderRadius: 1,
                          bgcolor: "rgba(255,255,255,0.06)",
                        }}
                      >
                        {i.sku}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: screen.text }}>
                      {i.name}
                    </TableCell>
                    <TableCell sx={{ color: screen.dim }}>
                      {i.warehouseName}
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        {low && (
                          <Chip
                            size="small"
                            icon={<WarningAmberRoundedIcon />}
                            label="Low"
                            sx={{
                              height: 22,
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              bgcolor: alpha("#c77700", 0.22),
                              color: "#f2a93f",
                              "& .MuiChip-icon": {
                                fontSize: 14,
                                color: "#f2a93f",
                              },
                            }}
                          />
                        )}
                        <Typography
                          component="span"
                          sx={{
                            fontFamily: monoFont,
                            fontWeight: 600,
                            color: low ? "#f2a93f" : screen.text,
                          }}
                        >
                          {i.quantity.toLocaleString()}
                        </Typography>
                      </Box>
                    </TableCell>
                    {hasActions && (
                      <TableCell align="right">
                        <Box sx={{ display: "inline-flex", gap: 0.5 }}>
                          {perms.update && (
                            <Tooltip title="Edit item">
                              <IconButton
                                size="small"
                                onClick={() => openEdit(i)}
                                sx={{
                                  color: screen.dim,
                                  "&:hover": {
                                    color: SIGNAL,
                                    bgcolor: alpha(SIGNAL, 0.14),
                                  },
                                }}
                              >
                                <ModeEditOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {perms.delete && (
                            <Tooltip title="Delete item">
                              <IconButton
                                size="small"
                                onClick={() => setToDelete(i)}
                                sx={{
                                  color: screen.dim,
                                  "&:hover": {
                                    color: "#ff6b5e",
                                    bgcolor: alpha("#d33a2c", 0.16),
                                  },
                                }}
                              >
                                <DeleteOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <EmptyRow
                    colSpan={hasActions ? 5 : 4}
                    icon={<Inventory2RoundedIcon />}
                    message={
                      query || whFilter
                        ? "No items match your filters."
                        : "No items yet."
                    }
                  />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="Rows"
          sx={{
            color: screen.dim,
            borderTop: "1px solid",
            borderColor: screen.line,
            bgcolor: screen.deep,
            "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
              color: screen.dim,
            },
            "& .MuiTablePagination-select": { color: screen.text },
            "& .MuiTablePagination-selectIcon": { color: screen.dim },
            "& .MuiIconButton-root": { color: screen.dim },
            "& .MuiIconButton-root.Mui-disabled": { color: "rgba(232,237,246,0.25)" },
          }}
        />
      </TableCard>

      {/* Add / edit dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => !busy && setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editId ? "Edit item" : "Add item"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="SKU"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              required
              autoFocus
              fullWidth
            />
            <TextField
              label="Quantity"
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
              fullWidth
              error={!!quantityError}
              helperText={quantityError ?? integerHint(QTY_MIN)}
              slotProps={{ htmlInput: { min: QTY_MIN, step: 1, inputMode: "numeric" } }}
            />
          </Box>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            fullWidth
          />
          {editId === null ? (
            <TextField
              select
              label="Warehouse"
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              required
              fullWidth
            >
              {warehouseOptions.map((w) => (
                <MenuItem key={w.id} value={w.id}>
                  {w.name}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Typography variant="caption" color="text.secondary">
              To move this item to another warehouse, delete it and re-add it
              there — quantities stay tied to their location.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            color="inherit"
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            variant="contained"
            disableElevation
            disabled={busy || !valid}
          >
            {busy ? "Saving…" : editId ? "Save changes" : "Add item"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete item?"
        body={`This permanently removes “${toDelete?.name}” (${toDelete?.sku}) and its movement history. This cannot be undone.`}
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />

      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setError(null)} variant="filled">
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}

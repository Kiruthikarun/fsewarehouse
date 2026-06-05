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
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import TablePagination from "@mui/material/TablePagination";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { alpha } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ModeEditOutlineRoundedIcon from "@mui/icons-material/ModeEditOutlineRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import StraightenRoundedIcon from "@mui/icons-material/StraightenRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
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
} from "@/components/data/DataKit";

interface Row {
  id: string;
  name: string;
  location: string;
  capacity: number;
  itemCount: number;
}

const BLANK = { name: "", location: "", capacity: "" };

export function WarehousesClient({
  rows,
  perms,
}: {
  rows: Row[];
  perms: { create: boolean; update: boolean; delete: boolean };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [form, setForm] = useState(BLANK);

  const hasActions = perms.update || perms.delete;

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.location.toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Render only the current page of rows (see InventoryClient for the rationale)
  // — keeps the DOM bounded while totals/search still span every site.
  const paged = useMemo(
    () => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filtered, page, rowsPerPage],
  );

  useEffect(() => {
    setPage(0);
  }, [query]);

  const totals = useMemo(
    () => ({
      capacity: rows.reduce((a, w) => a + w.capacity, 0),
      skus: rows.reduce((a, w) => a + w.itemCount, 0),
    }),
    [rows],
  );

  function openAdd() {
    setEditId(null);
    setForm(BLANK);
    setDialogOpen(true);
  }

  function openEdit(w: Row) {
    setEditId(w.id);
    setForm({ name: w.name, location: w.location, capacity: String(w.capacity) });
    setDialogOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(
      editId ? `/api/warehouses/${editId}` : "/api/warehouses",
      {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(
        (await res.json()).error ??
          `Failed to ${editId ? "update" : "create"} warehouse`,
      );
      return;
    }
    setDialogOpen(false);
    setEditId(null);
    setForm(BLANK);
    router.refresh();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    const res = await fetch(`/api/warehouses/${toDelete.id}`, {
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

  const valid = form.name.trim() && form.location.trim() && form.capacity;

  const addAction = perms.create && (
    <Button
      variant="contained"
      disableElevation
      startIcon={<AddRoundedIcon />}
      onClick={openAdd}
    >
      Add warehouse
    </Button>
  );

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <StatTile
          icon={<WarehouseRoundedIcon />}
          label="Locations"
          value={rows.length}
          hint="Active sites"
        />
        <StatTile
          icon={<StraightenRoundedIcon />}
          label="Total capacity"
          value={totals.capacity.toLocaleString()}
          hint="Units across network"
        />
        <StatTile
          icon={<Inventory2RoundedIcon />}
          label="SKUs stored"
          value={totals.skus.toLocaleString()}
          hint="Distinct items"
        />
        <StatTile
          icon={<PlaceRoundedIcon />}
          label="Avg / site"
          value={
            rows.length
              ? Math.round(totals.capacity / rows.length).toLocaleString()
              : 0
          }
          hint="Capacity per location"
        />
      </Grid>

      <TableCard>
        <Toolbar count={filtered.length} noun="warehouses" action={addAction}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search name or location…"
          />
        </Toolbar>
        <Box sx={{ overflowX: "auto" }}>
          <Table sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Warehouse</TableCell>
                <TableCell sx={headCellSx}>Location</TableCell>
                <TableCell sx={headCellSx} align="right">
                  Capacity
                </TableCell>
                <TableCell sx={headCellSx} align="right">
                  SKUs
                </TableCell>
                {hasActions && (
                  <TableCell sx={headCellSx} align="right" width={104} />
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.map((w) => (
                <TableRow
                  key={w.id}
                  sx={{
                    "&:hover": { bgcolor: screen.hover },
                    "& td": { color: screen.text, borderColor: screen.line },
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box
                        sx={{
                          display: "grid",
                          placeItems: "center",
                          width: 32,
                          height: 32,
                          borderRadius: 1.5,
                          bgcolor: "rgba(255,255,255,0.05)",
                          color: screen.dim,
                          "& svg": { fontSize: 18 },
                        }}
                      >
                        <WarehouseRoundedIcon />
                      </Box>
                      <Typography sx={{ fontWeight: 600, color: screen.text }}>
                        {w.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: screen.dim }}>
                    {w.location}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: monoFont }}>
                    {w.capacity.toLocaleString()}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: monoFont }}>
                    {w.itemCount.toLocaleString()}
                  </TableCell>
                  {hasActions && (
                    <TableCell align="right">
                      <Box sx={{ display: "inline-flex", gap: 0.5 }}>
                        {perms.update && (
                          <Tooltip title="Edit warehouse">
                            <IconButton
                              size="small"
                              onClick={() => openEdit(w)}
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
                          <Tooltip title="Delete warehouse">
                            <IconButton
                              size="small"
                              onClick={() => setToDelete(w)}
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
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <EmptyRow
                    colSpan={hasActions ? 5 : 4}
                    icon={<WarehouseRoundedIcon />}
                    message={
                      query
                        ? "No warehouses match your search."
                        : "No warehouses yet."
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
        <DialogTitle>{editId ? "Edit warehouse" : "Add warehouse"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
            fullWidth
          />
          <TextField
            label="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="Capacity"
            type="number"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            required
            fullWidth
          />
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
            {busy ? "Saving…" : editId ? "Save changes" : "Add warehouse"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete warehouse?"
        body={`This permanently removes “${toDelete?.name}” and all of its items and movements. This cannot be undone.`}
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

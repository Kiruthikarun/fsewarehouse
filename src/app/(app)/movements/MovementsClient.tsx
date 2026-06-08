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
import TablePagination from "@mui/material/TablePagination";
import Autocomplete from "@mui/material/Autocomplete";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { alpha } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import CallReceivedRoundedIcon from "@mui/icons-material/CallReceivedRounded";
import CallMadeRoundedIcon from "@mui/icons-material/CallMadeRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
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
import { validateInteger, integerHint } from "@/lib/validation";

// A movement must move at least one unit, so quantity is ≥ 1.
const QTY_MIN = 1;

// Match the dashboard chart palette: inbound sky-blue, outbound signal-orange.
const INBOUND = "#38bdf8";
const OUTBOUND = SIGNAL;

interface Row {
  id: string;
  type: "INBOUND" | "OUTBOUND";
  quantity: number;
  sku: string;
  itemName: string;
  warehouseName: string;
  operator: string;
  occurredAt: string;
}

type ItemOption = { id: string; label: string };

export function MovementsClient({
  rows,
  itemOptions,
  perms,
}: {
  rows: Row[];
  itemOptions: ItemOption[];
  perms: { create: boolean; delete: boolean };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "INBOUND" | "OUTBOUND">(
    "ALL",
  );
  const [addOpen, setAddOpen] = useState(false);
  const [item, setItem] = useState<ItemOption | null>(null);
  const [type, setType] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [quantity, setQuantity] = useState("");

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((m) => {
      if (typeFilter !== "ALL" && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        m.sku.toLowerCase().includes(q) ||
        m.itemName.toLowerCase().includes(q) ||
        m.warehouseName.toLowerCase().includes(q) ||
        m.operator.toLowerCase().includes(q)
      );
    });
  }, [rows, query, typeFilter]);

  // Render only the current page of rows (see InventoryClient for the rationale)
  // — keeps the DOM bounded while totals/search still span the full ledger.
  const paged = useMemo(
    () => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filtered, page, rowsPerPage],
  );

  useEffect(() => {
    setPage(0);
  }, [query, typeFilter]);

  const totals = useMemo(() => {
    const inbound = rows.filter((m) => m.type === "INBOUND");
    const outbound = rows.filter((m) => m.type === "OUTBOUND");
    const net =
      inbound.reduce((a, m) => a + m.quantity, 0) -
      outbound.reduce((a, m) => a + m.quantity, 0);
    return { inbound: inbound.length, outbound: outbound.length, net };
  }, [rows]);

  async function create() {
    // Validate quantity before the request so a negative/zero/decimal shows a
    // clear toast instead of the backend's "Invalid request body".
    const qtyError = validateInteger(quantity, { min: QTY_MIN, label: "Quantity" });
    if (qtyError) {
      setError(qtyError);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item?.id, type, quantity }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to record movement");
      return;
    }
    setAddOpen(false);
    setItem(null);
    setType("INBOUND");
    setQuantity("");
    router.refresh();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/movements/${toDelete.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to delete movement");
      setToDelete(null);
      return;
    }
    setToDelete(null);
    router.refresh();
  }

  // Inline error once they've typed — keep the button reachable for invalid
  // numbers so the click surfaces the toast (rather than silently disabling it).
  const quantityError =
    quantity.trim() === ""
      ? null
      : validateInteger(quantity, { min: QTY_MIN, label: "Quantity" });

  const valid = item && quantity.trim() !== "";

  const recordAction = perms.create && (
    <Button
      variant="contained"
      disableElevation
      startIcon={<AddRoundedIcon />}
      onClick={() => setAddOpen(true)}
      disabled={itemOptions.length === 0}
    >
      Record movement
    </Button>
  );

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <StatTile
          icon={<SwapVertRoundedIcon />}
          label="Movements"
          value={rows.length}
          hint="Most recent 100"
        />
        <StatTile
          icon={<CallReceivedRoundedIcon />}
          label="Inbound"
          value={totals.inbound}
          accent={INBOUND}
          hint="Receipts"
        />
        <StatTile
          icon={<CallMadeRoundedIcon />}
          label="Outbound"
          value={totals.outbound}
          accent={OUTBOUND}
          hint="Shipments"
        />
        <StatTile
          icon={<SwapVertRoundedIcon />}
          label="Net units"
          value={`${totals.net >= 0 ? "+" : ""}${totals.net.toLocaleString()}`}
          accent={totals.net >= 0 ? "#1f9d55" : "#d33a2c"}
          hint="Inbound − outbound"
        />
      </Grid>

      <TableCard>
        <Toolbar count={filtered.length} noun="movements" action={recordAction}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={typeFilter}
            onChange={(_, v) => v && setTypeFilter(v)}
            sx={{
              "& .MuiToggleButton-root": {
                px: 1.75,
                py: 0.5,
                textTransform: "none",
                fontWeight: 600,
                color: screen.dim,
                borderColor: screen.line,
              },
              "& .Mui-selected": {
                bgcolor: `${alpha(SIGNAL, 0.18)} !important`,
                color: `${screen.text} !important`,
              },
            }}
          >
            <ToggleButton value="ALL">All</ToggleButton>
            <ToggleButton value="INBOUND">Inbound</ToggleButton>
            <ToggleButton value="OUTBOUND">Outbound</ToggleButton>
          </ToggleButtonGroup>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search SKU, item, site or operator…"
          />
        </Toolbar>
        <Box sx={{ overflowX: "auto" }}>
          <Table sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>When</TableCell>
                <TableCell sx={headCellSx}>Type</TableCell>
                <TableCell sx={headCellSx}>SKU</TableCell>
                <TableCell sx={headCellSx}>Item</TableCell>
                <TableCell sx={headCellSx}>Warehouse</TableCell>
                <TableCell sx={headCellSx} align="right">
                  Qty
                </TableCell>
                <TableCell sx={headCellSx}>Operator</TableCell>
                {perms.delete && (
                  <TableCell sx={headCellSx} align="right" width={64} />
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.map((m) => {
                const inbound = m.type === "INBOUND";
                const color = inbound ? INBOUND : OUTBOUND;
                return (
                  <TableRow
                    key={m.id}
                    sx={{
                      "&:hover": { bgcolor: screen.hover },
                      "& td": { color: screen.text, borderColor: screen.line },
                    }}
                  >
                    <TableCell
                      sx={{
                        fontFamily: monoFont,
                        fontSize: "0.78rem",
                        color: screen.dim,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(m.occurredAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={
                          inbound ? (
                            <CallReceivedRoundedIcon />
                          ) : (
                            <CallMadeRoundedIcon />
                          )
                        }
                        label={inbound ? "Inbound" : "Outbound"}
                        sx={{
                          height: 24,
                          fontWeight: 600,
                          fontSize: "0.7rem",
                          bgcolor: alpha(color, 0.12),
                          color,
                          "& .MuiChip-icon": { fontSize: 14, color },
                        }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: monoFont,
                        fontSize: "0.78rem",
                        color: screen.dim,
                      }}
                    >
                      {m.sku}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: screen.text }}>
                      {m.itemName}
                    </TableCell>
                    <TableCell sx={{ color: screen.dim }}>
                      {m.warehouseName}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontFamily: monoFont, fontWeight: 600, color }}
                    >
                      {inbound ? "+" : "−"}
                      {m.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ color: screen.dim }}>
                      {m.operator}
                    </TableCell>
                    {perms.delete && (
                      <TableCell align="right">
                        <Tooltip title="Delete movement (reverses its stock effect)">
                          <IconButton
                            size="small"
                            onClick={() => setToDelete(m)}
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
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <EmptyRow
                    colSpan={perms.delete ? 8 : 7}
                    icon={<SwapVertRoundedIcon />}
                    message={
                      query || typeFilter !== "ALL"
                        ? "No movements match your filters."
                        : "No movements recorded yet."
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

      {/* Record dialog */}
      <Dialog
        open={addOpen}
        onClose={() => !busy && setAddOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Record movement</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2.5, pt: "8px !important" }}>
          <Autocomplete
            options={itemOptions}
            value={item}
            onChange={(_, v) => setItem(v)}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField {...params} label="Item" autoFocus required />
            )}
          />
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", display: "block", mb: 0.75 }}
            >
              Direction
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={type}
              onChange={(_, v) => v && setType(v)}
              sx={{
                "& .MuiToggleButton-root": {
                  py: 1,
                  textTransform: "none",
                  fontWeight: 600,
                  gap: 0.75,
                },
                "& .Mui-selected": {
                  bgcolor: `${alpha(type === "INBOUND" ? INBOUND : OUTBOUND, 0.14)} !important`,
                  color: `${type === "INBOUND" ? INBOUND : OUTBOUND} !important`,
                },
              }}
            >
              <ToggleButton value="INBOUND">
                <CallReceivedRoundedIcon fontSize="small" />
                Inbound
              </ToggleButton>
              <ToggleButton value="OUTBOUND">
                <CallMadeRoundedIcon fontSize="small" />
                Outbound
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <TextField
            label="Quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            fullWidth
            error={!!quantityError}
            helperText={quantityError ?? integerHint(QTY_MIN)}
            slotProps={{ htmlInput: { min: QTY_MIN, step: 1, inputMode: "numeric" } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setAddOpen(false)}
            color="inherit"
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={create}
            variant="contained"
            disableElevation
            disabled={busy || !valid}
          >
            {busy ? "Recording…" : "Record movement"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete movement?"
        body={
          toDelete
            ? `This removes the ${toDelete.type === "INBOUND" ? "inbound" : "outbound"} movement of ${toDelete.quantity} × ${toDelete.sku} and reverses its effect on stock (${
                toDelete.type === "INBOUND"
                  ? `−${toDelete.quantity}`
                  : `+${toDelete.quantity}`
              } units). This cannot be undone.`
            : ""
        }
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

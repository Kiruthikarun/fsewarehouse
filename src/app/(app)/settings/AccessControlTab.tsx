"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import LinearProgress from "@mui/material/LinearProgress";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { alpha } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { INK, PANEL, SIGNAL, monoFont } from "@/theme/theme";
import { FallbackSectionIcon, SECTION_ICON, channelOf, rgba, textOn } from "./console";
import type { Matrix, PermGroup, PermKey, RoleKey, RoleOption } from "./types";

// Dark control-room tokens — shared language with the data pages / chart panels.
const TXT = "#e8edf6";
const DIM = "rgba(232,237,246,0.62)";
const LINE = "rgba(232,237,246,0.10)";
const DEEP = "#0b0f1a";

function toDraft(roles: RoleOption[], matrix: Matrix): Record<RoleKey, Set<PermKey>> {
  const draft: Record<RoleKey, Set<PermKey>> = {};
  for (const r of roles) draft[r.key] = new Set(matrix[r.key] ?? []);
  return draft;
}

function signature(roles: RoleOption[], draft: Record<RoleKey, Set<PermKey>>): string {
  return roles
    .map((r) => `${r.key}:${[...(draft[r.key] ?? [])].sort().join(",")}`)
    .join("|");
}

export function AccessControlTab({
  groups,
  roles,
  matrix,
  currentUserRole,
}: {
  groups: PermGroup[];
  roles: RoleOption[];
  matrix: Matrix;
  currentUserRole: RoleKey;
}) {
  const router = useRouter();
  const [baseline, setBaseline] = useState<Matrix>(matrix);
  const [draft, setDraft] = useState<Record<RoleKey, Set<PermKey>>>(() => toDraft(roles, matrix));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totalPerms = useMemo(
    () => groups.reduce((n, g) => n + g.permissions.length, 0),
    [groups],
  );

  const groupOf = useMemo(() => {
    const m = new Map<PermKey, PermGroup>();
    for (const g of groups) for (const p of g.permissions) m.set(p.key, g);
    return m;
  }, [groups]);

  const baselineDraft = useMemo(() => toDraft(roles, baseline), [roles, baseline]);
  const dirty = signature(roles, draft) !== signature(roles, baselineDraft);

  // Count of individual cells that differ from the saved policy.
  const changeCount = useMemo(() => {
    let n = 0;
    for (const r of roles) {
      const a = draft[r.key] ?? new Set<PermKey>();
      const b = baselineDraft[r.key] ?? new Set<PermKey>();
      for (const p of a) if (!b.has(p)) n++;
      for (const p of b) if (!a.has(p)) n++;
    }
    return n;
  }, [roles, draft, baselineDraft]);

  function isLocked(role: RoleKey, perm: PermKey) {
    return perm === "org:manage" && role === currentUserRole;
  }

  function toggle(role: RoleKey, perm: PermKey) {
    if (isLocked(role, perm)) return;
    setDraft((prev) => {
      const nextSet = new Set(prev[role] ?? []);
      const group = groupOf.get(perm);
      if (nextSet.has(perm)) {
        nextSet.delete(perm);
        if (group?.readPermission && perm === group.readPermission) {
          for (const p of group.permissions) nextSet.delete(p.key);
        }
      } else {
        nextSet.add(perm);
        if (group?.readPermission) nextSet.add(group.readPermission);
      }
      return { ...prev, [role]: nextSet };
    });
  }

  function discard() {
    setDraft(toDraft(roles, baseline));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload: Matrix = {};
    for (const r of roles) payload[r.key] = [...(draft[r.key] ?? [])];

    const res = await fetch("/api/settings/permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matrix: payload }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to save permissions");
      return;
    }
    const { matrix: saved } = (await res.json()) as { matrix: Matrix };
    setBaseline(saved);
    setDraft(toDraft(roles, saved));
    setNotice("Changes saved. They take effect immediately.");
    router.refresh();
  }

  const laneWidth = 132;

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 2, maxWidth: 640, color: DIM }}>
        Tick the nodes each role holds. Granting an action automatically grants
        access to its page. Saved changes are enforced at the API and data layer
        immediately — not just in the UI.
      </Typography>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ borderRadius: 3, overflowX: "auto", bgcolor: PANEL, borderColor: LINE }}
      >
        <Table sx={{ minWidth: 560, borderCollapse: "separate" }}>
          {/* ── Channel header ───────────────────────────────────────────── */}
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  borderBottom: `1px solid ${LINE}`,
                  bgcolor: DEEP,
                  fontFamily: monoFont,
                  fontSize: "0.62rem",
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: DIM,
                }}
              >
                Access node
              </TableCell>
              {roles.map((r) => {
                const ch = channelOf(r.key);
                const granted = (draft[r.key] ?? new Set()).size;
                return (
                  <TableCell
                    key={r.key}
                    align="center"
                    sx={{
                      width: laneWidth,
                      borderBottom: `1px solid ${LINE}`,
                      borderTop: `2px solid ${ch.accent}`,
                      bgcolor: rgba(ch.accent, 0.08),
                      px: 1,
                      py: 1.25,
                    }}
                  >
                    <Stack spacing={0.5} sx={{ alignItems: "center" }}>
                      <Box
                        sx={{
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          bgcolor: ch.accent,
                          color: textOn(ch.accent),
                          fontFamily: monoFont,
                          fontSize: "0.62rem",
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {ch.code}
                      </Box>
                      <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: TXT, lineHeight: 1.1 }}>
                        {r.label}
                      </Typography>
                      <Box sx={{ width: "100%", maxWidth: 96 }}>
                        <LinearProgress
                          variant="determinate"
                          value={(granted / (totalPerms || 1)) * 100}
                          sx={{
                            height: 4,
                            borderRadius: 2,
                            bgcolor: "rgba(255,255,255,0.1)",
                            "& .MuiLinearProgress-bar": { bgcolor: ch.accent },
                          }}
                        />
                        <Typography
                          sx={{
                            mt: 0.25,
                            fontFamily: monoFont,
                            fontSize: "0.62rem",
                            color: DIM,
                          }}
                        >
                          {granted}/{totalPerms}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>

          {/* ── Sections + permission nodes ─────────────────────────────── */}
          <TableBody>
            {groups.map((group) => {
              const SectionIcon = SECTION_ICON[group.page] ?? FallbackSectionIcon;
              return (
                <Fragment key={group.page}>
                  <TableRow>
                    <TableCell
                      colSpan={roles.length + 1}
                      sx={{ bgcolor: "rgba(255,255,255,0.03)", borderColor: LINE, py: 1 }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <SectionIcon sx={{ fontSize: 16, color: DIM }} />
                        <Typography
                          sx={{
                            fontFamily: monoFont,
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: TXT,
                          }}
                        >
                          {group.label}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>

                  {group.permissions.map((perm) => (
                    <TableRow
                      key={perm.key}
                      sx={{ "& td": { borderColor: LINE }, "&:hover td": { bgcolor: "rgba(255,255,255,0.03)" } }}
                    >
                      <TableCell sx={{ pl: 3 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <Typography sx={{ color: TXT, fontWeight: 500 }}>{perm.label}</Typography>
                          <Typography sx={{ fontFamily: monoFont, fontSize: "0.68rem", color: DIM }}>
                            {perm.key}
                          </Typography>
                        </Stack>
                      </TableCell>
                      {roles.map((r) => {
                        const ch = channelOf(r.key);
                        const locked = isLocked(r.key, perm.key);
                        const checked = draft[r.key]?.has(perm.key) ?? false;
                        return (
                          <TableCell
                            key={r.key}
                            align="center"
                            sx={{ width: laneWidth, bgcolor: rgba(ch.accent, 0.06), py: 0.75 }}
                          >
                            <ButtonBase
                              focusRipple
                              disabled={locked}
                              aria-label={`${r.label} — ${perm.label}`}
                              aria-pressed={checked}
                              onClick={() => toggle(r.key, perm.key)}
                              sx={{
                                width: 30,
                                height: 30,
                                borderRadius: 2,
                                transition: "transform .16s, background-color .16s, border-color .16s",
                                ...(checked
                                  ? {
                                      bgcolor: ch.accent,
                                      color: textOn(ch.accent),
                                      boxShadow: `0 4px 12px -5px ${rgba(ch.accent, 0.95)}`,
                                    }
                                  : {
                                      bgcolor: "rgba(255,255,255,0.06)",
                                      color: "transparent",
                                      border: `1.5px solid rgba(255,255,255,0.20)`,
                                    }),
                                "&:hover": locked
                                  ? {}
                                  : { transform: "scale(1.14)", borderColor: ch.accent },
                                "&.Mui-disabled": { opacity: 1, bgcolor: rgba(ch.accent, 0.12) },
                              }}
                            >
                              {locked ? (
                                <LockRoundedIcon sx={{ fontSize: 15, color: rgba(ch.accent, 0.75) }} />
                              ) : checked ? (
                                <CheckRoundedIcon sx={{ fontSize: 18 }} />
                              ) : null}
                            </ButtonBase>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Save bar — always visible, states the saved/unsaved status ────── */}
      <Paper
        variant="outlined"
        sx={{
          position: "sticky",
          bottom: 16,
          zIndex: 5,
          mt: 2.5,
          px: 2.5,
          py: 1.5,
          borderRadius: 3,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          bgcolor: PANEL,
          borderColor: dirty ? alpha(SIGNAL, 0.5) : LINE,
          boxShadow: dirty ? "0 16px 38px -18px rgba(0,0,0,0.75)" : "none",
          transition: "box-shadow .2s, border-color .2s",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {dirty ? (
            <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: SIGNAL }} />
          ) : (
            <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "success.main" }} />
          )}
          <Typography
            variant="body2"
            sx={{ color: dirty ? TXT : DIM, fontWeight: dirty ? 600 : 400 }}
          >
            {dirty
              ? `${changeCount} unsaved ${changeCount === 1 ? "change" : "changes"}`
              : "All changes saved"}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            onClick={discard}
            disabled={!dirty || saving}
            color="inherit"
            startIcon={<RestartAltRoundedIcon />}
          >
            Discard
          </Button>
          <Button
            onClick={save}
            disabled={!dirty || saving}
            variant="contained"
            disableElevation
            startIcon={<SaveRoundedIcon />}
            sx={{ bgcolor: SIGNAL, color: INK, "&:hover": { bgcolor: "#ff7d36" }, px: 2.5 }}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </Box>
      </Paper>

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
      <Snackbar
        open={!!notice}
        autoHideDuration={3500}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setNotice(null)} variant="filled">
          {notice}
        </Alert>
      </Snackbar>
    </Box>
  );
}

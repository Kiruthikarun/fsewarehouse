"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { PANEL, monoFont } from "@/theme/theme";
import { darkFieldSx } from "@/components/data/DataKit";
import { channelOf, initialsOf, rgba, textOn } from "./console";
import type { Member, RoleKey, RoleOption } from "./types";

// Dark control-room tokens — shared language with the data pages / chart panels.
const TXT = "#e8edf6";
const DIM = "rgba(232,237,246,0.62)";
const LINE = "rgba(232,237,246,0.10)";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  OPERATOR: "Operator",
};

export function MembersTab({
  members,
  roles,
  currentUserId,
}: {
  members: Member[];
  roles: RoleOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (ROLE_LABEL[u.role] ?? u.role).toLowerCase().includes(q),
    );
  }, [members, query]);

  const distribution = useMemo(
    () =>
      roles.map((r) => ({
        ...r,
        count: members.filter((m) => m.role === r.key).length,
      })),
    [roles, members],
  );
  const total = members.length || 1;

  async function changeRole(target: Member, role: RoleKey) {
    if (role === target.role) return;
    setSavingId(target.id);
    setError(null);
    const res = await fetch(`/api/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setSavingId(null);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to update role");
      return;
    }
    setNotice(`${target.name} is now ${ROLE_LABEL[role] ?? role}.`);
    router.refresh();
  }

  return (
    <Box>
      {/* ── Console bar: filter + role-distribution signal bar ─────────────── */}
      <Paper
        variant="outlined"
        sx={{
          mb: 3,
          p: 2,
          borderRadius: 3,
          bgcolor: PANEL,
          borderColor: LINE,
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
          gap: { xs: 2.5, sm: 5 },
        }}
      >
        <TextField
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter personnel…"
          sx={{ width: { xs: "100%", sm: 300 }, ...darkFieldSx }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 18, color: DIM }} />
                </InputAdornment>
              ),
            },
          }}
        />

        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
            <Typography
              sx={{
                fontFamily: monoFont,
                fontSize: "0.62rem",
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: DIM,
              }}
            >
              Role distribution
            </Typography>
            <Typography sx={{ fontFamily: monoFont, fontSize: "0.7rem", fontWeight: 700, color: TXT }}>
              {members.length} members
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              height: 10,
              borderRadius: 5,
              overflow: "hidden",
              bgcolor: "rgba(255,255,255,0.08)",
            }}
          >
            {distribution.map((d) =>
              d.count === 0 ? null : (
                <Box
                  key={d.key}
                  title={`${d.label}: ${d.count}`}
                  sx={{
                    width: `${(d.count / total) * 100}%`,
                    bgcolor: channelOf(d.key).accent,
                    transition: "width .3s",
                  }}
                />
              ),
            )}
          </Box>
          <Stack direction="row" sx={{ flexWrap: "wrap", mt: 1, gap: "4px 16px" }}>
            {distribution.map((d) => (
              <Box key={d.key} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: 0.5, bgcolor: channelOf(d.key).accent }} />
                <Typography sx={{ fontSize: "0.72rem", color: DIM }}>
                  {d.label}
                </Typography>
                <Typography sx={{ fontFamily: monoFont, fontSize: "0.72rem", fontWeight: 700, color: TXT }}>
                  {d.count}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Paper>

      {/* ── Personnel roster ───────────────────────────────────────────────── */}
      <Typography
        sx={{
          px: 0.5,
          mb: 1,
          fontFamily: monoFont,
          fontSize: "0.62rem",
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: DIM,
        }}
      >
        Personnel · {filtered.length}
      </Typography>

      {filtered.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ borderRadius: 3, borderStyle: "dashed", borderColor: LINE, bgcolor: PANEL, py: 8, textAlign: "center" }}
        >
          <Typography variant="body2" sx={{ color: DIM }}>
            {query ? "No personnel match your filter." : "No members yet."}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {filtered.map((u, i) => {
            const ch = channelOf(u.role);
            const isSelf = u.id === currentUserId;
            const saving = savingId === u.id;
            return (
              <Paper
                key={u.id}
                variant="outlined"
                className="console-rise"
                style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                sx={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 3,
                  px: 2,
                  py: 1.5,
                  bgcolor: PANEL,
                  borderColor: LINE,
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  transition: "border-color .2s, box-shadow .2s",
                  "&:hover": {
                    borderColor: "rgba(255,255,255,0.22)",
                    boxShadow: "0 8px 24px -14px rgba(0,0,0,0.7)",
                  },
                }}
              >
                {/* channel rail */}
                <Box sx={{ position: "absolute", insetBlock: 0, left: 0, width: 4, bgcolor: ch.accent }} />

                {/* monogram */}
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2.5,
                    fontFamily: monoFont,
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: textOn(ch.accent),
                    background: `linear-gradient(135deg, ${ch.accent}, ${rgba(ch.accent, 0.6)})`,
                    boxShadow: `0 6px 16px -8px ${rgba(ch.accent, 0.9)}`,
                  }}
                >
                  {initialsOf(u.name)}
                </Avatar>

                {/* identity */}
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography noWrap sx={{ fontWeight: 600, color: TXT }}>
                      {u.name}
                    </Typography>
                    {isSelf && (
                      <Chip
                        label="You"
                        size="small"
                        sx={{
                          height: 18,
                          bgcolor: "rgba(255,255,255,0.12)",
                          color: TXT,
                          fontFamily: monoFont,
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          "& .MuiChip-label": { px: 0.75 },
                        }}
                      />
                    )}
                  </Box>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 0.25, fontFamily: monoFont, fontSize: "0.7rem", color: DIM }}
                  >
                    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.email}
                    </Box>
                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" }, color: "rgba(255,255,255,0.25)" }}>
                      ·
                    </Box>
                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" }, whiteSpace: "nowrap" }}>
                      joined {new Date(u.createdAt).toISOString().slice(0, 10)}
                    </Box>
                  </Stack>
                </Box>

                {/* role control */}
                {isSelf ? (
                  <Chip
                    icon={<LockRoundedIcon sx={{ fontSize: "14px !important" }} />}
                    label={ch.code}
                    sx={{
                      fontFamily: monoFont,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      border: `1px solid ${rgba(ch.accent, 0.45)}`,
                      bgcolor: rgba(ch.accent, 0.14),
                      color: ch.accent,
                      "& .MuiChip-icon": { color: "inherit" },
                    }}
                  />
                ) : (
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={u.role}
                    disabled={saving}
                    onChange={(_, val: RoleKey | null) => val && changeRole(u, val)}
                    sx={{
                      bgcolor: "rgba(255,255,255,0.05)",
                      borderRadius: 2.5,
                      p: 0.5,
                      gap: 0.5,
                      "& .MuiToggleButton-root": {
                        border: 0,
                        borderRadius: "10px !important",
                        px: 1.25,
                        py: 0.75,
                        fontFamily: monoFont,
                        fontWeight: 700,
                        fontSize: "0.68rem",
                        letterSpacing: "0.06em",
                        color: DIM,
                        "&:hover": { bgcolor: "rgba(255,255,255,0.1)", color: TXT },
                      },
                    }}
                  >
                    {roles.map((r) => {
                      const rch = channelOf(r.key);
                      return (
                        <ToggleButton
                          key={r.key}
                          value={r.key}
                          title={r.label}
                          aria-label={r.label}
                          sx={{
                            "&.Mui-selected": {
                              bgcolor: rch.accent,
                              color: textOn(rch.accent),
                              boxShadow: `0 4px 12px -6px ${rgba(rch.accent, 0.9)}`,
                              "&:hover": { bgcolor: rch.accent },
                            },
                          }}
                        >
                          {rch.code}
                        </ToggleButton>
                      );
                    })}
                  </ToggleButtonGroup>
                )}
              </Paper>
            );
          })}
        </Stack>
      )}

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

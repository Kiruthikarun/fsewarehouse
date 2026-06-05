"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import { SIGNAL } from "@/theme/theme";
import { MembersTab } from "./MembersTab";
import { AccessControlTab } from "./AccessControlTab";
import type { Matrix, Member, PermGroup, RoleKey, RoleOption } from "./types";

export function SettingsClient({
  currentUserId,
  currentUserRole,
  members,
  groups,
  roles,
  matrix,
}: {
  currentUserId: string;
  currentUserRole: RoleKey;
  organisationName: string;
  members: Member[];
  groups: PermGroup[];
  roles: RoleOption[];
  matrix: Matrix;
}) {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 3,
          minHeight: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": {
            minHeight: 0,
            py: 1.5,
            px: 2,
            textTransform: "none",
            fontWeight: 600,
            color: "text.secondary",
          },
          "& .Mui-selected": { color: `${SIGNAL} !important` },
          "& .MuiTabs-indicator": { backgroundColor: SIGNAL, height: 2.5 },
        }}
      >
        <Tab icon={<GroupRoundedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Members" />
        <Tab
          icon={<ShieldRoundedIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label="Roles & Access"
        />
      </Tabs>

      {tab === 0 && (
        <MembersTab members={members} roles={roles} currentUserId={currentUserId} />
      )}
      {tab === 1 && (
        <AccessControlTab
          groups={groups}
          roles={roles}
          matrix={matrix}
          currentUserRole={currentUserRole}
        />
      )}
    </Box>
  );
}

import { SettingsSkeleton } from "@/components/data/DataSkeletons";

// Streamed instantly while the Settings page awaits members + permission matrix.
export default function SettingsLoading() {
  return <SettingsSkeleton />;
}

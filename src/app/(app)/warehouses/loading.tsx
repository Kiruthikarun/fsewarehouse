import { DataPageSkeleton } from "@/components/data/DataSkeletons";

// Streamed instantly while the Warehouses page awaits its Postgres queries.
export default function WarehousesLoading() {
  return (
    <DataPageSkeleton
      controls={1}
      minWidth={640}
      cols={[
        { lead: true }, // Warehouse (icon + name)
        {}, // Location
        { width: 110, align: "right" }, // Capacity
        { width: 90, align: "right" }, // SKUs
        { width: 80, align: "right" }, // actions
      ]}
    />
  );
}

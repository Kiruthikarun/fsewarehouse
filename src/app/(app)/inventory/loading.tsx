import { DataPageSkeleton } from "@/components/data/DataSkeletons";

// Streamed instantly while the Inventory page awaits its Postgres queries.
export default function InventoryLoading() {
  return (
    <DataPageSkeleton
      controls={2}
      minWidth={720}
      cols={[
        { width: 130 }, // SKU
        {}, // Item
        {}, // Warehouse
        { width: 120, align: "right" }, // Quantity
        { width: 80, align: "right" }, // actions
      ]}
    />
  );
}

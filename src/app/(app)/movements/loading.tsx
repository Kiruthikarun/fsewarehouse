import { DataPageSkeleton } from "@/components/data/DataSkeletons";

// Streamed instantly while the Movements ledger awaits its Postgres queries.
export default function MovementsLoading() {
  return (
    <DataPageSkeleton
      controls={2}
      minWidth={820}
      rows={9}
      cols={[
        { width: 150 }, // When
        { width: 110 }, // Type
        { width: 80 }, // SKU
        {}, // Item
        {}, // Warehouse
        { width: 70, align: "right" }, // Qty
        { width: 110 }, // Operator
        { width: 56, align: "right" }, // actions
      ]}
    />
  );
}

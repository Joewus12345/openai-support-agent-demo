import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { AnimatePresence, motion } from "framer-motion";

// type TableFiltersProps<TData> = {
//   table: import("@tanstack/react-table").Table<TData>;
//   open: boolean;
//   onClear: () => void;
// };

export function TableFilters({
  table,
  open,
  onToggle,
  onClear,
}: {
  table: any;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  function hasColumn(table: any, id: string) {
    return table.getAllLeafColumns().some((col: any) => col.id === id);
  }

  const state = table.getState();

  const hasActiveFilters =
    !!state.globalFilter ||
    state.columnFilters.length > 0 ||
    state.sorting.length > 0;

  function formatFilterValue(value: unknown) {
    if (value == null || value === "") return "";

    // Date range filter
    if (typeof value === "object" && value !== null) {
      const v = value as { from?: string; to?: string };

      if (v.from && v.to) return `${v.from} → ${v.to}`;
      if (v.from) return `From ${v.from}`;
      if (v.to) return `To ${v.to}`;

      return "";
    }

    // Primitive values
    return String(value);
  }

  function prettifyColumnId(id: string) {
    return id.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onToggle}>
          {open ? "−" : "+"} Filters
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={!hasActiveFilters}
          onClick={onClear}
        >
          Clear all filters
        </Button>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {/* Global search chip */}
          {table.getState().globalFilter && (
            <Badge variant="secondary" className="gap-1">
              Search: {String(table.getState().globalFilter)}
              <button
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={() => table.setGlobalFilter("")}
              >
                ✕
              </button>
            </Badge>
          )}

          {/* Column filter chips */}
          {table.getState().columnFilters.map((filter: any) => {
            const label = formatFilterValue(filter.value);
            if (!label) return null;

            return (
              <Badge key={filter.id} variant="secondary" className="gap-1">
                {prettifyColumnId(filter.id)}: {label}
                <button
                  className="ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => table.getColumn(filter.id)?.setFilterValue("")}
                >
                  ✕
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid gap-4 rounded-md border bg-muted/30 p-4 md:grid-cols-3">
              {/* Global Search */}
              <Input
                placeholder="Search everything..."
                value={table.getState().globalFilter ?? ""}
                onChange={(e) => table.setGlobalFilter(e.target.value)}
                className="max-w-sm"
              />

              {/* Script */}
              {hasColumn(table, "script") && (
                <Input
                  placeholder="Search by script..."
                  value={
                    (table.getColumn("script")?.getFilterValue() as string) ??
                    ""
                  }
                  onChange={(e) =>
                    table.getColumn("script")?.setFilterValue(e.target.value)
                  }
                />
              )}

              {/* Filename */}
              {hasColumn(table, "name") && (
                <Input
                  placeholder="Search by filename..."
                  value={
                    (table.getColumn("name")?.getFilterValue() as string) ?? ""
                  }
                  onChange={(e) =>
                    table.getColumn("name")?.setFilterValue(e.target.value)
                  }
                />
              )}

              {/* Status */}
              {hasColumn(table, "status") && (
                <div className="flex flex-row gap-2 items-center">
                  <Label className="text-sm text-muted-foreground items-center">
                    Status
                  </Label>
                  <Select
                    value={
                      (table.getColumn("status")?.getFilterValue() as string) ??
                      "all"
                    }
                    onValueChange={(v) =>
                      table
                        .getColumn("status")
                        ?.setFilterValue(v === "all" ? "" : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="running">Running</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* File type */}
              {hasColumn(table, "type") && (
                <div className="flex flex-row gap-2 items-center">
                  <Label className="text-sm text-muted-foreground items-center">
                    File Type
                  </Label>
                  <Select
                    value={
                      (table.getColumn("type")?.getFilterValue() as string) ??
                      "all"
                    }
                    onValueChange={(v) =>
                      table
                        .getColumn("type")
                        ?.setFilterValue(v === "all" ? "" : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="File type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="md">Markdown</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="txt">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Created at */}
              {hasColumn(table, "createdAt") && (
                <>
                  <div className="flex flex-col gap-1 items-center w-full">
                    <Label className="text-sm text-muted-foreground items-center">
                      Created From
                    </Label>
                    <Input
                      type="date"
                      onChange={(e) =>
                        table.getColumn("createdAt")?.setFilterValue({
                          ...(table.getColumn("createdAt")?.getFilterValue() ??
                            {}),
                          from: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1 items-center w-full">
                    <Label className="text-sm text-muted-foreground items-center">
                      Created To
                    </Label>
                    <Input
                      type="date"
                      onChange={(e) =>
                        table.getColumn("createdAt")?.setFilterValue({
                          ...(table.getColumn("createdAt")?.getFilterValue() ??
                            {}),
                          to: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              )}

              {/* Created at */}
              {hasColumn(table, "modifiedAt") && (
                <>
                  <div className="flex flex-col gap-1 items-center w-full">
                    <Label className="text-sm text-muted-foreground items-center">
                      Updated From
                    </Label>
                    <Input
                      type="date"
                      onChange={(e) =>
                        table.getColumn("modifiedAt")?.setFilterValue({
                          ...(table.getColumn("modifiedAt")?.getFilterValue() ??
                            {}),
                          from: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1 items-center w-full">
                    <Label className="text-sm text-muted-foreground items-center">
                      Updated To
                    </Label>
                    <Input
                      type="date"
                      onChange={(e) =>
                        table.getColumn("modifiedAt")?.setFilterValue({
                          ...(table.getColumn("modifiedAt")?.getFilterValue() ??
                            {}),
                          to: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

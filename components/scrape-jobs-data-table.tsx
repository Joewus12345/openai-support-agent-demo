"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  UniqueIdentifier,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableFilters } from "@/components/TableFilters";
import {
  IconChevronDown,
  IconGripVertical,
  IconLayoutColumns,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export type ScrapeJobDisplayRow = {
  id: string;
  keywords: string;
  script: React.ReactNode;
  target: React.ReactNode;
  status: React.ReactNode;
  cadence: React.ReactNode;
  timing: React.ReactNode;
  docs: React.ReactNode;
  log: React.ReactNode;
  actions: React.ReactNode;

  // these are (recommended) when building rows in page.tsx so we can filter/sort properly.
  scriptText?: string;
  targetText?: string;
  statusText?: string;
};

interface ScrapeJobsDataTableProps {
  rows: ScrapeJobDisplayRow[];
  loading?: boolean;
  pageSize?: number;
}

// const DEFAULT_PAGE_SIZE = 10;

function DragHandle({ id }: { id: UniqueIdentifier }) {
  const { attributes, listeners, setNodeRef } = useSortable({ id });

  return (
    <Button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:bg-transparent"
      title="Drag to reorder"
      onClick={(e) => e.stopPropagation()}
    >
      <IconGripVertical className="size-3 text-muted-foreground" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  );
}

function DraggableRow<TData>({ row }: { row: Row<TData> }) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.id,
    // disabled: true
  });

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}

function ColumnsMenu({
  table,
}: {
  table: ReturnType<typeof useReactTable<any>>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <IconLayoutColumns className="size-4" />
          Columns
          <IconChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PaginationBar({
  table,
}: {
  table: ReturnType<typeof useReactTable<any>>;
}) {
  return (
    <div className="flex flex-col gap-3 border-t bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        Page{" "}
        <span className="font-medium text-foreground">
          {table.getState().pagination.pageIndex + 1}
        </span>{" "}
        of{" "}
        <span className="font-medium text-foreground">
          {Math.max(table.getPageCount(), 1)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows</span>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue placeholder="10" />
            </SelectTrigger>
            <SelectContent align="end">
              {[10, 20, 30, 50, 100].map((n) => (
                <SelectItem key={n} value={`${n}`}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronsLeft className="size-4" />
            <span className="sr-only">First page</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronLeft className="size-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <IconChevronRight className="size-4" />
            <span className="sr-only">Next page</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <IconChevronsRight className="size-4" />
            <span className="sr-only">Last page</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ScrapeJobsDataTable({
  rows,
  loading = false,
}: ScrapeJobsDataTableProps) {
  // local data state needed for DnD reorder
  const [data, setData] = React.useState<ScrapeJobDisplayRow[]>(rows);
  React.useEffect(() => setData(rows), [rows]);

  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [globalFilter, setGlobalFilter] = React.useState("");

  const dragEnabled =
    sorting.length === 0 && columnFilters.length === 0 && globalFilter === "";

  const columns = React.useMemo<ColumnDef<ScrapeJobDisplayRow>[]>(
    () => [
      {
        id: "drag",
        header: () => null,
        cell: ({ row }) => (dragEnabled ? <DragHandle id={row.id} /> : null),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },

      // Hidden-ish “text” columns so filter/sort works reliably
      {
        accessorKey: "scriptText",
        header: () => null,
        cell: () => null,
        enableHiding: true,
        enableSorting: false,
      },
      {
        accessorKey: "statusText",
        header: () => null,
        cell: () => null,
        enableHiding: true,
        enableSorting: false,
      },

      // Visible columns (keep original content)
      {
        id: "script",
        header: "Script",
        cell: ({ row }) => row.original.script,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "target",
        header: "Target",
        cell: ({ row }) => row.original.target,
        enableSorting: false,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => row.original.status,
        enableSorting: false,
      },
      {
        id: "cadence",
        header: "Cadence & schedule",
        cell: ({ row }) => row.original.cadence,
        enableSorting: false,
      },
      {
        id: "timing",
        header: "Timing",
        cell: ({ row }) => row.original.timing,
        enableSorting: false,
      },
      {
        id: "docs",
        header: "Docs",
        cell: ({ row }) => row.original.docs,
        enableSorting: false,
      },
      {
        id: "log",
        header: "Log snippet",
        cell: ({ row }) => row.original.log,
        enableSorting: false,
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => (
          <div className="text-right">{row.original.actions}</div>
        ),
        enableSorting: false,
      },
    ],
    [dragEnabled]
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    autoResetPageIndex: false,
    state: {
      sorting,
      columnVisibility,
      pagination,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,

    // IMPORTANT: global filter uses row.keywords (you already provide it)
    globalFilterFn: (row, _columnId, filterValue) => {
      const term = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!term) return true;
      const hay = String(row.original.keywords ?? "").toLowerCase();
      return hay.includes(term);
    },

    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const ids = React.useMemo<UniqueIdentifier[]>(
    () => data.map((r) => r.id),
    [data]
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;

    setData((prev) => {
      const oldIndex = prev.findIndex((x) => x.id === active.id);
      const newIndex = prev.findIndex((x) => x.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Past jobs</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <ColumnsMenu table={table} />
        </div>

        <TableFilters
          table={table}
          open={filtersOpen}
          onToggle={() => setFiltersOpen((v) => !v)}
          onClear={() => {
            setGlobalFilter("");
            setColumnFilters([]);
            setSorting([]);
          }}
        />

        {/* This wrapper fixes the overflow issue (same pattern as dashboard) */}
        <div className="overflow-hidden rounded-lg border">
          <div className="w-full overflow-x-auto">
            <DndContext
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              sensors={sensors}
              onDragEnd={onDragEnd}
            >
              <Table className="min-w-[880px]">
                <TableHeader className="bg-muted/40">
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>

                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={table.getVisibleLeafColumns().length}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Loading jobs…
                      </TableCell>
                    </TableRow>
                  ) : table.getRowModel().rows.length ? (
                    <SortableContext
                      items={dragEnabled ? ids : []}
                      strategy={verticalListSortingStrategy}
                    >
                      {table.getRowModel().rows.map((row) => (
                        <DraggableRow
                          key={row.id}
                          row={row}
                          // dragEnabled={dragEnabled}
                        />
                      ))}
                    </SortableContext>
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={table.getVisibleLeafColumns().length}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No jobs found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </DndContext>
          </div>

          <PaginationBar table={table} />
        </div>
      </CardContent>
    </Card>
  );
}

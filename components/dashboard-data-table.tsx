"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  // IconCircleCheckFilled,
  // IconDotsVertical,
  IconGripVertical,
  IconLayoutColumns,
  // IconLoader,
  // IconPlus,
  // IconTrendingUp,
} from "@tabler/icons-react";
import {
  flexRender,
  getCoreRowModel,
  // getFacetedRowModel,
  // getFacetedUniqueValues,
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
// import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
// import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { z } from "zod";
// import {
//   ChartContainer,
//   ChartTooltip,
//   ChartTooltipContent,
//   type ChartConfig,
// } from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  // DropdownMenuItem,
  // DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { Input } from "./ui/input";
import type { SortingFn } from "@tanstack/react-table";
import { TableFilters } from "./TableFilters";
import { FilterFn } from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";

export type DashboardJobRow = {
  id: string;
  script: string;
  status: string;
  target: string;
  createdAt: string;
  finishedAt: string | null;
};

export type DashboardFileRow = {
  name: string;
  size: number;
  modifiedAt: string;
  type: string;
};

const humanFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export const JobSchema = z.object({
  id: z.string(),
  script: z.string(),
  status: z.string(),
  target: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});

export const dateRangeFilter: FilterFn<any> = (row, columnId, value) => {
  if (!value?.from && !value?.to) return true;

  const rowDate = new Date(row.getValue(columnId)).getTime();
  if (value.from && rowDate < new Date(value.from).getTime()) return false;
  if (value.to && rowDate > new Date(value.to).getTime()) return false;

  return true;
};

// Create a separate component for the drag handle
function DragHandle({ id }: { id: UniqueIdentifier }) {
  const { attributes, listeners, setNodeRef } = useSortable({
    id,
  });

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
    // disabled: true,
  });

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition,
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

export function DashboardDataTable({
  jobs,
  files,
  loadingJobs = false,
  loadingFiles = false,
}: {
  jobs: DashboardJobRow[];
  files: DashboardFileRow[];
  loadingJobs?: boolean;
  loadingFiles?: boolean;
}) {
  // const isMobile = useIsMobile();
  // const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  // const [fileContents, setFileContents] = React.useState<
  //   Record<string, string>
  // >({});
  // const [loadingContent, setLoadingContent] = React.useState(false);
  const [jobsFiltersOpen, setJobsFiltersOpen] = React.useState(false);
  const [filesFiltersOpen, setFilesFiltersOpen] = React.useState(false);

  // IMPORTANT: local “data state” is required for drag reorder (we reorder arrays)
  const [jobsData, setJobsData] = React.useState<DashboardJobRow[]>(jobs);
  const [filesData, setFilesData] = React.useState<DashboardFileRow[]>(files);

  React.useEffect(() => setJobsData(jobs), [jobs]);
  React.useEffect(() => setFilesData(files), [files]);

  // Sensors used by tables
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const router = useRouter();
  const searchParams = useSearchParams();

  const syncTableToUrl = React.useCallback(
    (
      key: string,
      state: {
        globalFilter: any;
        columnFilters: any[];
        sorting: any[];
      }
    ) => {
      const params = new URLSearchParams(searchParams.toString());

      if (state.globalFilter) {
        params.set(`${key}_q`, String(state.globalFilter));
      } else {
        params.delete(`${key}_q`);
      }

      if (state.columnFilters.length) {
        params.set(`${key}_filters`, JSON.stringify(state.columnFilters));
      } else {
        params.delete(`${key}_filters`);
      }

      if (state.sorting.length) {
        params.set(`${key}_sort`, JSON.stringify(state.sorting));
      } else {
        params.delete(`${key}_sort`);
      }

      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // const loadFile = async (file: DashboardFileRow) => {
  //   if (fileContents[file.name]) return;
  //   try {
  //     setLoadingContent(true);
  //     const response = await fetch(`/knowledge_base/${file.name}`);
  //     const text = await response.text();
  //     setFileContents((prev) => ({ ...prev, [file.name]: text }));
  //   } catch (error) {
  //     console.error("Failed to load file", error);
  //   } finally {
  //     setLoadingContent(false);
  //   }
  // };

  function FileDrawerCell({ file }: { file: DashboardFileRow }) {
    const isMobile = useIsMobile();
    const [open, setOpen] = React.useState(false);
    const [content, setContent] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    const loadFile = async () => {
      if (content) return;
      try {
        setLoading(true);
        const response = await fetch(`/knowledge_base/${file.name}`);
        const text = await response.text();
        setContent(text);
      } catch {
        setContent("Failed to load file");
      } finally {
        setLoading(false);
      }
    };

    return (
      <Drawer
        open={open}
        direction={isMobile ? "bottom" : "right"}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) loadFile();
        }}
      >
        <DrawerTrigger asChild>
          <Button
            variant="link"
            className="px-0 text-left w-fit text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {file.name}
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="gap-1">
            <DrawerTitle>{file.name}</DrawerTitle>
            <DrawerDescription>Markdown Preview</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6 text-sm">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading content…</p>
            ) : content ? (
              <ReactMarkdown className="prose prose-sm max-w-none break-words">
                {content}
              </ReactMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                Open the file name to preview its contents.
              </p>
            )}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  // Tanstack Table for Jobs
  const [jobsColumnVisibility, setJobsColumnVisibility] =
    React.useState<VisibilityState>({});
  const [jobsSorting, setJobsSorting] = React.useState<SortingState>([]);
  const [jobsPagination, setJobsPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [jobscolumnFilters, setJobsColumnFilters] =
    React.useState<ColumnFiltersState>([]);
  const [jobsglobalFilter, setJobsGlobalFilter] = React.useState("");

  const isJobsDragEnabled =
    jobsSorting.length === 0 &&
    jobscolumnFilters.length === 0 &&
    jobsglobalFilter === "";

  // For sorting date and time values in jobs table
  const jobsdateSortingFn: SortingFn<DashboardJobRow> = (
    rowA,
    rowB,
    columnId
  ) => {
    const a = rowA.getValue<string | null>(columnId);
    const b = rowB.getValue<string | null>(columnId);

    if (!a && !b) return 0;
    if (!a) return 1; // nulls go last
    if (!b) return -1;

    const dateA = new Date(a).getTime();
    const dateB = new Date(b).getTime();

    return dateA - dateB;
  };

  const jobsColumns = React.useMemo<ColumnDef<DashboardJobRow>[]>(
    () => [
      {
        id: "drag",
        header: () => null,
        cell: ({ row }) =>
          isJobsDragEnabled ? <DragHandle id={row.id} /> : null,
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "script",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Script
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.script}
          </span>
        ),
        enableHiding: false,
        enableSorting: true,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Status
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className="capitalize text-muted-foreground px-2"
          >
            {row.original.status.replace(/_/g, " ")}
          </Badge>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "target",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Target
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.target || "—"}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Created
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.createdAt}
          </span>
        ),
        enableSorting: true,
        sortingFn: jobsdateSortingFn,
        filterFn: dateRangeFilter,
      },
      {
        accessorKey: "finishedAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Finished
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.finishedAt || "—"}
          </span>
        ),
        enableSorting: true,
        sortingFn: jobsdateSortingFn,
      },
    ],
    [isJobsDragEnabled]
  );

  const jobsTable = useReactTable({
    data: jobsData,
    columns: jobsColumns,
    getRowId: (row) => row.id, // row.id becomes TanStack row id
    autoResetPageIndex: false,
    state: {
      sorting: jobsSorting,
      columnVisibility: jobsColumnVisibility,
      pagination: jobsPagination,
      columnFilters: jobscolumnFilters,
      globalFilter: jobsglobalFilter,
    },
    onSortingChange: setJobsSorting,
    onColumnVisibilityChange: setJobsColumnVisibility,
    onPaginationChange: setJobsPagination,
    onColumnFiltersChange: setJobsColumnFilters,
    onGlobalFilterChange: setJobsGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const jobIds = React.useMemo<UniqueIdentifier[]>(
    () => jobsData.map((j) => j.id),
    [jobsData]
  );

  function handleJobsDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;

    setJobsData((prev) => {
      const oldIndex = prev.findIndex((x) => x.id === active.id);
      const newIndex = prev.findIndex((x) => x.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const jobsUrlState = React.useMemo(
    () => ({
      globalFilter: jobsglobalFilter,
      columnFilters: jobscolumnFilters,
      sorting: jobsSorting,
    }),
    [jobsglobalFilter, jobscolumnFilters, jobsSorting]
  );

  // Tanstack table for Files
  const [filesColumnVisibility, setFilesColumnVisibility] =
    React.useState<VisibilityState>({});
  const [filesSorting, setFilesSorting] = React.useState<SortingState>([]);
  const [filesPagination, setFilesPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [filescolumnFilters, setFilesColumnFilters] =
    React.useState<ColumnFiltersState>([]);
  const [filesglobalFilter, setFilesGlobalFilter] = React.useState("");

  const isFilesDragEnabled =
    filesSorting.length === 0 &&
    filescolumnFilters.length === 0 &&
    filesglobalFilter === "";

  // For sorting date and time values in jobs table
  const filesdateSortingFn: SortingFn<DashboardFileRow> = (
    rowA,
    rowB,
    columnId
  ) => {
    const a = rowA.getValue<string | null>(columnId);
    const b = rowB.getValue<string | null>(columnId);

    if (!a && !b) return 0;
    if (!a) return 1; // nulls go last
    if (!b) return -1;

    const dateA = new Date(a).getTime();
    const dateB = new Date(b).getTime();

    return dateA - dateB;
  };

  const filesColumns = React.useMemo<ColumnDef<DashboardFileRow>[]>(
    () => [
      {
        id: "drag",
        header: () => null,
        cell: ({ row }) =>
          isFilesDragEnabled ? <DragHandle id={row.id} /> : null,
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            File name
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            <FileDrawerCell file={row.original} />
          </span>
        ),
        enableHiding: false,
        enableSorting: true,
      },
      {
        accessorKey: "type",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Type
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <Badge variant="outline" className="px-2 text-muted-foreground">
            {row.original.type || "md"}
          </Badge>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "size",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Size
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {humanFileSize(row.original.size)}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "modifiedAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Updated
            {column.getIsSorted() === "asc" && " ↑"}
            {column.getIsSorted() === "desc" && " ↓"}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.modifiedAt}
          </span>
        ),
        enableSorting: true,
        sortingFn: filesdateSortingFn,
        filterFn: dateRangeFilter,
      },
    ],
    [isFilesDragEnabled]
  );

  const filesTable = useReactTable({
    data: filesData,
    columns: filesColumns,
    getRowId: (row) => `${row.name}-${row.modifiedAt}`, // stable id for DnD + table
    autoResetPageIndex: false,
    state: {
      sorting: filesSorting,
      columnVisibility: filesColumnVisibility,
      pagination: filesPagination,
      columnFilters: filescolumnFilters,
      globalFilter: filesglobalFilter,
    },
    onSortingChange: setFilesSorting,
    onColumnVisibilityChange: setFilesColumnVisibility,
    onPaginationChange: setFilesPagination,
    onColumnFiltersChange: setFilesColumnFilters,
    onGlobalFilterChange: setFilesGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const fileIds = React.useMemo<UniqueIdentifier[]>(
    () => filesData.map((f) => `${f.name}-${f.modifiedAt}`),
    [filesData]
  );

  function handleFilesDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;

    setFilesData((prev) => {
      const oldIndex = prev.findIndex(
        (x) => `${x.name}-${x.modifiedAt}` === active.id
      );
      const newIndex = prev.findIndex(
        (x) => `${x.name}-${x.modifiedAt}` === over.id
      );
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const filesUrlState = React.useMemo(
    () => ({
      globalFilter: filesglobalFilter,
      columnFilters: filescolumnFilters,
      sorting: filesSorting,
    }),
    [filesglobalFilter, filescolumnFilters, filesSorting]
  );

  // const hasActiveJobFilters =
  //   jobsglobalFilter || jobscolumnFilters.length > 0 || jobsSorting.length > 0;

  React.useEffect(() => {
    syncTableToUrl("jobs", jobsUrlState);
  }, [jobsUrlState, syncTableToUrl]);

  React.useEffect(() => {
    syncTableToUrl("files", filesUrlState);
  }, [filesUrlState, syncTableToUrl]);

  React.useEffect(() => {
    const q = searchParams.get("jobs_q");
    const f = searchParams.get("jobs_filters");
    const s = searchParams.get("jobs_sort");

    if (q) setJobsGlobalFilter(q);
    if (f) setJobsColumnFilters(JSON.parse(f));
    if (s) setJobsSorting(JSON.parse(s));
  }, [searchParams]);

  React.useEffect(() => {
    const q = searchParams.get("files_q");
    const f = searchParams.get("files_filters");
    const s = searchParams.get("files_sort");

    if (q) setFilesGlobalFilter(q);
    if (f) setFilesColumnFilters(JSON.parse(f));
    if (s) setFilesSorting(JSON.parse(s));
  }, [searchParams]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Operational overview</CardTitle>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="jobs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="jobs">Scrape jobs</TabsTrigger>
            <TabsTrigger value="kb">Knowledge base</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-3">
            <div className="w-full overflow-x-auto">
              <ColumnsMenu table={jobsTable} />
            </div>

            <TableFilters
              table={jobsTable}
              open={jobsFiltersOpen}
              onToggle={() => setJobsFiltersOpen((v) => !v)}
              onClear={() => {
                setJobsGlobalFilter("");
                setJobsColumnFilters([]);
                setJobsSorting([]);
              }}
            />

            <div className="overflow-hidden rounded-lg border">
              <div className="w-full overflow-x-auto">
                <DndContext
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  sensors={sensors}
                  onDragEnd={handleJobsDragEnd}
                >
                  <Table className="min-w-[880px]">
                    <TableHeader className="bg-muted/40">
                      {jobsTable.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
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
                      {loadingJobs ? (
                        <TableRow>
                          <TableCell
                            colSpan={jobsTable.getVisibleLeafColumns().length}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            Loading jobs…
                          </TableCell>
                        </TableRow>
                      ) : jobsTable.getRowModel().rows.length ? (
                        <SortableContext
                          items={isJobsDragEnabled ? jobIds : []}
                          strategy={verticalListSortingStrategy}
                        >
                          {jobsTable.getRowModel().rows.map((row) => (
                            <DraggableRow<DashboardJobRow>
                              key={row.id}
                              row={row}
                            />
                          ))}
                        </SortableContext>
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={jobsTable.getVisibleLeafColumns().length}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No job history found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </DndContext>
              </div>

              <PaginationBar table={jobsTable} />
            </div>
          </TabsContent>

          <TabsContent value="kb" className="space-y-3">
            <div className="flex items-center justify-end">
              <ColumnsMenu table={filesTable} />
            </div>

            <TableFilters
              table={filesTable}
              open={filesFiltersOpen}
              onToggle={() => setFilesFiltersOpen((v) => !v)}
              onClear={() => {
                setFilesGlobalFilter("");
                setFilesColumnFilters([]);
                setFilesSorting([]);
              }}
            />

            <div className="overflow-hidden rounded-lg border">
              <div className="w-full overflow-x-auto">
                <DndContext
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  sensors={sensors}
                  onDragEnd={handleFilesDragEnd}
                >
                  <Table className="min-w-[780px]">
                    <TableHeader className="bg-muted/40">
                      {filesTable.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
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
                      {loadingFiles ? (
                        <TableRow>
                          <TableCell
                            colSpan={filesTable.getVisibleLeafColumns().length}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            Loading files…
                          </TableCell>
                        </TableRow>
                      ) : filesTable.getRowModel().rows.length ? (
                        <SortableContext
                          items={isFilesDragEnabled ? fileIds : []}
                          strategy={verticalListSortingStrategy}
                        >
                          {filesTable.getRowModel().rows.map((row) => (
                            <DraggableRow<DashboardFileRow>
                              key={row.id}
                              row={row}
                            />
                          ))}
                        </SortableContext>
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={filesTable.getVisibleLeafColumns().length}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No files available.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </DndContext>
              </div>

              <PaginationBar table={filesTable} />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function DashboardDataTableSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Operational overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="jobs">
          <TabsList>
            <TabsTrigger value="jobs">Scrape jobs</TabsTrigger>
            <TabsTrigger value="kb">Knowledge base</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs" className="space-y-3">
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableBody>
                  {Array.from({ length: 10 }).map((_, index) => (
                    <TableRow key={`job-skeleton-${index}`}>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="kb" className="space-y-3">
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableBody>
                  {Array.from({ length: 10 }).map((_, index) => (
                    <TableRow key={`kb-skeleton-${index}`}>
                      <TableCell>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

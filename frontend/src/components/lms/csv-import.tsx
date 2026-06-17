"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface CsvRow {
  [key: string]: string;
}

interface CsvImportProps {
  onComplete: () => void;
}

export function CsvImport({ onComplete }: CsvImportProps) {
  const { session } = useAuth();
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  async function preview() {
    if (!csv.trim()) return;
    setLoading(true);
    const result = await api.roster["import-preview"]({ csv: csv.trim() });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else setRows(result.rows ?? []);
  }

  async function doImport() {
    if (!session || !rows || rows.length === 0) return;
    setImporting(true);
    const results = await Promise.all(
      rows.map((row) => api.roster.import({ session, rows: [row] })),
    );
    setImporting(false);
    const errors = results.filter((r) => "error" in r);
    if (errors.length > 0) {
      toast.error(`${errors.length} row(s) failed to import`);
    } else {
      toast.success(`Imported ${results.length} seat(s)`);
      onComplete();
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Paste CSV (with header row)</p>
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="externalKey,email,rosterName,kind,section&#10;jdoe,jdoe@school.edu,John Doe,STUDENT,sec01"
          rows={6}
          className="font-mono text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={preview}
          disabled={loading || !csv.trim()}
        >
          {loading ? "Parsing..." : "Preview"}
        </Button>
      </div>

      {rows !== null && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">
              {rows.length} row(s) parsed
            </p>
            <Button
              size="sm"
              onClick={doImport}
              disabled={importing || rows.length === 0}
            >
              <Upload className="size-4 mr-1" />
              {importing ? "Importing..." : `Import ${rows.length} seats`}
            </Button>
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.keys(rows[0] ?? {}).map((key) => (
                    <TableHead key={key} className="text-xs">
                      {key}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {Object.values(row).map((v, j) => (
                      <TableCell key={j} className="text-xs font-mono">
                        {v}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

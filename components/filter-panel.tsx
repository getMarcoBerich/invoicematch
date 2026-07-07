"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hr } from "@/lib/i18n/hr";

export type FilterState = {
  search: string;
  client: string;
  payerKey: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  dateField: "invoice" | "payment";
  amountMin: string;
  amountMax: string;
  confidenceMin: string;
};

export const defaultFilters: FilterState = {
  search: "",
  client: "all",
  payerKey: "all",
  status: "all",
  dateFrom: "",
  dateTo: "",
  dateField: "invoice",
  amountMin: "",
  amountMax: "",
  confidenceMin: "",
};

type FilterPanelProps = {
  filters: FilterState;
  clients: string[];
  payerKeys: string[];
  onChange: (filters: FilterState) => void;
};

export function FilterPanel({ filters, clients, payerKeys, onChange }: FilterPanelProps) {
  const update = (partial: Partial<FilterState>) => onChange({ ...filters, ...partial });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="search">{hr.filter.search}</Label>
        <Input
          id="search"
          placeholder={hr.filter.searchPlaceholder}
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{hr.filter.client}</Label>
        <Select value={filters.client} onValueChange={(v) => update({ client: v ?? "all" })}>
          <SelectTrigger>
            <SelectValue placeholder={hr.filter.allClients} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{hr.filter.allClients}</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c} value={c}>
                {c.length > 40 ? `${c.slice(0, 40)}…` : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{hr.filter.payerKey}</Label>
        <Select value={filters.payerKey} onValueChange={(v) => update({ payerKey: v ?? "all" })}>
          <SelectTrigger>
            <SelectValue placeholder={hr.filter.allPayerKeys} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{hr.filter.allPayerKeys}</SelectItem>
            {payerKeys.map((key) => (
              <SelectItem key={key} value={key}>
                {key.length > 40 ? `${key.slice(0, 40)}…` : key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{hr.filter.matchStatus}</Label>
        <Select value={filters.status} onValueChange={(v) => update({ status: v ?? "all" })}>
          <SelectTrigger>
            <SelectValue placeholder={hr.filter.allStatuses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{hr.filter.all}</SelectItem>
            <SelectItem value="auto">{hr.filter.statusAuto}</SelectItem>
            <SelectItem value="manual">{hr.filter.statusManual}</SelectItem>
            <SelectItem value="overridden">{hr.filter.statusOverridden}</SelectItem>
            <SelectItem value="unmatched">{hr.filter.statusUnmatched}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{hr.filter.dateField}</Label>
        <Select
          value={filters.dateField}
          onValueChange={(v) => update({ dateField: (v as "invoice" | "payment") ?? "invoice" })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="invoice">{hr.filter.invoiceDate}</SelectItem>
            <SelectItem value="payment">{hr.filter.paymentDate}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="dateFrom">{hr.filter.from}</Label>
          <Input
            id="dateFrom"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateTo">{hr.filter.to}</Label>
          <Input
            id="dateTo"
            type="date"
            value={filters.dateTo}
            onChange={(e) => update({ dateTo: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="amountMin">{hr.filter.minAmount}</Label>
          <Input
            id="amountMin"
            type="number"
            step="0.01"
            value={filters.amountMin}
            onChange={(e) => update({ amountMin: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amountMax">{hr.filter.maxAmount}</Label>
          <Input
            id="amountMax"
            type="number"
            step="0.01"
            value={filters.amountMax}
            onChange={(e) => update({ amountMax: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confidenceMin">{hr.filter.minConfidence}</Label>
        <Input
          id="confidenceMin"
          type="number"
          min="0"
          max="100"
          value={filters.confidenceMin}
          onChange={(e) => update({ confidenceMin: e.target.value })}
        />
      </div>
    </div>
  );
}

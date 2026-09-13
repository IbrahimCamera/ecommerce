import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

interface OrderRow {
  id: string;
  public_order_id: string;
  firstname: string;
  familyname: string;
  to_wilaya_name: string;
  to_commune_name: string;
  price: number;
  delivery_fee: number;
  status: "pending" | "confirmed" | "pushed" | "failed" | "cancelled";
  failure_reason: string | null;
  created_at: string;
}

interface ShipmentInfo {
  order_id: string;
  tracking: string | null;
  label_url: string | null;
}

const STATUS_LABELS: Record<OrderRow["status"], string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  pushed: "Envoyée",
  failed: "Échec",
  cancelled: "Annulée",
};

const STATUS_COLORS: Record<OrderRow["status"], string> = {
  pending: "text-amber-600",
  confirmed: "text-blue-600",
  pushed: "text-green-700",
  failed: "text-red-600",
  cancelled: "text-slate-400",
};

export function OrdersList() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [shipments, setShipments] = useState<Record<string, ShipmentInfo>>({});
  const [statusFilter, setStatusFilter] = useState<OrderRow["status"] | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("id, public_order_id, firstname, familyname, to_wilaya_name, to_commune_name, price, delivery_fee, status, failure_reason, created_at")
      .order("created_at", { ascending: false });
    const rows = data ?? [];
    setOrders(rows);

    if (rows.length > 0) {
      const { data: shipmentRows } = await supabase
        .from("shipments")
        .select("order_id, tracking, label_url")
        .in("order_id", rows.map((r) => r.id));
      const map: Record<string, ShipmentInfo> = {};
      for (const s of shipmentRows ?? []) map[s.order_id] = s;
      setShipments(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const visibleOrders = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === visibleOrders.length ? new Set() : new Set(visibleOrders.map((o) => o.id))));
  }

  async function handleDelete() {
    setActionError(null);
    setActionMessage(null);

    const ids = [...selected];
    if (ids.length === 0) return;

    const pushedCount = ids.filter((id) => orders.find((o) => o.id === id)?.status === "pushed").length;
    const confirmMessage =
      pushedCount > 0
        ? `Supprimer définitivement ${ids.length} commande(s) ? ${pushedCount} d'entre elles ont déjà été envoyées à Yalidine : le colis restera actif chez le transporteur, mais vous perdrez le suivi (tracking/étiquette) dans l'application. Cette action est irréversible.`
        : `Supprimer définitivement ${ids.length} commande(s) ? Cette action est irréversible.`;
    if (!window.confirm(confirmMessage)) return;

    setBusy(true);
    const { error } = await supabase.from("orders").delete().in("id", ids);
    setBusy(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    setActionMessage(`${ids.length} commande(s) supprimée(s).`);
    setSelected(new Set());
    void refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Commandes</h1>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "confirmed", "pushed", "failed", "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-sm ${
              statusFilter === s ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {s === "all" ? "Toutes" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {actionMessage && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{actionMessage}</p>}
      {actionError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void handleDelete()}
          disabled={busy || selected.size === 0}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
        >
          Supprimer
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size === visibleOrders.length && visibleOrders.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-3 py-2">Commande</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Destination</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Colis</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => {
                const shipment = shipments[order.id];
                return (
                  <tr key={order.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(order.id)} onChange={() => toggleSelect(order.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{order.public_order_id}</td>
                    <td className="px-3 py-2">{order.firstname} {order.familyname}</td>
                    <td className="px-3 py-2">{order.to_commune_name}, {order.to_wilaya_name}</td>
                    <td className="px-3 py-2">{order.price + order.delivery_fee} DA</td>
                    <td className="px-3 py-2">
                      <span className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</span>
                      {order.status === "failed" && order.failure_reason && (
                        <p className="text-xs text-red-500">{order.failure_reason}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {shipment?.label_url ? (
                        <a href={shipment.label_url} target="_blank" rel="noreferrer" className="text-slate-900 underline">
                          Étiquette ({shipment.tracking})
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleOrders.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">Aucune commande.</p>}
        </div>
      )}
    </div>
  );
}

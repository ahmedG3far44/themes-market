/* useAsync.run is stable; the modal expiry is initialized when opened. */
/* oxlint-disable react-hooks/exhaustive-deps, react/purity */
import type { DiscountType, PaginatedResponse } from "@shared/types";
import { Edit3, Percent, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../../components/admin/page-header";
import { ErrorMessage } from "../../components/ui/error-message";
import { Spinner } from "../../components/ui/spinner";
import { TableSkeleton } from "../../components/ui/skeleton";
import { useToast } from "../../context/toast-store";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { ErrorState } from "../error/error";

export default function DiscountsPage() { 
    const [search, setSearch] = useState(""); 

    const [editing, setEditing] = useState<DiscountType | "new" | null>(null); 

    const request = useAsync<PaginatedResponse<DiscountType>>(); 

    const action = useAsync<unknown>(); 

    const { notify } = useToast(); 
    
    const load = useCallback(() => request.run(api.get(`/admin/discounts?search=${encodeURIComponent(search)}`)).catch(() => undefined), [search, request.run]); 
    
    useEffect(() => { void load(); }, [load]); 

    const remove = async (item: DiscountType) => { 
        if (!window.confirm(`Delete discount ${item.code}? Existing order snapshots remain unchanged.`)) return; 

        try { 
            await action.run(api.delete(`/admin/discounts/${item.id}`)); 
            notify("Discount deleted"); 
            await load(); 
        } catch { 
            return;
        } 
    };

    if (request.error) return <ErrorState
        title="We couldn’t load discounts"
        message={request.error}
        onRetry={() => void load()}
        retryLabel="Reload discounts"
        backTo="/admin"
        backLabel="Back to insights"
    />;

    return <main className="admin-page">
        <PageHeader eyebrow="Promotions" title="Discounts" description="Create percentage codes with clear validity windows and optional redemption limits." actions={<button className="primary-button" onClick={() => setEditing("new")}><Plus size={17} />New discount</button>} />{action.error && <ErrorMessage message={action.error} onDismiss={action.clearError} />}<section className="panel data-panel"><div className="filters-row"><div className="search-box"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search discount code" /></div></div>{request.isLoading && !request.data ? <TableSkeleton columns={6} /> : !request.data?.items.length ? <div className="empty-state"><Percent size={25} />No discounts yet.</div> : <div className="table-scroll"><table><thead><tr><th>Code</th><th>Value</th><th>Validity</th><th>Redemptions</th><th>Status</th><th>Actions</th></tr></thead><tbody>{request.data.items.map((item) => { const expired = new Date(item.expiresAt) <= new Date(); return <tr key={item.id}><td><strong className="code-chip">{item.code}</strong></td><td>{item.percentage}% off</td><td><small>{item.startsAt ? dateTime(item.startsAt) : "Immediately"}<br />to {dateTime(item.expiresAt)}</small></td><td>{item.redemptionCount} / {item.usageLimit ?? "∞"}</td><td><span className={`status-pill ${item.active && !expired ? "active" : "blocked"}`}>{expired ? "expired" : item.active ? "active" : "inactive"}</span></td><td><div className="row-actions"><button className="icon-button" onClick={() => setEditing(item)} aria-label="Edit"><Edit3 size={17} /></button><button className="icon-button danger" onClick={() => void remove(item)} aria-label="Delete"><Trash2 size={17} /></button></div></td></tr>; })}</tbody></table></div>}</section>{editing && <DiscountModal item={editing === "new" ? undefined : editing} loading={action.isLoading} onClose={() => setEditing(null)} onSave={async (body) => { try { await action.run(editing === "new" ? api.post("/admin/discounts", body) : api.put(`/admin/discounts/${editing.id}`, body)); notify(editing === "new" ? "Discount created" : "Discount updated"); setEditing(null); await load(); } catch { return; } }} />}
    </main>; }


function DiscountModal({ item, loading, onClose, onSave }: { item?: DiscountType; loading: boolean; onClose: () => void; onSave: (body: unknown) => Promise<void> }) { const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16); const [form, setForm] = useState({ code: item?.code ?? "", percentage: String(item?.percentage ?? 10), startsAt: item?.startsAt?.slice(0, 16) ?? "", expiresAt: item?.expiresAt.slice(0, 16) ?? tomorrow, usageLimit: item?.usageLimit ? String(item.usageLimit) : "", active: item?.active ?? true }); const update = (name: string, value: string | boolean) => setForm((v) => ({ ...v, [name]: value })); const generate = async () => { const value = await api.post<{ code: string }>("/admin/discounts/generate"); update("code", value.code); }; const submit = (e: FormEvent) => { e.preventDefault(); void onSave({ code: form.code, percentage: Number(form.percentage), startsAt: form.startsAt || undefined, expiresAt: form.expiresAt, usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined, active: form.active }); }; return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">Promotion</span><h2>{item ? "Edit discount" : "New discount"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="form-stack"><label>Code<div className="input-action"><input required value={form.code} onChange={(e) => update("code", e.target.value.toUpperCase())} /><button type="button" className="secondary-button" onClick={() => void generate()}><Sparkles size={15} />Generate</button></div></label><label>Percentage off<input required type="number" min="1" max="100" value={form.percentage} onChange={(e) => update("percentage", e.target.value)} /></label><div className="form-grid"><label>Starts at<input type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} /></label><label>Expires at<input required type="datetime-local" value={form.expiresAt} onChange={(e) => update("expiresAt", e.target.value)} /></label></div><label>Redemption limit (optional)<input type="number" min="1" value={form.usageLimit} onChange={(e) => update("usageLimit", e.target.value)} /></label><label className="check-label"><input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} />Code is active</label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={loading}>{loading && <Spinner size="sm" />}Save discount</button></div></form></div>; }

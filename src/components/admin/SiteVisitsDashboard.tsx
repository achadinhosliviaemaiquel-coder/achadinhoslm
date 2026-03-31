import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const supabase = getSupabase();

type DailyCount = { date: string; visits: number };

type VisitsData = {
  today: number;
  yesterday: number;
  days7: number;
  days14: number;
  days30: number;
  daily30: DailyCount[];
};

async function fetchVisits(): Promise<VisitsData> {
  const now = new Date();

  function daysAgo(n: number) {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  const todayStart = daysAgo(0);
  const yesterdayStart = daysAgo(1);
  const days7Start = daysAgo(7);
  const days14Start = daysAgo(14);
  const days30Start = daysAgo(30);

  const [r30] = await Promise.all([
    supabase
      .from("page_views")
      .select("created_at")
      .gte("created_at", days30Start),
  ]);

  const rows: { created_at: string }[] = r30.data ?? [];

  function countFrom(from: string, to?: string) {
    return rows.filter((r) => {
      const t = r.created_at;
      return t >= from && (!to || t < to);
    }).length;
  }

  const today = countFrom(todayStart);
  const yesterday = countFrom(yesterdayStart, todayStart);
  const days7 = countFrom(days7Start);
  const days14 = countFrom(days14Start);
  const days30 = rows.length;

  // Agrega por dia (últimos 30)
  const dailyMap: Record<string, number> = {};
  rows.forEach((r) => {
    const day = r.created_at.slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + 1;
  });

  const daily30: DailyCount[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily30.push({ date: key, visits: dailyMap[key] ?? 0 });
  }

  return { today, yesterday, days7, days14, days30, daily30 };
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString("pt-BR")}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Trend({ today, yesterday }: { today: number; yesterday: number }) {
  if (yesterday === 0) return null;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600">
        <TrendingUp className="h-3 w-3" /> +{pct}% vs ontem
      </span>
    );
  if (pct < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-500">
        <TrendingDown className="h-3 w-3" /> {pct}% vs ontem
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" /> igual a ontem
    </span>
  );
}

function MiniBar({ daily }: { daily: DailyCount[] }) {
  const max = Math.max(...daily.map((d) => d.visits), 1);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Últimos 30 dias
      </p>
      <div className="flex items-end gap-px h-16">
        {daily.map((d) => {
          const h = Math.round((d.visits / max) * 100);
          return (
            <div
              key={d.date}
              className="flex-1 bg-primary/70 rounded-sm transition-all"
              style={{ height: `${Math.max(h, d.visits > 0 ? 4 : 1)}%` }}
              title={`${d.date}: ${d.visits} visitas`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{daily[0]?.date.slice(5)}</span>
        <span>{daily[daily.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export default function SiteVisitsDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["site-visits"],
    queryFn: fetchVisits,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Erro ao carregar dados. A tabela <code>page_views</code> pode ainda não existir no banco.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-1 md:col-span-1">
          <p className="text-xs text-muted-foreground">Hoje</p>
          <p className="text-2xl font-bold tabular-nums">
            {data.today.toLocaleString("pt-BR")}
          </p>
          <Trend today={data.today} yesterday={data.yesterday} />
        </div>
        <StatCard
          label="Últimos 7 dias"
          value={data.days7}
          sub={`~${Math.round(data.days7 / 7)} / dia`}
        />
        <StatCard
          label="Últimos 14 dias"
          value={data.days14}
          sub={`~${Math.round(data.days14 / 14)} / dia`}
        />
        <StatCard
          label="Últimos 30 dias"
          value={data.days30}
          sub={`~${Math.round(data.days30 / 30)} / dia`}
        />
      </div>

      {/* Gráfico de barras mini */}
      <div className="bg-muted/50 border border-border rounded-xl p-4">
        <MiniBar daily={data.daily30} />
      </div>

      {/* Aviso se sem dados */}
      {data.days30 === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Nenhuma visita registrada ainda. O tracking começa a funcionar após o deploy.
        </p>
      )}
    </div>
  );
}

'use client';

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap, ResponsiveContainer, Tooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { Loader2, Sparkles, RefreshCw, TrendingUp, TrendingDown, Zap, Clock, ArrowUpRight, Building2 } from 'lucide-react';

interface Article {
  title: string;
  snippet: string;
  source?: string;
}

interface TrendData {
  name: string;
  value: number;
  signal?: 'emerging' | 'growing' | 'established' | 'declining';
  labs?: string[];
}

interface TrendResponse {
  trends: TrendData[];
  summary?: string;
}

import ReactMarkdown from 'react-markdown';

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------
const SIGNAL_COLORS: Record<string, { bg: string; text: string; border: string; icon: any; label: string }> = {
  emerging:    { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200', icon: Zap,          label: 'Emerging' },
  growing:     { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: TrendingUp,   label: 'Growing' },
  established: { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   icon: Building2,    label: 'Established' },
  declining:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  icon: TrendingDown, label: 'Declining' },
};

const TREEMAP_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd',  // purples
  '#3b82f6', '#60a5fa', '#93c5fd',               // blues
  '#10b981', '#34d399', '#6ee7b7',               // greens
];

const LAB_COLORS: Record<string, string> = {
  'Google Research': '#4285F4',
  'Google DeepMind': '#4285F4',
  'OpenAI': '#10a37f',
  'Anthropic': '#d4a574',
  'Microsoft Research': '#00a4ef',
  'Meta AI': '#0668E1',
  'x.AI': '#1DA1F2',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SignalBadge({ signal }: { signal: string }) {
  const s = SIGNAL_COLORS[signal] || SIGNAL_COLORS.emerging;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${s.bg} ${s.text} ${s.border} border`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function TrendScoreRing({ value, size = 44 }: { value: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 70 ? '#6366f1' : value >= 40 ? '#3b82f6' : '#94a3b8';

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-1000 ease-out" />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        className="fill-gray-800 text-[11px] font-bold" transform={`rotate(90, ${size / 2}, ${size / 2})`}>
        {value}
      </text>
    </svg>
  );
}

// Custom Treemap content renderer
function TreemapContent(props: any) {
  const { x, y, width, height, name, value, index } = props;
  if (width < 40 || height < 30) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6}
        fill={TREEMAP_COLORS[index % TREEMAP_COLORS.length]}
        stroke="#fff" strokeWidth={2} className="transition-opacity hover:opacity-80" />
      {width > 60 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle"
            className="fill-white text-[11px] font-semibold" style={{ pointerEvents: 'none' }}>
            {name?.length > 14 ? name.substring(0, 12) + '…' : name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle"
            className="fill-white/70 text-[10px]" style={{ pointerEvents: 'none' }}>
            {value}
          </text>
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function TrendChart({ articles }: { articles: Article[] }) {
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const analyzeTrends = async () => {
    if (articles.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const subset = articles.slice(0, 50);
      const titles = subset.map(a => a.title);
      const snippets = subset.map(a => a.snippet);

      const res = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles, snippets }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch trends');
      }

      const data: TrendResponse = await res.json();
      if (data.trends) {
        setTrends(data.trends);
        setSummary(data.summary || null);
      } else if (Array.isArray(data)) {
        setTrends(data as any);
      }
      setAnalyzed(true);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze trends.');
    } finally {
      setLoading(false);
    }
  };

  // ---- Loading / Error / Empty states ----
  if (!isMounted) {
    return <div className="h-[250px] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button onClick={analyzeTrends} className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 rounded-full shadow-sm hover:shadow-md transition-all text-sm font-medium text-red-600">
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  if (!analyzed && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">AI-Powered Trend Analysis</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-sm text-center">
          Analyze {articles.length} articles across all labs to discover emerging themes, cross-lab convergence, and strategic signals.
        </p>
        <button onClick={analyzeTrends}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-105 transition-all text-sm font-medium">
          <Sparkles className="w-4 h-4" /> Analyze with Gemini
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative w-20 h-20 mb-6">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        </div>
        <p className="text-sm text-gray-600 font-medium">Analyzing research patterns…</p>
        <p className="text-xs text-gray-400 mt-1">Processing {articles.length} articles</p>
      </div>
    );
  }

  // ---- Derived data ----
  const radarData = trends.map(t => ({ subject: t.name, score: t.value, fullMark: 100 }));
  const treemapData = trends.map(t => ({ name: t.name, size: t.value }));

  // Count labs per trend for the convergence visual
  const allLabs = Array.from(new Set(trends.flatMap(t => t.labs || [])));
  
  // Signal distribution for pie chart
  const signalCounts: Record<string, number> = {};
  trends.forEach(t => { signalCounts[t.signal || 'growing'] = (signalCounts[t.signal || 'growing'] || 0) + 1; });
  const pieData = Object.entries(signalCounts).map(([signal, count]) => ({ name: signal, value: count }));
  const PIE_COLORS: Record<string, string> = { emerging: '#8b5cf6', growing: '#10b981', established: '#3b82f6', declining: '#f59e0b' };

  // ---- Rendered dashboard ----
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Row 1: Radar + Signal Distribution + Topic Treemap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Radar Chart */}
        <Card className="border-gray-100 shadow-sm col-span-1 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Topic Radar</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pb-4">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Topic Treemap */}
        <Card className="border-gray-100 shadow-sm col-span-1 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Topic Landscape</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={260}>
              <Treemap data={treemapData} dataKey="size" nameKey="name" content={<TreemapContent />}>
                <Tooltip
                  formatter={(value: number) => [`Score: ${value}`, 'Relevance']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                />
              </Treemap>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Trend Cards with Signal + Score + Labs */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider px-1">Trend Signals</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trends.map((trend, i) => (
            <div key={trend.name}
              className="group relative bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md hover:border-gray-200 transition-all duration-300"
              style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">{trend.name}</h4>
                  </div>
                  {trend.signal && <SignalBadge signal={trend.signal} />}
                </div>
                <TrendScoreRing value={trend.value} />
              </div>

              {/* Lab pills */}
              {trend.labs && trend.labs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
                  {trend.labs.map(lab => (
                    <span key={lab} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-100">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LAB_COLORS[lab] || '#9ca3af' }} />
                      {lab.replace(' Research', '').replace(' AI', '')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Signal Distribution Pie + Lab Convergence Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Signal Distribution */}
        <Card className="border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Signal Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} strokeWidth={0}>
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {pieData.map(entry => {
                const s = SIGNAL_COLORS[entry.name];
                return (
                  <div key={entry.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[entry.name] }} />
                    <span className="text-gray-600 capitalize">{entry.name}</span>
                    <span className="font-semibold text-gray-900">{entry.value}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Lab Convergence Matrix */}
        <Card className="border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Lab Convergence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-gray-400 pb-2 pr-2">Topic</th>
                    {allLabs.map(lab => (
                      <th key={lab} className="text-center font-medium text-gray-400 pb-2 px-1" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxWidth: '20px' }}>
                        {lab.replace(' Research', '').replace(' AI', '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trends.slice(0, 6).map(trend => (
                    <tr key={trend.name} className="border-t border-gray-50">
                      <td className="py-1.5 pr-2 font-medium text-gray-700 truncate max-w-[120px]">{trend.name}</td>
                      {allLabs.map(lab => {
                        const active = trend.labs?.includes(lab);
                        return (
                          <td key={lab} className="text-center py-1.5 px-1">
                            <span className={`inline-block w-4 h-4 rounded ${active ? 'bg-indigo-500' : 'bg-gray-100'} transition-colors`}
                              style={active ? { backgroundColor: LAB_COLORS[lab] || '#6366f1' } : {}} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Strategic Summary (collapsible) */}
      {summary && (
        <Card className="border-gray-100 shadow-sm overflow-hidden">
          <button onClick={() => setShowSummary(!showSummary)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
            <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Strategic Analysis</span>
            <ArrowUpRight className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${showSummary ? 'rotate-90' : ''}`} />
          </button>
          {showSummary && (
            <CardContent className="pt-0 pb-6 animate-in slide-in-from-top-2 duration-300">
              <div className="prose prose-sm prose-indigo max-w-none">
                <ReactMarkdown>{summary}</ReactMarkdown>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
